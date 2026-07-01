"""add deployment_usage_credentials table

Revision ID: e2b3c4d5f6a8
Revises: d1a2b3c4e5f7
Create Date: 2026-07-01

Adds the deployment-wide usage credential table for the External Usage key
sourcing redesign. One encrypted admin/manager-managed key per provider, used
solely to read org-level usage/metrics APIs (distinct from per-user chat keys
in ``user_llm_credentials``).

``api_key`` is stored via the ``EncryptedString`` column type, which maps to a
plain ``VARCHAR(1024)`` at the database level. Idempotent CREATE TABLE IF NOT
EXISTS so a re-run against the shared-infra DB is safe (no destructive ops).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e2b3c4d5f6a8"
down_revision: str | Sequence[str] | None = "d1a2b3c4e5f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS deployment_usage_credentials (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            provider VARCHAR(50) NOT NULL,
            api_key VARCHAR(1024) NOT NULL,
            label VARCHAR(255),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            last_verified_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT uq_deployment_usage_provider UNIQUE (provider)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS deployment_usage_credentials")
