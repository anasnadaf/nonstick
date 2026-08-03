"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-03

"""

from alembic import op
from app.db.bootstrap import PGVECTOR_DROP_DDL, create_schema_sync
from app.db.models import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    create_schema_sync(op.get_bind())


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for statement in PGVECTOR_DROP_DDL:
            op.execute(statement)
    Base.metadata.drop_all(bind)
