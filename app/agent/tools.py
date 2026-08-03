"""Agent tools. Built per-request so every tool is scoped to the caller's
notebook + user (isolation is enforced at the retrieval layer, not the prompt).

Each tool is (OpenAI function schema, async executor). Executors return the
string that becomes the tool message content; document/web results also append
to the shared `citations` pool so the answer's [n] markers can be resolved.
"""

import json
from collections.abc import Awaitable, Callable

import httpx
from sqlalchemy import select

from app.config import get_settings
from app.db.models import Chunk, Source
from app.db.session import get_sessionmaker
from app.llm.client import get_llm
from app.rag.store import get_vector_store

ToolExecutor = Callable[[dict], Awaitable[str]]

SNIPPET_LEN = 700


def build_tools(
    notebook_id: str, user_id: str, citations: list[dict]
) -> tuple[list[dict], dict[str, ToolExecutor]]:
    settings = get_settings()
    schemas: list[dict] = []
    executors: dict[str, ToolExecutor] = {}

    async def search_documents(args: dict) -> str:
        query = str(args.get("query", "")).strip()
        if not query:
            return "[]"
        llm = get_llm()
        [embedding] = await llm.embed([query])
        hits = await get_vector_store().search(
            notebook_id, user_id, embedding, k=settings.retrieval_top_k
        )
        if not hits:
            return "[]"
        chunk_ids = [cid for cid, _ in hits]
        async with get_sessionmaker()() as db:
            rows = (
                await db.execute(
                    select(Chunk, Source.filename)
                    .join(Source, Chunk.source_id == Source.id)
                    .where(Chunk.id.in_(chunk_ids), Chunk.user_id == user_id)
                )
            ).all()
        by_id = {chunk.id: (chunk, filename) for chunk, filename in rows}
        results = []
        for cid, score in hits:
            if cid not in by_id:
                continue
            chunk, filename = by_id[cid]
            ref = len(citations) + 1
            citation = {
                "ref": ref,
                "kind": "document",
                "chunk_id": chunk.id,
                "source_id": chunk.source_id,
                "filename": filename,
                "page": (chunk.meta or {}).get("page"),
                "snippet": chunk.text[:SNIPPET_LEN],
                "score": round(score, 4),
            }
            citations.append(citation)
            results.append(
                {
                    "ref": ref,
                    "filename": filename,
                    "page": citation["page"],
                    "snippet": citation["snippet"],
                }
            )
        return json.dumps(results, ensure_ascii=False)

    schemas.append(
        {
            "type": "function",
            "function": {
                "name": "search_documents",
                "description": (
                    "Semantic search over the documents uploaded to this notebook. "
                    "Use this first for any question about the user's material. "
                    "Cite results in your answer as [ref]."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "Search query"}},
                    "required": ["query"],
                },
            },
        }
    )
    executors["search_documents"] = search_documents

    if settings.tavily_api_key:

        async def tavily_search(args: dict) -> str:
            query = str(args.get("query", "")).strip()
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": settings.tavily_api_key,
                        "query": query,
                        "max_results": 5,
                        "include_answer": False,
                    },
                )
                resp.raise_for_status()
            results = []
            for item in resp.json().get("results", []):
                ref = len(citations) + 1
                citations.append(
                    {
                        "ref": ref,
                        "kind": "web",
                        "url": item.get("url"),
                        "filename": item.get("title") or item.get("url"),
                        "snippet": (item.get("content") or "")[:SNIPPET_LEN],
                    }
                )
                results.append(
                    {
                        "ref": ref,
                        "title": item.get("title"),
                        "url": item.get("url"),
                        "snippet": (item.get("content") or "")[:SNIPPET_LEN],
                    }
                )
            return json.dumps(results, ensure_ascii=False)

        schemas.append(
            {
                "type": "function",
                "function": {
                    "name": "tavily_search",
                    "description": (
                        "Search the live web for fresh or external context not present in the "
                        "notebook's documents. Cite results in your answer as [ref]."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {"query": {"type": "string"}},
                        "required": ["query"],
                    },
                },
            }
        )
        executors["tavily_search"] = tavily_search

    from app.agent.mcp import get_mcp_tools

    for schema, name, executor in get_mcp_tools():
        if name not in executors:
            schemas.append(schema)
            executors[name] = executor

    return schemas, executors
