import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )


class SourceStatus(StrEnum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class NoteKind(StrEnum):
    MANUAL = "manual"
    SUMMARY = "summary"
    STUDY_GUIDE = "study_guide"
    FAQ = "faq"


class Notebook(TimestampMixin, Base):
    __tablename__ = "notebooks"
    __table_args__ = (Index("ix_notebooks_user", "user_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str] = mapped_column(String(16), default="📓")

    sources: Mapped[list["Source"]] = relationship(
        back_populates="notebook", cascade="all, delete-orphan"
    )


class Source(TimestampMixin, Base):
    __tablename__ = "sources"
    __table_args__ = (Index("ix_sources_notebook", "notebook_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    notebook_id: Mapped[str] = mapped_column(
        ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    mime: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default=SourceStatus.PROCESSING)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)

    notebook: Mapped[Notebook] = relationship(back_populates="sources")
    chunks: Mapped[list["Chunk"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class Chunk(Base):
    """Chunk text + metadata. Embeddings live in the vector store (pgvector table or FAISS)."""

    __tablename__ = "chunks"
    __table_args__ = (
        Index("ix_chunks_notebook", "notebook_id"),
        Index("ix_chunks_source", "source_id"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    source_id: Mapped[str] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), nullable=False
    )
    notebook_id: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    source: Mapped[Source] = relationship(back_populates="chunks")


class ChatSession(TimestampMixin, Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (Index("ix_chat_sessions_notebook", "notebook_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    notebook_id: Mapped[str] = mapped_column(
        ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="New chat")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_messages_session", "session_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class Note(TimestampMixin, Base):
    __tablename__ = "notes"
    __table_args__ = (Index("ix_notes_notebook", "notebook_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    notebook_id: Mapped[str] = mapped_column(
        ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content_md: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(16), default=NoteKind.MANUAL)
