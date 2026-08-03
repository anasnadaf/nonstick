"""LangGraph tool-calling loop.

State carries OpenAI-format message dicts; the agent node streams tokens and
tool activity out through LangGraph's custom stream writer, which the SSE layer
forwards to the client as they happen.
"""

import json
import re
from collections.abc import AsyncIterator
from typing import TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph

from app.agent.tools import ToolExecutor
from app.config import get_settings
from app.llm.client import ChatEvent, get_llm

SYSTEM_PROMPT = """\
You are NonStick, a research and study assistant. You answer questions about the \
documents the user has uploaded to this notebook.

Rules:
- Ground answers in tool results. Use search_documents for anything about the user's \
material; use web search (when available) for fresh or external context.
- Cite evidence inline with bracketed reference numbers exactly as returned by the \
tools, e.g. "The study found X [1][3]."
- If the sources don't contain the answer, say so plainly instead of guessing.
- Be concise and structured; use markdown where it helps.
"""

_REF_RE = re.compile(r"\[(\d+)\]")


class AgentState(TypedDict):
    messages: list[dict]


def _tool_call_rounds(messages: list[dict]) -> int:
    return sum(1 for m in messages if m.get("role") == "assistant" and m.get("tool_calls"))


def build_graph(schemas: list[dict], executors: dict[str, ToolExecutor]):
    llm = get_llm()
    settings = get_settings()

    async def agent_node(state: AgentState) -> AgentState:
        writer = get_stream_writer()
        final = ChatEvent(type="final")
        async for ev in llm.stream_chat(state["messages"], tools=schemas or None):
            if ev.type == "token":
                writer({"type": "token", "text": ev.token})
            else:
                final = ev
        msg: dict = {"role": "assistant", "content": final.content}
        if final.tool_calls:
            msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": tc.arguments},
                }
                for tc in final.tool_calls
            ]
        return {"messages": state["messages"] + [msg]}

    async def tools_node(state: AgentState) -> AgentState:
        writer = get_stream_writer()
        out: list[dict] = []
        for tc in state["messages"][-1].get("tool_calls", []):
            name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            writer({"type": "tool_start", "tool": name, "args": args})
            executor = executors.get(name)
            if executor is None:
                result = json.dumps({"error": f"Unknown tool: {name}"})
            else:
                try:
                    result = await executor(args)
                except Exception as exc:
                    result = json.dumps({"error": str(exc)[:500]})
            writer({"type": "tool_end", "tool": name})
            out.append({"role": "tool", "tool_call_id": tc["id"], "content": result})
        return {"messages": state["messages"] + out}

    def route(state: AgentState) -> str:
        last = state["messages"][-1]
        if (
            last.get("tool_calls")
            and _tool_call_rounds(state["messages"]) <= settings.agent_max_iterations
        ):
            return "tools"
        return END

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tools_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", route, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile()


def resolve_citations(answer: str, pool: list[dict]) -> list[dict]:
    """Keep only the pool entries whose [n] marker actually appears in the answer."""
    cited = {int(m) for m in _REF_RE.findall(answer)}
    return [c for c in pool if c["ref"] in cited]


async def run_agent(
    question: str,
    history: list[dict],
    schemas: list[dict],
    executors: dict[str, ToolExecutor],
) -> AsyncIterator[dict]:
    """Yield streaming events; ends with {"type": "answer", "answer", "raw_citations"}."""
    graph = build_graph(schemas, executors)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": question},
    ]
    final_state: AgentState = {"messages": messages}
    async for mode, chunk in graph.astream(
        {"messages": messages}, stream_mode=["custom", "values"]
    ):
        if mode == "custom":
            yield chunk
        else:
            final_state = chunk  # type: ignore[assignment]
    answer = final_state["messages"][-1].get("content") or ""
    yield {"type": "answer", "answer": answer}
