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

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("DB_ECHO", "false").lower() == "true",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args={"statement_cache_size": 0},
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
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'users' AND column_name = 'role'"
        ))
        if not result.fetchone():
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"
            ))
            # Sync existing is_admin flags
            await conn.execute(text(
                "UPDATE users SET role = 'admin' WHERE is_admin = true AND (role IS NULL OR role = 'user')"
            ))

        # Migration 2: Add 'sort_order' column to menu_visibility table
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'menu_visibility' AND column_name = 'sort_order'"
        ))
        if not result.fetchone():
            await conn.execute(text(
                "ALTER TABLE menu_visibility ADD COLUMN sort_order INTEGER"
            ))

        # Migration 3: Create merge_requests table
        result = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_name = 'merge_requests'"
        ))
        if not result.fetchone():
            await conn.execute(text("""
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
            """))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_merge_requests_project_status "
                "ON merge_requests (project_id, status)"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_merge_requests_created "
                "ON merge_requests (created_at)"
            ))

        # Migration 4: Create branch_protection_rules table
        result = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_name = 'branch_protection_rules'"
        ))
        if not result.fetchone():
            await conn.execute(text("""
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
            """))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_branch_protection_project "
                "ON branch_protection_rules (project_id)"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_branch_protection_enabled "
                "ON branch_protection_rules (project_id, enabled)"
            ))

        # Migration 5: Add auto_merge column to merge_requests (if table existed before)
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'merge_requests' AND column_name = 'auto_merge'"
        ))
        if not result.fetchone():
            await conn.execute(text(
                "ALTER TABLE merge_requests ADD COLUMN auto_merge BOOLEAN DEFAULT FALSE"
            ))


async def close_db() -> None:
    """Close database connection pool."""
    await engine.dispose()
