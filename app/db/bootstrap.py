"""Schema creation shared by the Alembic migration, the sqlite dev path, and tests.

The relational tables come from the SQLAlchemy metadata; the pgvector-backed
tables are raw DDL because their vector column width depends on EMBEDDING_DIM.
"""

from sqlalchemy import text

from app.config import get_settings
from app.db.models import Base


def pgvector_ddl(dim: int) -> list[str]:
    return [
        "CREATE EXTENSION IF NOT EXISTS vector",
        f"""
        CREATE TABLE IF NOT EXISTS chunk_embeddings (
            chunk_id VARCHAR(32) PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
            notebook_id VARCHAR(32) NOT NULL,
            user_id VARCHAR(64) NOT NULL,
            embedding vector({dim}) NOT NULL
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_chunk_embeddings_notebook "
        "ON chunk_embeddings (notebook_id, user_id)",
        "CREATE INDEX IF NOT EXISTS ix_chunk_embeddings_hnsw "
        "ON chunk_embeddings USING hnsw (embedding vector_cosine_ops)",
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
        """,
        "CREATE INDEX IF NOT EXISTS ix_semantic_cache_scope "
        "ON semantic_cache (notebook_id, user_id)",
    ]


PGVECTOR_DROP_DDL = [
    "DROP TABLE IF EXISTS semantic_cache",
    "DROP TABLE IF EXISTS chunk_embeddings",
]


def create_schema_sync(connection) -> None:
    """Create every table on an open (sync-style) connection."""
    is_postgres = connection.dialect.name == "postgresql"
    if is_postgres:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(connection)
    if is_postgres:
        for statement in pgvector_ddl(get_settings().embedding_dim):
            connection.execute(text(statement))


async def create_schema(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(create_schema_sync)
