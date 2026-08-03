from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import User, require_user
from app.db.models import Notebook, Source
from app.db.session import get_db
from app.llm.cache import get_semantic_cache
from app.rag.store import get_vector_store

router = APIRouter(prefix="/api/notebooks", tags=["notebooks"])


class NotebookIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    emoji: str = Field(default="📓", max_length=16)


class NotebookPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)


class NotebookOut(BaseModel):
    id: str
    title: str
    emoji: str
    source_count: int = 0
    created_at: datetime
    updated_at: datetime


async def get_notebook_or_404(db: AsyncSession, notebook_id: str, user: User) -> Notebook:
    notebook = (
        await db.execute(
            select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user.id)
        )
    ).scalar_one_or_none()
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook


def _out(nb: Notebook, source_count: int = 0) -> NotebookOut:
    return NotebookOut(
        id=nb.id,
        title=nb.title,
        emoji=nb.emoji,
        source_count=source_count,
        created_at=nb.created_at,
        updated_at=nb.updated_at,
    )


@router.get("", response_model=list[NotebookOut])
async def list_notebooks(
    user: User = Depends(require_user), db: AsyncSession = Depends(get_db)
) -> list[NotebookOut]:
    rows = (
        await db.execute(
            select(Notebook, func.count(Source.id))
            .outerjoin(Source, Source.notebook_id == Notebook.id)
            .where(Notebook.user_id == user.id)
            .group_by(Notebook.id)
            .order_by(Notebook.updated_at.desc())
        )
    ).all()
    return [_out(nb, count) for nb, count in rows]


@router.post("", response_model=NotebookOut, status_code=201)
async def create_notebook(
    body: NotebookIn, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)
) -> NotebookOut:
    notebook = Notebook(user_id=user.id, title=body.title, emoji=body.emoji)
    db.add(notebook)
    await db.commit()
    return _out(notebook)


@router.get("/{notebook_id}", response_model=NotebookOut)
async def get_notebook(
    notebook_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)
) -> NotebookOut:
    notebook = await get_notebook_or_404(db, notebook_id, user)
    count = (
        await db.execute(select(func.count(Source.id)).where(Source.notebook_id == notebook.id))
    ).scalar_one()
    return _out(notebook, count)


@router.patch("/{notebook_id}", response_model=NotebookOut)
async def update_notebook(
    notebook_id: str,
    body: NotebookPatch,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> NotebookOut:
    notebook = await get_notebook_or_404(db, notebook_id, user)
    if body.title is not None:
        notebook.title = body.title
    if body.emoji is not None:
        notebook.emoji = body.emoji
    await db.commit()
    return _out(notebook)


@router.delete("/{notebook_id}", status_code=204)
async def delete_notebook(
    notebook_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)
) -> None:
    notebook = await get_notebook_or_404(db, notebook_id, user)
    await db.delete(notebook)
    await db.commit()
    await get_vector_store().delete_notebook(notebook_id, user.id)
    await get_semantic_cache().invalidate(notebook_id, user.id)
