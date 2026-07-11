"""add llm model suppressions

Revision ID: a7d3f1b9c2e4
Revises: f4c9d8e7a6b5
Create Date: 2026-07-12

Adds the llm_model_suppressions table used to implement a durable "hard delete"
for LLM models. A suppressed model id is skipped by both re-registration paths
(startup sync_to_db and the 24h model discovery), so a deleted model stays
deleted. Idempotent SQL keeps shared-infra re-runs safe.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a7d3f1b9c2e4"
down_revision: str | Sequence[str] | None = "f4c9d8e7a6b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_model_suppressions (
            model_id VARCHAR(100) NOT NULL PRIMARY KEY,
            provider VARCHAR(50) NOT NULL,
            reason VARCHAR(500),
            suppressed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_llm_model_suppressions_provider "
        "ON llm_model_suppressions (provider)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS llm_model_suppressions")
