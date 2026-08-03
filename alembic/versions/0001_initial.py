"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-03

"""

from alembic import op
from app.config import get_settings
from app.db.models import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    Base.metadata.create_all(bind)

    if bind.dialect.name == "postgresql":
        dim = get_settings().embedding_dim
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS chunk_embeddings (
                chunk_id VARCHAR(32) PRIMARY KEY
                    REFERENCES chunks(id) ON DELETE CASCADE,
                notebook_id VARCHAR(32) NOT NULL,
                user_id VARCHAR(64) NOT NULL,
                embedding vector({dim}) NOT NULL
            )
            """
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_chunk_embeddings_notebook "
            "ON chunk_embeddings (notebook_id, user_id)"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_chunk_embeddings_hnsw "
            "ON chunk_embeddings USING hnsw (embedding vector_cosine_ops)"
        )
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS semantic_cache (
                id VARCHAR(32) PRIMARY KEY,
                notebook_id VARCHAR(32) NOT NULL,
                user_id VARCHAR(64) NOT NULL,
                question TEXT NOT NULL,
                embedding vector({dim}) NOT NULL,
                answer_json TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT now()
            )
            """
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_semantic_cache_scope "
            "ON semantic_cache (notebook_id, user_id)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TABLE IF EXISTS semantic_cache")
        op.execute("DROP TABLE IF EXISTS chunk_embeddings")
    Base.metadata.drop_all(bind)
