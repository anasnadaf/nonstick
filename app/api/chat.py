import json
from collections.abc import AsyncIterator
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.pipeline import run_chat_pipeline
from app.api.notebooks import get_notebook_or_404
from app.auth import User, require_user
from app.db.models import ChatMessage, ChatSession
from app.db.session import get_db, get_sessionmaker

router = APIRouter(prefix="/api/notebooks/{notebook_id}", tags=["chat"])

HISTORY_LIMIT = 20


class SessionOut(BaseModel):
    id: str
    title: str
    created_at: datetime


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    citations: list
    created_at: datetime


class ChatIn(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _get_session(
    db: AsyncSession, notebook_id: str, session_id: str, user: User
) -> ChatSession:
    session = (
        await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.notebook_id == notebook_id,
                ChatSession.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    notebook_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)
) -> list[SessionOut]:
    await get_notebook_or_404(db, notebook_id, user)
    rows = (
        await db.execute(
            select(ChatSession)
            .where(ChatSession.notebook_id == notebook_id, ChatSession.user_id == user.id)
            .order_by(ChatSession.updated_at.desc())
        )
    ).scalars()
    return [SessionOut(id=s.id, title=s.title, created_at=s.created_at) for s in rows]


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def list_messages(
    notebook_id: str,
    session_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> list[MessageOut]:
    await get_notebook_or_404(db, notebook_id, user)
    await _get_session(db, notebook_id, session_id, user)
    rows = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
        )
    ).scalars()
    return [
        MessageOut(
            id=m.id,
            role=m.role,
            content=m.content,
            citations=m.citations or [],
            created_at=m.created_at,
        )
        for m in rows
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    notebook_id: str,
    session_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await get_notebook_or_404(db, notebook_id, user)
    session = await _get_session(db, notebook_id, session_id, user)
    await db.delete(session)
    await db.commit()


@router.post("/chat")
async def chat(
    notebook_id: str,
    body: ChatIn,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await get_notebook_or_404(db, notebook_id, user)

    if body.session_id:
        session = await _get_session(db, notebook_id, body.session_id, user)
    else:
        session = ChatSession(
            notebook_id=notebook_id, user_id=user.id, title=body.message.strip()[:60]
        )
        db.add(session)
        await db.commit()

    history_rows = list(
        (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session.id)
                .order_by(ChatMessage.created_at.desc())
                .limit(HISTORY_LIMIT)
            )
        ).scalars()
    )
    history = [{"role": m.role, "content": m.content} for m in reversed(history_rows)]

    db.add(ChatMessage(session_id=session.id, role="user", content=body.message))
    await db.commit()
    session_id = session.id

    async def event_stream() -> AsyncIterator[str]:
        yield _sse("session", {"session_id": session_id})
        try:
            async for event in run_chat_pipeline(body.message, history, notebook_id, user.id):
                etype = event.pop("type")
                yield _sse(etype, event)
                if etype == "final":
                    async with get_sessionmaker()() as save_db:
                        save_db.add(
                            ChatMessage(
                                session_id=session_id,
                                role="assistant",
                                content=event["answer"],
                                citations=event.get("citations", []),
                            )
                        )
                        await save_db.commit()
                elif etype == "blocked":
                    async with get_sessionmaker()() as save_db:
                        save_db.add(
                            ChatMessage(
                                session_id=session_id,
                                role="assistant",
                                content=f"[blocked] {event.get('reason', '')}",
                                citations=[],
                            )
                        )
                        await save_db.commit()
        except Exception as exc:  # surface failures to the stream instead of dropping it
            yield _sse("error", {"detail": str(exc)[:500]})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
