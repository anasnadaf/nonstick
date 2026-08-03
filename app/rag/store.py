"""Vector storage behind a small protocol.

PgVectorStore keeps embeddings in the `chunk_embeddings` pgvector table (created
by the initial migration). FaissStore is the zero-infra fallback: per-notebook
numpy matrices persisted under DATA_DIR, searched with FAISS when installed and
brute-force numpy otherwise. Chunk text/metadata always lives in the relational
`chunks` table; stores only ever see ids + vectors.
"""

import json
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
from sqlalchemy import text

from app.config import get_settings
from app.db.session import get_engine


@dataclass
class VectorItem:
    chunk_id: str
    notebook_id: str
    user_id: str
    embedding: list[float]


class VectorStore(Protocol):
    async def add(self, items: list[VectorItem]) -> None: ...

    async def search(
        self, notebook_id: str, user_id: str, query: list[float], k: int
    ) -> list[tuple[str, float]]: ...

    async def delete_chunks(self, notebook_id: str, user_id: str, chunk_ids: list[str]) -> None: ...

    async def delete_notebook(self, notebook_id: str, user_id: str) -> None: ...


def _to_pgvector(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in vec) + "]"


class PgVectorStore:
    async def add(self, items: list[VectorItem]) -> None:
        if not items:
            return
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO chunk_embeddings (chunk_id, notebook_id, user_id, embedding) "
                    "VALUES (:cid, :nb, :u, CAST(:emb AS vector)) "
                    "ON CONFLICT (chunk_id) DO UPDATE SET embedding = EXCLUDED.embedding"
                ),
                [
                    {
                        "cid": it.chunk_id,
                        "nb": it.notebook_id,
                        "u": it.user_id,
                        "emb": _to_pgvector(it.embedding),
                    }
                    for it in items
                ],
            )

    async def search(
        self, notebook_id: str, user_id: str, query: list[float], k: int
    ) -> list[tuple[str, float]]:
        engine = get_engine()
        async with engine.connect() as conn:
            rows = await conn.execute(
                text(
                    "SELECT chunk_id, 1 - (embedding <=> CAST(:q AS vector)) AS score "
                    "FROM chunk_embeddings "
                    "WHERE notebook_id = :nb AND user_id = :u "
                    "ORDER BY embedding <=> CAST(:q AS vector) LIMIT :k"
                ),
                {"q": _to_pgvector(query), "nb": notebook_id, "u": user_id, "k": k},
            )
            return [(r.chunk_id, float(r.score)) for r in rows]

    async def delete_chunks(self, notebook_id: str, user_id: str, chunk_ids: list[str]) -> None:
        if not chunk_ids:
            return
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "DELETE FROM chunk_embeddings WHERE notebook_id = :nb AND user_id = :u "
                    "AND chunk_id = ANY(:ids)"
                ),
                {"nb": notebook_id, "u": user_id, "ids": chunk_ids},
            )

    async def delete_notebook(self, notebook_id: str, user_id: str) -> None:
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM chunk_embeddings WHERE notebook_id = :nb AND user_id = :u"),
                {"nb": notebook_id, "u": user_id},
            )


class FaissStore:
    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or (get_settings().data_dir / "vectors")
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._cache: dict[str, tuple[list[str], np.ndarray]] = {}

    def _key(self, notebook_id: str, user_id: str) -> str:
        return f"{user_id}__{notebook_id}"

    def _paths(self, key: str) -> tuple[Path, Path]:
        return self.base_dir / f"{key}.npy", self.base_dir / f"{key}.ids.json"

    def _load(self, key: str) -> tuple[list[str], np.ndarray]:
        if key in self._cache:
            return self._cache[key]
        npy, ids_path = self._paths(key)
        if npy.exists() and ids_path.exists():
            mat = np.load(npy)
            ids = json.loads(ids_path.read_text())
        else:
            mat = np.zeros((0, get_settings().embedding_dim), dtype=np.float32)
            ids = []
        self._cache[key] = (ids, mat)
        return ids, mat

    def _save(self, key: str) -> None:
        ids, mat = self._cache[key]
        npy, ids_path = self._paths(key)
        np.save(npy, mat)
        ids_path.write_text(json.dumps(ids))

    async def add(self, items: list[VectorItem]) -> None:
        if not items:
            return
        with self._lock:
            key = self._key(items[0].notebook_id, items[0].user_id)
            ids, mat = self._load(key)
            new = np.asarray([it.embedding for it in items], dtype=np.float32)
            norms = np.linalg.norm(new, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            new /= norms
            self._cache[key] = (ids + [it.chunk_id for it in items], np.vstack([mat, new]))
            self._save(key)

    async def search(
        self, notebook_id: str, user_id: str, query: list[float], k: int
    ) -> list[tuple[str, float]]:
        with self._lock:
            ids, mat = self._load(self._key(notebook_id, user_id))
        if not ids:
            return []
        q = np.asarray(query, dtype=np.float32)
        q /= np.linalg.norm(q) or 1.0
        k = min(k, len(ids))
        try:
            import faiss

            index = faiss.IndexFlatIP(mat.shape[1])
            index.add(mat)
            scores, idxs = index.search(q.reshape(1, -1), k)
            pairs = list(zip(idxs[0].tolist(), scores[0].tolist(), strict=True))
        except ImportError:
            sims = mat @ q
            top = np.argsort(-sims)[:k]
            pairs = [(int(i), float(sims[i])) for i in top]
        return [(ids[i], float(s)) for i, s in pairs if i >= 0]

    async def delete_chunks(self, notebook_id: str, user_id: str, chunk_ids: list[str]) -> None:
        with self._lock:
            key = self._key(notebook_id, user_id)
            ids, mat = self._load(key)
            drop = set(chunk_ids)
            keep = [i for i, cid in enumerate(ids) if cid not in drop]
            self._cache[key] = ([ids[i] for i in keep], mat[keep] if len(ids) else mat)
            self._save(key)

    async def delete_notebook(self, notebook_id: str, user_id: str) -> None:
        with self._lock:
            key = self._key(notebook_id, user_id)
            self._cache.pop(key, None)
            for p in self._paths(key):
                p.unlink(missing_ok=True)


_store: VectorStore | None = None


def get_vector_store() -> VectorStore:
    global _store
    if _store is None:
        backend = get_settings().vector_backend
        _store = PgVectorStore() if backend == "pgvector" else FaissStore()
    return _store


def reset_vector_store() -> None:
    global _store
    _store = None
