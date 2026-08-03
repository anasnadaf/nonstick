"""Semantic answer cache, strictly scoped per (user, notebook).

A repeat question (cosine similarity >= threshold against cached questions in
the same scope) returns the stored answer + citations without running the
agent. Backed by the pgvector `semantic_cache` table in postgres mode and an
in-process store otherwise.
"""

import json
import time
import uuid
from typing import Protocol

from sqlalchemy import text

from app.config import get_settings
from app.db.session import get_engine
from app.llm.client import cosine


class SemanticCache(Protocol):
    async def get(self, notebook_id: str, user_id: str, embedding: list[float]) -> dict | None: ...

    async def put(
        self,
        notebook_id: str,
        user_id: str,
        question: str,
        embedding: list[float],
        payload: dict,
    ) -> None: ...

    async def invalidate(self, notebook_id: str, user_id: str) -> None: ...


def _to_pgvector(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in vec) + "]"


class PgSemanticCache:
    async def get(self, notebook_id: str, user_id: str, embedding: list[float]) -> dict | None:
        s = get_settings()
        engine = get_engine()
        async with engine.connect() as conn:
            row = (
                await conn.execute(
                    text(
                        "SELECT answer_json, 1 - (embedding <=> CAST(:q AS vector)) AS score "
                        "FROM semantic_cache "
                        "WHERE notebook_id = :nb AND user_id = :u "
                        "AND created_at > now() - make_interval(secs => :ttl) "
                        "ORDER BY embedding <=> CAST(:q AS vector) LIMIT 1"
                    ),
                    {
                        "q": _to_pgvector(embedding),
                        "nb": notebook_id,
                        "u": user_id,
                        "ttl": s.cache_ttl_seconds,
                    },
                )
            ).first()
        if row and float(row.score) >= s.cache_similarity_threshold:
            return json.loads(row.answer_json)
        return None

    async def put(
        self,
        notebook_id: str,
        user_id: str,
        question: str,
        embedding: list[float],
        payload: dict,
    ) -> None:
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO semantic_cache "
                    "(id, notebook_id, user_id, question, embedding, answer_json) "
                    "VALUES (:id, :nb, :u, :q, CAST(:emb AS vector), :payload)"
                ),
                {
                    "id": uuid.uuid4().hex,
                    "nb": notebook_id,
                    "u": user_id,
                    "q": question[:2000],
                    "emb": _to_pgvector(embedding),
                    "payload": json.dumps(payload, ensure_ascii=False),
                },
            )

    async def invalidate(self, notebook_id: str, user_id: str) -> None:
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM semantic_cache WHERE notebook_id = :nb AND user_id = :u"),
                {"nb": notebook_id, "u": user_id},
            )


class LocalSemanticCache:
    def __init__(self) -> None:
        self._entries: dict[tuple[str, str], list[dict]] = {}

    async def get(self, notebook_id: str, user_id: str, embedding: list[float]) -> dict | None:
        s = get_settings()
        now = time.time()
        entries = self._entries.get((user_id, notebook_id), [])
        best, best_score = None, 0.0
        for entry in entries:
            if now - entry["ts"] > s.cache_ttl_seconds:
                continue
            score = cosine(embedding, entry["embedding"])
            if score > best_score:
                best, best_score = entry, score
        if best and best_score >= s.cache_similarity_threshold:
            return best["payload"]
        return None

    async def put(
        self,
        notebook_id: str,
        user_id: str,
        question: str,
        embedding: list[float],
        payload: dict,
    ) -> None:
        self._entries.setdefault((user_id, notebook_id), []).append(
            {"embedding": embedding, "payload": payload, "ts": time.time()}
        )

    async def invalidate(self, notebook_id: str, user_id: str) -> None:
        self._entries.pop((user_id, notebook_id), None)


_cache: SemanticCache | None = None


def get_semantic_cache() -> SemanticCache:
    global _cache
    if _cache is None:
        s = get_settings()
        _cache = PgSemanticCache() if s.is_postgres else LocalSemanticCache()
    return _cache


def reset_semantic_cache() -> None:
    global _cache
    _cache = None
