"""Chat pipeline: guardrails → semantic cache → agent → scrub/citations/cache-store.

Yields event dicts the SSE layer forwards verbatim:
  {"type": "token" | "tool_start" | "tool_end" | "cached" | "citations"
          | "blocked" | "final"}
"""

import time
from collections.abc import AsyncIterator

from app.agent.graph import resolve_citations, run_agent
from app.agent.tools import build_tools
from app.config import get_settings
from app.llm.cache import get_semantic_cache
from app.llm.client import get_llm
from app.llm.guardrails import check_input, scrub_output
from app.obs import metrics
from app.obs.tracing import pipeline_span


async def run_chat_pipeline(
    question: str,
    history: list[dict],
    notebook_id: str,
    user_id: str,
) -> AsyncIterator[dict]:
    settings = get_settings()
    started = time.perf_counter()

    with pipeline_span("chat_pipeline", {"notebook_id": notebook_id}):
        verdict = check_input(question)
        if not verdict.allowed:
            metrics.GUARDRAIL_BLOCKS.labels("input_block").inc()
            metrics.CHAT_REQUESTS.labels("blocked").inc()
            yield {"type": "blocked", "stage": "input", "reason": verdict.reason}
            return

        embedding: list[float] | None = None
        if settings.cache_enabled:
            [embedding] = await get_llm().embed([question])
            hit = await get_semantic_cache().get(notebook_id, user_id, embedding)
            if hit is not None:
                metrics.CACHE_EVENTS.labels("hit").inc()
                metrics.CHAT_REQUESTS.labels("cached").inc()
                metrics.CHAT_LATENCY.observe(time.perf_counter() - started)
                yield {"type": "cached"}
                yield {"type": "token", "text": hit["answer"]}
                yield {"type": "citations", "citations": hit.get("citations", [])}
                yield {
                    "type": "final",
                    "answer": hit["answer"],
                    "citations": hit.get("citations", []),
                    "cached": True,
                }
                return
            metrics.CACHE_EVENTS.labels("miss").inc()

        citation_pool: list[dict] = []
        schemas, executors = build_tools(notebook_id, user_id, citation_pool)

        answer = ""
        try:
            async for event in run_agent(question, history, schemas, executors):
                if event["type"] == "answer":
                    answer = event["answer"]
                else:
                    if event["type"] == "tool_start":
                        metrics.TOOL_CALLS.labels(event["tool"]).inc()
                    yield event
        except Exception:
            metrics.CHAT_REQUESTS.labels("error").inc()
            raise

        answer, redactions = scrub_output(answer)
        if redactions:
            metrics.GUARDRAIL_BLOCKS.labels("output_redaction").inc(redactions)
        citations = resolve_citations(answer, citation_pool)

        if settings.cache_enabled and embedding is not None and answer:
            await get_semantic_cache().put(
                notebook_id,
                user_id,
                question,
                embedding,
                {"answer": answer, "citations": citations},
            )

        metrics.CHAT_REQUESTS.labels("answered").inc()
        metrics.CHAT_LATENCY.observe(time.perf_counter() - started)
        yield {"type": "citations", "citations": citations}
        yield {"type": "final", "answer": answer, "citations": citations, "cached": False}
