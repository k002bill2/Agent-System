"""add rag_include_shared to playground_sessions

Revision ID: c9f1e52a3b7c
Revises: b7e4f9d2c8a1
Create Date: 2026-04-18

Adds the per-session flag that enables cross-project RAG retrieval — the
search fuses results from other projects' Qdrant collections (with a rank
boost for the current project) when True.

Idempotent ADD COLUMN IF NOT EXISTS for safe re-runs.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c9f1e52a3b7c"
down_revision: str | Sequence[str] | None = "b7e4f9d2c8a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE playground_sessions
            ADD COLUMN IF NOT EXISTS rag_include_shared BOOLEAN NOT NULL DEFAULT false
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE playground_sessions DROP COLUMN IF EXISTS rag_include_shared")
