"""add internal llm usage ledger

Revision ID: f4c9d8e7a6b5
Revises: e2b3c4d5f6a8
Create Date: 2026-07-02

Adds the CLI-first LLM usage ledger and supporting entitlement/profile tables.
The ledger is the primary source for Settings and External Usage in the
CLI-subscription architecture. Idempotent SQL keeps shared-infra re-runs safe.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f4c9d8e7a6b5"
down_revision: str | Sequence[str] | None = "e2b3c4d5f6a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_llm_entitlements (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            organization_id VARCHAR(36),
            provider VARCHAR(50) NOT NULL,
            mode VARCHAR(20) NOT NULL DEFAULT 'cli',
            source_scope VARCHAR(100) NOT NULL DEFAULT 'all',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            cli_profile_id VARCHAR(36),
            allow_api_fallback BOOLEAN NOT NULL DEFAULT FALSE,
            quota_policy_id VARCHAR(36),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_cli_profiles (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            owner_user_id VARCHAR(255),
            organization_id VARCHAR(36),
            provider VARCHAR(50) NOT NULL,
            profile_name VARCHAR(255) NOT NULL,
            command VARCHAR(255) NOT NULL,
            args_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            working_directory VARCHAR(1024),
            auth_status VARCHAR(50) NOT NULL DEFAULT 'unknown',
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_usage_ledger (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            user_id VARCHAR(255),
            organization_id VARCHAR(36),
            provider VARCHAR(50) NOT NULL,
            mode VARCHAR(20) NOT NULL,
            source VARCHAR(100) NOT NULL,
            model VARCHAR(255),
            input_tokens INTEGER,
            output_tokens INTEGER,
            total_tokens INTEGER,
            measurement_method VARCHAR(50) NOT NULL DEFAULT 'unknown',
            estimated_cost_usd DOUBLE PRECISION,
            status VARCHAR(50) NOT NULL DEFAULT 'success',
            session_id VARCHAR(36),
            task_id VARCHAR(36),
            analysis_id VARCHAR(36),
            project_id VARCHAR(100),
            latency_ms INTEGER,
            error_message TEXT,
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            started_at TIMESTAMP WITH TIME ZONE NOT NULL,
            completed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """
    )

    for index_sql in [
        "CREATE INDEX IF NOT EXISTS ix_user_llm_entitlements_user_id ON user_llm_entitlements (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_user_llm_entitlements_organization_id ON user_llm_entitlements (organization_id)",
        "CREATE INDEX IF NOT EXISTS ix_user_llm_entitlements_provider ON user_llm_entitlements (provider)",
        "CREATE INDEX IF NOT EXISTS ix_user_llm_entitlements_mode ON user_llm_entitlements (mode)",
        "CREATE INDEX IF NOT EXISTS ix_user_llm_entitlements_enabled ON user_llm_entitlements (enabled)",
        "CREATE INDEX IF NOT EXISTS ix_user_llm_entitlements_cli_profile_id ON user_llm_entitlements (cli_profile_id)",
        "CREATE INDEX IF NOT EXISTS ix_user_llm_entitlement_user_provider_mode ON user_llm_entitlements (user_id, provider, mode)",
        "CREATE INDEX IF NOT EXISTS ix_user_llm_entitlement_org_provider ON user_llm_entitlements (organization_id, provider)",
        "CREATE INDEX IF NOT EXISTS ix_llm_cli_profiles_owner_user_id ON llm_cli_profiles (owner_user_id)",
        "CREATE INDEX IF NOT EXISTS ix_llm_cli_profiles_organization_id ON llm_cli_profiles (organization_id)",
        "CREATE INDEX IF NOT EXISTS ix_llm_cli_profiles_provider ON llm_cli_profiles (provider)",
        "CREATE INDEX IF NOT EXISTS ix_llm_cli_profiles_auth_status ON llm_cli_profiles (auth_status)",
        "CREATE INDEX IF NOT EXISTS ix_llm_cli_profile_owner_provider ON llm_cli_profiles (owner_user_id, provider)",
        "CREATE INDEX IF NOT EXISTS ix_llm_cli_profile_org_provider ON llm_cli_profiles (organization_id, provider)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_user_id ON llm_usage_ledger (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_organization_id ON llm_usage_ledger (organization_id)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_provider ON llm_usage_ledger (provider)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_mode ON llm_usage_ledger (mode)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_source ON llm_usage_ledger (source)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_model ON llm_usage_ledger (model)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_status ON llm_usage_ledger (status)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_session_id ON llm_usage_ledger (session_id)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_task_id ON llm_usage_ledger (task_id)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_analysis_id ON llm_usage_ledger (analysis_id)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_project_id ON llm_usage_ledger (project_id)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_ledger_started_at ON llm_usage_ledger (started_at)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_user_started ON llm_usage_ledger (user_id, started_at)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_org_started ON llm_usage_ledger (organization_id, started_at)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_source_started ON llm_usage_ledger (source, started_at)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_provider_mode ON llm_usage_ledger (provider, mode)",
        "CREATE INDEX IF NOT EXISTS ix_llm_usage_status_started ON llm_usage_ledger (status, started_at)",
    ]:
        op.execute(index_sql)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS llm_usage_ledger")
    op.execute("DROP TABLE IF EXISTS llm_cli_profiles")
    op.execute("DROP TABLE IF EXISTS user_llm_entitlements")
