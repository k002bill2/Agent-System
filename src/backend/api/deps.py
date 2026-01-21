"""Dependency injection for API routes."""

from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from orchestrator import OrchestrationEngine
from db.database import async_session_factory
from db.repository import SessionRepository, TaskRepository, MessageRepository, ApprovalRepository
from db.models import UserModel
from services.auth_service import AuthService

# Global engine instance
_engine: OrchestrationEngine | None = None

# HTTP Bearer security scheme
security = HTTPBearer(auto_error=False)


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


# ─────────────────────────────────────────────────────────────
# Authentication Dependencies
# ─────────────────────────────────────────────────────────────


def get_auth_service(db: AsyncSession = Depends(get_db_session)) -> AuthService:
    """Get auth service instance with database session."""
    return AuthService(db)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db_session),
) -> UserModel | None:
    """Get current user from JWT token (optional - returns None if not authenticated).

    Use this for endpoints that work differently for authenticated vs unauthenticated users.
    """
    if not credentials:
        return None

    auth_service = AuthService(db)
    payload = auth_service.verify_token(credentials.credentials, token_type="access")

    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    user = await auth_service.get_user_by_id(user_id)
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db_session),
) -> UserModel:
    """Get current user from JWT token (required - raises 401 if not authenticated).

    Use this for endpoints that require authentication.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    auth_service = AuthService(db)
    payload = auth_service.verify_token(credentials.credentials, token_type="access")

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )

    return user


async def get_current_admin_user(
    current_user: UserModel = Depends(get_current_user),
) -> UserModel:
    """Get current user and verify they are an admin.

    Use this for admin-only endpoints.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user
