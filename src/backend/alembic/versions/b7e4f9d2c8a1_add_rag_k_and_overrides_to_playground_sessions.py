"""add rag_k and hybrid/rerank overrides to playground_sessions

Revision ID: b7e4f9d2c8a1
Revises: f3a8b2c1d4e5
Create Date: 2026-04-18

Adds per-session RAG controls so the Playground UI can override the
global env flags on a session-by-session basis.

- rag_k: INTEGER DEFAULT 5 NOT NULL (how many chunks to retrieve)
- rag_hybrid_override: BOOLEAN NULLABLE (NULL = follow RAG_ENABLE_HYBRID env)
- rag_rerank_override: BOOLEAN NULLABLE (NULL = follow RAG_ENABLE_RERANK env)

Idempotent: uses ADD COLUMN IF NOT EXISTS so re-runs are safe when the
columns were created outside Alembic.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b7e4f9d2c8a1"
down_revision: str | Sequence[str] | None = "f3a8b2c1d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE playground_sessions
            ADD COLUMN IF NOT EXISTS rag_k INTEGER NOT NULL DEFAULT 5
        """
    )
    op.execute(
        """
        ALTER TABLE playground_sessions
            ADD COLUMN IF NOT EXISTS rag_hybrid_override BOOLEAN
        """
    )
    op.execute(
        """
        ALTER TABLE playground_sessions
            ADD COLUMN IF NOT EXISTS rag_rerank_override BOOLEAN
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE playground_sessions DROP COLUMN IF EXISTS rag_rerank_override")
    op.execute("ALTER TABLE playground_sessions DROP COLUMN IF EXISTS rag_hybrid_override")
    op.execute("ALTER TABLE playground_sessions DROP COLUMN IF EXISTS rag_k")
