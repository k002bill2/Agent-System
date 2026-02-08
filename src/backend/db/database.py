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


async def close_db() -> None:
    """Close database connection pool."""
    await engine.dispose()
