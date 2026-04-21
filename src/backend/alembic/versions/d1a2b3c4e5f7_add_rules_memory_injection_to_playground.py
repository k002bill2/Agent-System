"""add rules/memory injection columns to playground_sessions

Revision ID: d1a2b3c4e5f7
Revises: c9f1e52a3b7c
Create Date: 2026-04-20

Adds per-session opt-in columns for Claude Code rule and memory injection
into the playground LLM system prompt:

- ``rules_mode``       : off | global | project | both
- ``memory_mode``      : off | index | full
- ``selected_rule_ids``/``selected_memory_ids``: JSONB allow-list (empty = all)
- ``context_budget_tokens``: soft cap on injected size

Idempotent ADD COLUMN IF NOT EXISTS for safe re-runs.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d1a2b3c4e5f7"
down_revision: str | Sequence[str] | None = "c9f1e52a3b7c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE playground_sessions
            ADD COLUMN IF NOT EXISTS rules_mode VARCHAR(16) NOT NULL DEFAULT 'off',
            ADD COLUMN IF NOT EXISTS memory_mode VARCHAR(16) NOT NULL DEFAULT 'off',
            ADD COLUMN IF NOT EXISTS selected_rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS selected_memory_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS context_budget_tokens INTEGER NOT NULL DEFAULT 8000
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE playground_sessions
            DROP COLUMN IF EXISTS rules_mode,
            DROP COLUMN IF EXISTS memory_mode,
            DROP COLUMN IF EXISTS selected_rule_ids,
            DROP COLUMN IF EXISTS selected_memory_ids,
            DROP COLUMN IF EXISTS context_budget_tokens
        """
    )
