from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.notebooks import get_notebook_or_404
from app.auth import User, require_user
from app.config import get_settings
from app.db.models import Chunk, Source, SourceStatus
from app.db.session import get_db
from app.llm.cache import get_semantic_cache
from app.rag.ingest import SUPPORTED_EXTENSIONS, content_hash, ingest_source
from app.rag.store import get_vector_store

router = APIRouter(prefix="/api/notebooks/{notebook_id}/sources", tags=["sources"])


class SourceOut(BaseModel):
    id: str
    filename: str
    mime: str
    size_bytes: int
    status: str
    error: str | None
    chunk_count: int
    created_at: datetime


def _out(s: Source) -> SourceOut:
    return SourceOut(
        id=s.id,
        filename=s.filename,
        mime=s.mime,
        size_bytes=s.size_bytes,
        status=s.status,
        error=s.error,
        chunk_count=s.chunk_count,
        created_at=s.created_at,
    )


@router.get("", response_model=list[SourceOut])
async def list_sources(
    notebook_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)
) -> list[SourceOut]:
    await get_notebook_or_404(db, notebook_id, user)
    rows = (
        await db.execute(
            select(Source)
            .where(Source.notebook_id == notebook_id)
            .order_by(Source.created_at.asc())
        )
    ).scalars()
    return [_out(s) for s in rows]


@router.post("", response_model=SourceOut, status_code=202)
async def upload_source(
    notebook_id: str,
    file: UploadFile,
    background: BackgroundTasks,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> SourceOut:
    settings = get_settings()
    await get_notebook_or_404(db, notebook_id, user)

    filename = Path(file.filename or "upload").name
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ext}'. Supported: {sorted(SUPPORTED_EXTENSIONS)}",
        )

    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail=f"File exceeds {settings.max_upload_mb} MB limit"
        )

    digest = content_hash(data)
    duplicate = (
        await db.execute(
            select(Source.id).where(
                Source.notebook_id == notebook_id, Source.content_hash == digest
            )
        )
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="This document is already in the notebook")

    source = Source(
        notebook_id=notebook_id,
        user_id=user.id,
        filename=filename,
        mime=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        content_hash=digest,
        status=SourceStatus.PROCESSING,
    )
    db.add(source)
    await db.commit()

    dest = settings.uploads_dir / f"{source.id}{ext}"
    dest.write_bytes(data)
    background.add_task(ingest_source, source.id, dest)
    await get_semantic_cache().invalidate(notebook_id, user.id)
    return _out(source)


@router.get("/{source_id}", response_model=SourceOut)
async def get_source(
    notebook_id: str,
    source_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> SourceOut:
    await get_notebook_or_404(db, notebook_id, user)
    source = (
        await db.execute(
            select(Source).where(Source.id == source_id, Source.notebook_id == notebook_id)
        )
    ).scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    return _out(source)


@router.delete("/{source_id}", status_code=204)
async def delete_source(
    notebook_id: str,
    source_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await get_notebook_or_404(db, notebook_id, user)
    source = (
        await db.execute(
            select(Source).where(Source.id == source_id, Source.notebook_id == notebook_id)
        )
    ).scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")

    chunk_ids = list(
        (await db.execute(select(Chunk.id).where(Chunk.source_id == source_id))).scalars()
    )
    await db.delete(source)
    await db.commit()
    await get_vector_store().delete_chunks(notebook_id, user.id, chunk_ids)
    await get_semantic_cache().invalidate(notebook_id, user.id)

    for path in get_settings().uploads_dir.glob(f"{source_id}.*"):
        path.unlink(missing_ok=True)
