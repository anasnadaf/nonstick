from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.notebooks import get_notebook_or_404
from app.auth import User, require_user
from app.db.models import Chunk, Note, NoteKind, Source
from app.db.session import get_db
from app.llm.client import get_llm

router = APIRouter(prefix="/api/notebooks/{notebook_id}/notes", tags=["notes"])

GENERATE_KINDS = {
    NoteKind.SUMMARY: (
        "Summary",
        "Write a concise, well-structured markdown summary of the following document "
        "excerpts. Use headers and bullet points.",
    ),
    NoteKind.STUDY_GUIDE: (
        "Study guide",
        "Create a markdown study guide from the following document excerpts: key "
        "concepts with short explanations, followed by 5-10 review questions.",
    ),
    NoteKind.FAQ: (
        "FAQ",
        "Write a markdown FAQ (question/answer pairs) covering the most important "
        "points in the following document excerpts.",
    ),
}
GENERATE_CONTEXT_CHUNKS = 30


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content_md: str = ""


class NotePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content_md: str | None = None


class GenerateIn(BaseModel):
    kind: NoteKind


class NoteOut(BaseModel):
    id: str
    title: str
    content_md: str
    kind: str
    created_at: datetime
    updated_at: datetime


def _out(n: Note) -> NoteOut:
    return NoteOut(
        id=n.id,
        title=n.title,
        content_md=n.content_md,
        kind=n.kind,
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


@router.get("", response_model=list[NoteOut])
async def list_notes(
    notebook_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)
) -> list[NoteOut]:
    await get_notebook_or_404(db, notebook_id, user)
    rows = (
        await db.execute(
            select(Note).where(Note.notebook_id == notebook_id).order_by(Note.updated_at.desc())
        )
    ).scalars()
    return [_out(n) for n in rows]


@router.post("", response_model=NoteOut, status_code=201)
async def create_note(
    notebook_id: str,
    body: NoteIn,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> NoteOut:
    await get_notebook_or_404(db, notebook_id, user)
    note = Note(
        notebook_id=notebook_id,
        user_id=user.id,
        title=body.title,
        content_md=body.content_md,
        kind=NoteKind.MANUAL,
    )
    db.add(note)
    await db.commit()
    return _out(note)


@router.post("/generate", response_model=NoteOut, status_code=201)
async def generate_note(
    notebook_id: str,
    body: GenerateIn,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> NoteOut:
    await get_notebook_or_404(db, notebook_id, user)
    title, instruction = GENERATE_KINDS[body.kind]

    rows = (
        await db.execute(
            select(Chunk.text, Source.filename)
            .join(Source, Chunk.source_id == Source.id)
            .where(Chunk.notebook_id == notebook_id, Chunk.user_id == user.id)
            .order_by(Source.created_at.asc(), Chunk.seq.asc())
            .limit(GENERATE_CONTEXT_CHUNKS)
        )
    ).all()
    if not rows:
        raise HTTPException(status_code=400, detail="Notebook has no ingested documents yet")

    context = "\n\n".join(f"--- {filename} ---\n{text}" for text, filename in rows)
    content = await get_llm().complete(
        [
            {
                "role": "system",
                "content": "You are a precise study assistant. Output markdown only.",
            },
            {"role": "user", "content": f"{instruction}\n\n{context}"},
        ]
    )

    note = Note(
        notebook_id=notebook_id,
        user_id=user.id,
        title=title,
        content_md=content,
        kind=body.kind,
    )
    db.add(note)
    await db.commit()
    return _out(note)


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(
    notebook_id: str,
    note_id: str,
    body: NotePatch,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> NoteOut:
    await get_notebook_or_404(db, notebook_id, user)
    note = (
        await db.execute(select(Note).where(Note.id == note_id, Note.notebook_id == notebook_id))
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    if body.title is not None:
        note.title = body.title
    if body.content_md is not None:
        note.content_md = body.content_md
    await db.commit()
    return _out(note)


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    notebook_id: str,
    note_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await get_notebook_or_404(db, notebook_id, user)
    note = (
        await db.execute(select(Note).where(Note.id == note_id, Note.notebook_id == notebook_id))
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)
    await db.commit()
