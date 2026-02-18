"""Dependency injection for API routes."""

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import async_session_factory
from db.models import OrganizationMemberModel, UserModel
from db.repository import ApprovalRepository, MessageRepository, SessionRepository, TaskRepository
from models.organization import MemberRole
from orchestrator import OrchestrationEngine
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
    # role 필드 우선, is_admin은 레거시 폴백
    is_admin = current_user.role == "admin" or current_user.is_admin
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


# ─────────────────────────────────────────────────────────────
# Organization Role Dependencies
# ─────────────────────────────────────────────────────────────

# Role hierarchy for comparison
_ORG_ROLE_HIERARCHY: dict[str, int] = {
    MemberRole.VIEWER.value: 0,
    MemberRole.MEMBER.value: 1,
    MemberRole.ADMIN.value: 2,
    MemberRole.OWNER.value: 3,
}


async def _get_org_membership(
    org_id: str,
    user: UserModel,
    db: AsyncSession,
) -> "OrganizationMemberModel | None":
    """Get user's membership in a specific organization.

    Checks the DB first, then falls back to the in-memory/JSON service.
    This handles orgs created via the sync API (stored in JSON, not DB).
    """
    from sqlalchemy import and_, select

    from db.models import OrganizationMemberModel

    result = await db.execute(
        select(OrganizationMemberModel).where(
            and_(
                OrganizationMemberModel.organization_id == org_id,
                OrganizationMemberModel.user_id == user.id,
                OrganizationMemberModel.is_active == True,  # noqa: E712
            )
        )
    )
    db_membership = result.scalar_one_or_none()
    if db_membership:
        return db_membership

    # Fallback: check in-memory/JSON service (org created via sync API)
    from services.organization_service import OrganizationService

    mem_membership = OrganizationService.get_member_by_user(org_id, user.id)
    if mem_membership:
        role_value = (
            mem_membership.role.value
            if hasattr(mem_membership.role, "value")
            else mem_membership.role
        )
        synthetic = OrganizationMemberModel(
            id=mem_membership.id,
            organization_id=org_id,
            user_id=user.id,
            email=user.email or "",
            role=role_value,
            is_active=True,
        )
        return synthetic

    return None


async def require_org_member(
    org_id: str,
    current_user: UserModel,
    db: AsyncSession,
) -> "OrganizationMemberModel":
    """Verify user is a member of the organization (any role)."""
    # System admins bypass org membership check
    if current_user.role == "admin" or current_user.is_admin:
        # Return a synthetic membership for admin access
        from db.models import OrganizationMemberModel

        membership = await _get_org_membership(org_id, current_user, db)
        if membership:
            return membership
        # Admin can still access even without membership
        synthetic = OrganizationMemberModel(
            id="system-admin",
            organization_id=org_id,
            user_id=current_user.id,
            email=current_user.email or "",
            role=MemberRole.OWNER.value,
            is_active=True,
        )
        return synthetic

    membership = await _get_org_membership(org_id, current_user, db)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )
    return membership


async def require_org_role(
    org_id: str,
    current_user: UserModel,
    db: AsyncSession,
    min_role: MemberRole = MemberRole.MEMBER,
) -> "OrganizationMemberModel":
    """Verify user has at least the specified role in the organization."""
    membership = await require_org_member(org_id, current_user, db)

    user_level = _ORG_ROLE_HIERARCHY.get(membership.role, 0)
    required_level = _ORG_ROLE_HIERARCHY.get(min_role.value, 0)

    if user_level < required_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least '{min_role.value}' role in this organization",
        )
    return membership


# ─────────────────────────────────────────────────────────────
# Project Role Dependencies (RBAC)
# ─────────────────────────────────────────────────────────────

_PROJECT_ROLE_HIERARCHY: dict[str, int] = {
    "viewer": 0,
    "editor": 1,
    "owner": 2,
}


async def require_project_role(
    project_id: str,
    current_user: UserModel,
    db: AsyncSession,
    min_role: str = "viewer",
) -> str:
    """Verify user has at least the specified role in a project.

    Returns the user's role string.

    Rules:
    - System admins (role=="admin" or is_admin==True) bypass all checks.
    - Projects with no access control records are open to all authenticated users.
    - Otherwise, the user must have at least `min_role` level.
    """
    from services.project_access_service import ProjectAccessService

    # System admin bypass
    if current_user.role == "admin" or current_user.is_admin:
        return "owner"

    # Check if the project has any access control
    has_acl = await ProjectAccessService.has_any_access_control(db, project_id)
    if not has_acl:
        # No access control → open to all authenticated users
        return "editor"

    # Check user's role
    user_role = await ProjectAccessService.check_access(db, project_id, current_user.id)
    if user_role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this project",
        )

    user_level = _PROJECT_ROLE_HIERARCHY.get(user_role, 0)
    required_level = _PROJECT_ROLE_HIERARCHY.get(min_role, 0)

    if user_level < required_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least '{min_role}' role in this project",
        )

    return user_role
