"""Database connection and session management."""

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# Database URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://aos:aos@localhost:5432/aos",
)

# Build connect_args with optional SSL
_connect_args: dict = {"statement_cache_size": 0}

_db_ssl_mode = os.getenv("DB_SSL_MODE", "")
if _db_ssl_mode:
    import ssl as _ssl

    ssl_ctx = _ssl.create_default_context()
    _db_ssl_cert_path = os.getenv("DB_SSL_CERT_PATH", "")
    if _db_ssl_cert_path:
        ssl_ctx.load_verify_locations(_db_ssl_cert_path)
    if _db_ssl_mode == "require":
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
    _connect_args["ssl"] = ssl_ctx

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("DB_ECHO", "false").lower() == "true",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args=_connect_args,
)

# Async session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get database session.

    Usage:
        async with get_db() as session:
            # use session
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Initialize database - create all tables and run migrations."""
    # Import models to register them with Base.metadata before create_all
    import db.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Run incremental migrations for columns added after initial create_all
    await _run_migrations()


async def _run_migrations() -> None:
    """Run incremental schema migrations.

    create_all does NOT add new columns to existing tables,
    so we handle column additions here.
    """
    from sqlalchemy import text

    async with engine.begin() as conn:
        # Migration 1: Add 'role' column to users table
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'users' AND column_name = 'role'"
            )
        )
        if not result.fetchone():
            await conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"))
            # Sync existing is_admin flags
            await conn.execute(
                text(
                    "UPDATE users SET role = 'admin' WHERE is_admin = true AND (role IS NULL OR role = 'user')"
                )
            )

        # Migration 2: Add 'sort_order' column to menu_visibility table
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'menu_visibility' AND column_name = 'sort_order'"
            )
        )
        if not result.fetchone():
            await conn.execute(text("ALTER TABLE menu_visibility ADD COLUMN sort_order INTEGER"))

        # Migration 3: Create merge_requests table
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_name = 'merge_requests'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE merge_requests (
                    id VARCHAR(36) PRIMARY KEY,
                    project_id VARCHAR(100) NOT NULL,
                    title VARCHAR(500) NOT NULL,
                    description TEXT,
                    source_branch VARCHAR(200) NOT NULL,
                    target_branch VARCHAR(200) NOT NULL,
                    status VARCHAR(20) DEFAULT 'open',
                    conflict_status VARCHAR(20) DEFAULT 'unknown',
                    auto_merge BOOLEAN DEFAULT FALSE,
                    author_id VARCHAR(100),
                    author_name VARCHAR(200),
                    author_email VARCHAR(300),
                    reviewers JSONB DEFAULT '[]'::jsonb,
                    approved_by JSONB DEFAULT '[]'::jsonb,
                    merged_by VARCHAR(100),
                    closed_by VARCHAR(100),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    merged_at TIMESTAMP,
                    closed_at TIMESTAMP
                )
            """)
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_merge_requests_project_status "
                    "ON merge_requests (project_id, status)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_merge_requests_created "
                    "ON merge_requests (created_at)"
                )
            )

        # Migration 4: Create branch_protection_rules table
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_name = 'branch_protection_rules'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE branch_protection_rules (
                    id VARCHAR(36) PRIMARY KEY,
                    project_id VARCHAR(100) NOT NULL,
                    branch_pattern VARCHAR(200) NOT NULL,
                    require_approvals INTEGER DEFAULT 0,
                    require_no_conflicts BOOLEAN DEFAULT TRUE,
                    allowed_merge_roles JSONB DEFAULT '["owner","admin"]'::jsonb,
                    allow_force_push BOOLEAN DEFAULT FALSE,
                    allow_deletion BOOLEAN DEFAULT FALSE,
                    auto_deploy BOOLEAN DEFAULT FALSE,
                    deploy_workflow VARCHAR(200),
                    enabled BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_branch_protection_project "
                    "ON branch_protection_rules (project_id)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_branch_protection_enabled "
                    "ON branch_protection_rules (project_id, enabled)"
                )
            )

        # Migration 5: Add auto_merge column to merge_requests (if table existed before)
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'merge_requests' AND column_name = 'auto_merge'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("ALTER TABLE merge_requests ADD COLUMN auto_merge BOOLEAN DEFAULT FALSE")
            )

        # Migration 6: Create project_access table for RBAC
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_name = 'project_access'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE project_access (
                    id VARCHAR(36) PRIMARY KEY,
                    project_id VARCHAR(36) NOT NULL,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role VARCHAR(20) NOT NULL,
                    granted_by VARCHAR(36),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_project_user UNIQUE (project_id, user_id)
                )
            """)
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_project_access_project "
                    "ON project_access (project_id)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_project_access_user ON project_access (user_id)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_project_access_project_user "
                    "ON project_access (project_id, user_id)"
                )
            )

        # Migration 8: Create projects table for DB-managed project registry
        result = await conn.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_name = 'projects'")
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE projects (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL UNIQUE,
                    slug VARCHAR(100) NOT NULL UNIQUE,
                    description TEXT,
                    path VARCHAR(1000),
                    is_active BOOLEAN DEFAULT TRUE,
                    settings JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                )
            """)
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_projects_active ON projects (is_active)")
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_projects_slug ON projects (slug)")
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_projects_created ON projects (created_at)")
            )

            # Seed: "Agent-System" project
            import uuid

            agent_system_id = str(uuid.uuid4())
            await conn.execute(
                text(
                    "INSERT INTO projects (id, name, slug, description, path, is_active) "
                    "VALUES (:id, :name, :slug, :desc, :path, TRUE) "
                    "ON CONFLICT (name) DO NOTHING"
                ),
                {
                    "id": agent_system_id,
                    "name": "Agent-System",
                    "slug": "agent-system",
                    "desc": "LangGraph 기반 멀티 에이전트 오케스트레이션 서비스",
                    "path": None,  # Will be set via API if needed
                },
            )

        # Migration 9: Add last_run_at and last_run_status to workflow_definitions
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'workflow_definitions' AND column_name = 'last_run_at'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("ALTER TABLE workflow_definitions ADD COLUMN last_run_at TIMESTAMP")
            )
            await conn.execute(
                text("ALTER TABLE workflow_definitions ADD COLUMN last_run_status VARCHAR(20)")
            )

        # Migration 10: Create llm_model_configs table and seed from registry
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_name = 'llm_model_configs'"
            )
        )
        if not result.fetchone():
            await conn.execute(
                text("""
                CREATE TABLE llm_model_configs (
                    id VARCHAR(100) PRIMARY KEY,
                    display_name VARCHAR(255) NOT NULL,
                    provider VARCHAR(50) NOT NULL,
                    context_window INTEGER NOT NULL DEFAULT 128000,
                    input_price FLOAT NOT NULL DEFAULT 0.001,
                    output_price FLOAT NOT NULL DEFAULT 0.002,
                    is_default BOOLEAN NOT NULL DEFAULT FALSE,
                    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    supports_tools BOOLEAN NOT NULL DEFAULT TRUE,
                    supports_vision BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_llm_model_provider_enabled "
                    "ON llm_model_configs (provider, is_enabled)"
                )
            )
            # Seed from in-memory registry
            from models.llm_models import _MODELS

            for model in _MODELS:
                await conn.execute(
                    text(
                        "INSERT INTO llm_model_configs "
                        "(id, display_name, provider, context_window, input_price, output_price, "
                        "is_default, is_enabled, supports_tools, supports_vision) "
                        "VALUES (:id, :display_name, :provider, :context_window, :input_price, "
                        ":output_price, :is_default, :is_enabled, :supports_tools, :supports_vision) "
                        "ON CONFLICT (id) DO NOTHING"
                    ),
                    {
                        "id": model.id,
                        "display_name": model.display_name,
                        "provider": model.provider.value,
                        "context_window": model.context_window,
                        "input_price": model.input_price,
                        "output_price": model.output_price,
                        "is_default": model.is_default,
                        "is_enabled": model.is_enabled,
                        "supports_tools": model.supports_tools,
                        "supports_vision": model.supports_vision,
                    },
                )
            print(f"✅ llm_model_configs seeded with {len(_MODELS)} models")

        # Migration 7: Add unique constraint and FK to workflow_secrets
        result = await conn.execute(
            text(
                "SELECT constraint_name FROM information_schema.table_constraints "
                "WHERE table_name = 'workflow_secrets' AND constraint_name = 'uq_secret_name_scope'"
            )
        )
        if not result.fetchone():
            # Add unique constraint (name, scope, scope_id)
            await conn.execute(
                text(
                    "ALTER TABLE workflow_secrets "
                    "ADD CONSTRAINT uq_secret_name_scope UNIQUE (name, scope, scope_id)"
                )
            )
            # Add FK from created_by → users.id (if column exists but has no FK)
            try:
                await conn.execute(
                    text(
                        "ALTER TABLE workflow_secrets "
                        "ADD CONSTRAINT fk_workflow_secrets_created_by "
                        "FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL"
                    )
                )
            except Exception:
                pass  # FK may already exist or users table may not exist yet


async def close_db() -> None:
    """Close database connection pool."""
    await engine.dispose()
