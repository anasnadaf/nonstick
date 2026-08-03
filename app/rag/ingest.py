"""Document ingestion: parse → chunk → embed → store.

Runs as a background task per uploaded source; the source row's status field
(processing → ready | failed) is the client-visible progress signal.
"""

import hashlib
import logging
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import select, update

from app.config import get_settings
from app.db.models import Chunk, Source, SourceStatus
from app.db.session import get_sessionmaker
from app.llm.client import get_llm
from app.obs import metrics
from app.rag.store import VectorItem, get_vector_store

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".md", ".markdown", ".txt", ".docx"}

EMBED_BATCH_SIZE = 64


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_file(path: Path) -> list[tuple[str, dict]]:
    """Return [(text, metadata)] segments; metadata carries e.g. the PDF page number."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        return [(page.extract_text() or "", {"page": i + 1}) for i, page in enumerate(reader.pages)]
    if ext == ".docx":
        import docx

        doc = docx.Document(str(path))
        text = "\n".join(p.text for p in doc.paragraphs)
        return [(text, {})]
    if ext in {".md", ".markdown", ".txt"}:
        return [(path.read_text(encoding="utf-8", errors="replace"), {})]
    raise ValueError(f"Unsupported file type: {ext}")


def chunk_segments(segments: list[tuple[str, dict]]) -> list[tuple[str, dict]]:
    settings = get_settings()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap
    )
    out: list[tuple[str, dict]] = []
    for text, meta in segments:
        for piece in splitter.split_text(text):
            piece = piece.strip()
            if piece:
                out.append((piece, meta))
    return out


async def ingest_source(source_id: str, file_path: Path) -> None:
    sessionmaker = get_sessionmaker()
    try:
        chunks = chunk_segments(parse_file(file_path))
        if not chunks:
            raise ValueError("No extractable text found in document")

        async with sessionmaker() as db:
            source = (await db.execute(select(Source).where(Source.id == source_id))).scalar_one()
            rows = [
                Chunk(
                    source_id=source.id,
                    notebook_id=source.notebook_id,
                    user_id=source.user_id,
                    seq=i,
                    text=text,
                    meta=meta,
                )
                for i, (text, meta) in enumerate(chunks)
            ]
            db.add_all(rows)
            await db.commit()

            llm = get_llm()
            store = get_vector_store()
            for start in range(0, len(rows), EMBED_BATCH_SIZE):
                batch = rows[start : start + EMBED_BATCH_SIZE]
                embeddings = await llm.embed([c.text for c in batch])
                await store.add(
                    [
                        VectorItem(
                            chunk_id=c.id,
                            notebook_id=c.notebook_id,
                            user_id=c.user_id,
                            embedding=e,
                        )
                        for c, e in zip(batch, embeddings, strict=True)
                    ]
                )

            await db.execute(
                update(Source)
                .where(Source.id == source_id)
                .values(status=SourceStatus.READY, chunk_count=len(rows), error=None)
            )
            await db.commit()
        metrics.INGESTED_CHUNKS.inc(len(rows))
        logger.info("Ingested source %s: %d chunks", source_id, len(chunks))
    except Exception as exc:
        metrics.INGEST_FAILURES.inc()
        logger.exception("Ingestion failed for source %s", source_id)
        async with sessionmaker() as db:
            await db.execute(
                update(Source)
                .where(Source.id == source_id)
                .values(status=SourceStatus.FAILED, error=str(exc)[:2000])
            )
            await db.commit()
