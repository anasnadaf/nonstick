"""Provider-agnostic LLM access.

All model routing goes through a LiteLLM Router so the provider is decided purely
by the MODEL / EMBEDDING_MODEL env values (openai/..., bedrock/..., gemini/...).
LLM_MOCK=1 swaps in a deterministic offline implementation that still exercises
the full agentic tool-calling loop, so tests and local dev need no API keys.
"""

import asyncio
import hashlib
import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.config import get_settings
from app.obs.metrics import record_usage


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str  # JSON string


@dataclass
class ChatEvent:
    """Streamed chat event: either a content token or the final assembled message."""

    type: str  # "token" | "final"
    token: str = ""
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)


def mock_embedding(text: str, dim: int) -> list[float]:
    seed = int.from_bytes(hashlib.sha256(text.strip().lower().encode()).digest()[:8], "big")
    rng = np.random.default_rng(seed)
    vec = rng.standard_normal(dim)
    vec /= np.linalg.norm(vec) or 1.0
    return vec.tolist()


class LLMClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._router = None

    # --- embeddings ---

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if self.settings.llm_mock:
            return [mock_embedding(t, self.settings.embedding_dim) for t in texts]
        router = self._get_router()
        resp = await router.aembedding(model="embedder", input=texts)
        data = sorted(resp.data, key=lambda d: d["index"])
        return [d["embedding"] for d in data]

    # --- chat ---

    async def stream_chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncIterator[ChatEvent]:
        if self.settings.llm_mock:
            async for ev in self._mock_stream(messages, tools):
                yield ev
            return

        router = self._get_router()
        stream = await router.acompletion(
            model="chat",
            messages=messages,
            tools=tools or None,
            temperature=self.settings.llm_temperature,
            max_tokens=self.settings.llm_max_tokens,
            stream=True,
            # Without this a streamed response carries no usage block, so the
            # LiteLLM success callback has nothing to report and the token and
            # cost counters stay at zero forever. Providers that don't support
            # it have the param dropped (see drop_params below).
            stream_options={"include_usage": True},
        )
        content_parts: list[str] = []
        tool_calls: dict[int, dict] = {}
        async for chunk in stream:
            # The usage block rides on a trailing chunk that carries no choices.
            # Account for it here rather than in litellm's success_callback,
            # which is never invoked for streaming calls made through a Router.
            if getattr(chunk, "usage", None):
                record_usage(chunk.usage, self.settings.model)
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta is None:
                continue
            if getattr(delta, "content", None):
                content_parts.append(delta.content)
                yield ChatEvent(type="token", token=delta.content)
            for tc in getattr(delta, "tool_calls", None) or []:
                slot = tool_calls.setdefault(tc.index, {"id": "", "name": "", "arguments": ""})
                if tc.id:
                    slot["id"] = tc.id
                if tc.function and tc.function.name:
                    slot["name"] = tc.function.name
                if tc.function and tc.function.arguments:
                    slot["arguments"] += tc.function.arguments
        yield ChatEvent(
            type="final",
            content="".join(content_parts),
            tool_calls=[
                ToolCall(id=v["id"] or f"call_{i}", name=v["name"], arguments=v["arguments"])
                for i, v in sorted(tool_calls.items())
            ],
        )

    async def complete(self, messages: list[dict]) -> str:
        """Non-streaming, tool-free completion (note generation, titles)."""
        final = ChatEvent(type="final")
        async for ev in self.stream_chat(messages, tools=None):
            if ev.type == "final":
                final = ev
        return final.content

    # --- internals ---

    def _get_router(self):
        if self._router is None:
            import litellm
            from litellm import Router

            # Keeps the provider-agnostic promise honest: params a given
            # provider does not accept are dropped rather than raising.
            litellm.drop_params = True

            s = self.settings
            self._router = Router(
                model_list=[
                    {"model_name": "chat", "litellm_params": {"model": s.model}},
                    {"model_name": "embedder", "litellm_params": {"model": s.embedding_model}},
                ],
                num_retries=2,
            )
        return self._router

    async def _mock_stream(
        self, messages: list[dict], tools: list[dict] | None
    ) -> AsyncIterator[ChatEvent]:
        """Deterministic offline model.

        Policy: with tools available and no tool results yet, request a document
        search for the user's question; once tool results are present, answer
        from them with [n] citations. Without tools, return canned markdown.
        """
        last = messages[-1]
        last_user = next((m for m in reversed(messages) if m["role"] == "user"), None)
        question = (last_user or {}).get("content", "")

        tool_names = [t["function"]["name"] for t in tools or []]
        if tools and "search_documents" in tool_names and last["role"] != "tool":
            yield ChatEvent(
                type="final",
                tool_calls=[
                    ToolCall(
                        id=f"call_{uuid.uuid4().hex[:8]}",
                        name="search_documents",
                        arguments=json.dumps({"query": question}),
                    )
                ],
            )
            return

        if last["role"] == "tool":
            try:
                results = json.loads(last.get("content") or "[]")
            except json.JSONDecodeError:
                results = []
            if results:
                refs = "".join(f"[{r['ref']}]" for r in results[:2])
                snippet = results[0].get("snippet", "")[:200]
                answer = (
                    f"Based on your documents {refs}: {snippet}".strip()
                    + f" (mock answer to: {question})"
                )
            else:
                answer = "I could not find anything relevant to that in this notebook's sources."
            for word in answer.split(" "):
                await asyncio.sleep(0)
                yield ChatEvent(type="token", token=word + " ")
            yield ChatEvent(type="final", content=answer)
            return

        canned = f"## Mock response\n\nDeterministic offline answer for: {question[:200]}"
        for word in canned.split(" "):
            await asyncio.sleep(0)
            yield ChatEvent(type="token", token=word + " ")
        yield ChatEvent(type="final", content=canned)


_client: LLMClient | None = None


def get_llm() -> LLMClient:
    global _client
    if _client is None:
        _client = LLMClient()
    return _client


def reset_llm() -> None:
    global _client
    _client = None


def cosine(a: list[float] | Any, b: list[float] | Any) -> float:
    va, vb = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb)) or 1.0
    return float(np.dot(va, vb) / denom)
