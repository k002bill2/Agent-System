"""Dependency injection for API routes."""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from orchestrator import OrchestrationEngine
from db.database import async_session_factory
from db.repository import SessionRepository, TaskRepository, MessageRepository, ApprovalRepository

# Global engine instance
_engine: OrchestrationEngine | None = None


def get_engine() -> OrchestrationEngine:
    """Get the orchestration engine instance."""
    global _engine
    if _engine is None:
        raise RuntimeError("Engine not initialized")
    return _engine


def set_engine(engine: OrchestrationEngine) -> None:
    """Set the orchestration engine instance."""
    global _engine
    _engine = engine


def clear_engine() -> None:
    """Clear the orchestration engine instance."""
    global _engine
    _engine = None


# ─────────────────────────────────────────────────────────────
# Database Dependencies
# ─────────────────────────────────────────────────────────────


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session for dependency injection."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_session_repository(db: AsyncSession) -> SessionRepository:
    """Get session repository."""
    return SessionRepository(db)


def get_task_repository(db: AsyncSession) -> TaskRepository:
    """Get task repository."""
    return TaskRepository(db)


def get_message_repository(db: AsyncSession) -> MessageRepository:
    """Get message repository."""
    return MessageRepository(db)


def get_approval_repository(db: AsyncSession) -> ApprovalRepository:
    """Get approval repository."""
    return ApprovalRepository(db)
