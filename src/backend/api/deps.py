"""Dependency injection for API routes."""

import asyncio
import os
from collections.abc import AsyncGenerator, Mapping
from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException, Query, WebSocket, WebSocketException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import async_session_factory
from db.models import OrganizationMemberModel, UserModel
from db.repository import MessageRepository, SessionRepository, TaskRepository
from models.organization import MemberRole
from orchestrator import OrchestrationEngine
from services.auth_service import AuthService

if TYPE_CHECKING:
    from models.project import Project

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


async def resolve_project(project_id: str, db: AsyncSession | None) -> "Project | None":
    """Resolve a project id against whichever registry is authoritative.

    Database mode keys projects by ``ProjectModel.id`` (a UUID minted at seed
    time) while the in-memory ``PROJECTS_REGISTRY`` is keyed by the
    ``projects/<name>`` symlink directory. The two id spaces never overlap, so
    a filesystem-only lookup misses every id ``GET /api/projects`` is able to
    hand the dashboard. Resolve against the DB registry there.

    The DB row carries only registry metadata, so the filesystem-derived fields
    are rebuilt from the stored path: ``claude_md`` (context routes),
    ``git_path``/``git_enabled`` (diagnostics' git category) and the on-disk
    ``.aos-project.json``. DB columns then win over that file - the DB registry
    is the source of truth for name, description and ownership.

    Resolution only. Callers authorize with ``require_project_role`` themselves
    because the required role differs per route (viewer to read diagnostics,
    owner to delete); re-authorizing here at a fixed role would invite a later
    caller to drop its own stricter check.
    """
    from models.project import Project, get_project

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return get_project(project_id)

    # Handlers whose auth branch is skipped for non-DB callers pass a stub db.
    if db is None or not hasattr(db, "execute"):
        return get_project(project_id)

    from sqlalchemy import select

    from db.models import ProjectModel

    try:
        row = (
            await db.execute(
                select(ProjectModel).where(
                    ProjectModel.id == project_id,
                    ProjectModel.is_active == True,  # noqa: E712
                )
            )
        ).scalar_one_or_none()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project registry is temporarily unavailable",
        ) from exc

    if row is None:
        return None

    path = str(row.path or "").strip()
    if not path:
        # ProjectModel.path is nullable. A pathless row cannot serve any
        # filesystem-backed route, and an empty path would send the diagnostics
        # and monitoring services walking the process CWD instead.
        return None

    try:
        # from_path reads CLAUDE.md, package.json and .aos-project.json and
        # stats .git. On a network or cold filesystem that is long enough to
        # stall the loop, and this runs on every project-scoped request.
        project = await asyncio.to_thread(Project.from_path, project_id, path)
    except OSError:
        # Unreadable workspace: still resolve so diagnostics can report *why*.
        project = Project(id=project_id, name=row.name, path=path)

    project.name = row.name
    project.description = row.description or project.description
    if row.organization_id:
        project.organization_id = str(row.organization_id)
    project.sort_order = (row.settings or {}).get("sort_order", project.sort_order)
    return project


async def get_project_or_404(project_id: str, db: AsyncSession | None) -> "Project":
    """``resolve_project`` with the 404 every caller would otherwise repeat."""
    project = await resolve_project(project_id, db)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ─────────────────────────────────────────────────────────────
# Database Dependencies
# ─────────────────────────────────────────────────────────────


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session for dependency injection."""
    try:
        session_context = async_session_factory()
        session = await session_context.__aenter__()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database service is temporarily unavailable",
        ) from exc

    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session_context.__aexit__(None, None, None)


def get_session_repository(db: AsyncSession) -> SessionRepository:
    """Get session repository."""
    return SessionRepository(db)


def get_task_repository(db: AsyncSession) -> TaskRepository:
    """Get task repository."""
    return TaskRepository(db)


def get_message_repository(db: AsyncSession) -> MessageRepository:
    """Get message repository."""
    return MessageRepository(db)


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


async def get_current_user_websocket(
    websocket: WebSocket,
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
) -> UserModel:
    """Authenticate a WebSocket via query token or Authorization header."""
    authorization = websocket.headers.get("authorization", "")
    bearer_token = token
    if not bearer_token and authorization.lower().startswith("bearer "):
        bearer_token = authorization[7:].strip()
    if not bearer_token:
        raise WebSocketException(code=1008, reason="Not authenticated")

    auth_service = AuthService(db)
    payload = auth_service.verify_token(bearer_token, token_type="access")
    user_id = payload.get("sub") if payload else None
    user = await auth_service.get_user_by_id(user_id) if user_id else None
    if not user:
        raise WebSocketException(code=1008, reason="Invalid or expired token")
    if not user.is_active:
        raise WebSocketException(code=1008, reason="User is inactive")
    return user


def is_privileged_user(current_user: UserModel) -> bool:
    """True when the user may reach resources they do not own.

    ``is_admin`` is a legacy fallback kept for accounts provisioned before the
    ``role`` column existed.
    """
    return current_user.role in {"admin", "manager"} or bool(current_user.is_admin)


def authorize_owner_or_privileged(owner_id: object, current_user: UserModel) -> None:
    """Require resource ownership or an admin/manager role."""
    if is_privileged_user(current_user):
        return
    if owner_id is None or str(owner_id) != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Resource access denied")


def authorize_session_state(state: Mapping[str, object], current_user: UserModel) -> None:
    """Authorize a session state using its persisted owner metadata."""
    authorize_owner_or_privileged(state.get("user_id"), current_user)


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


async def get_current_admin_or_manager_user(
    current_user: UserModel = Depends(get_current_user),
) -> UserModel:
    """Get current user and verify they are an admin or manager.

    Use this for endpoints managed by admins and managers (e.g. deployment-wide
    usage credential CRUD). ``is_admin`` is a legacy fallback.
    """
    allowed = current_user.role in ("admin", "manager") or current_user.is_admin
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or manager privileges required",
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
    return db_membership


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

    # Database mode is authoritative. Do this check before ACL handling so a
    # known filesystem-only project ID cannot reach legacy project handlers.
    if os.getenv("USE_DATABASE", "false").lower() == "true":
        from sqlalchemy import select

        from db.models import ProjectModel

        try:
            registered = await db.execute(
                select(ProjectModel).where(
                    ProjectModel.id == project_id,
                    ProjectModel.is_active == True,  # noqa: E712
                )
            )
            if registered.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail="Project not found")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail="Project access control is temporarily unavailable",
            ) from exc

    # System admin bypass
    if current_user.role == "admin" or current_user.is_admin:
        return "owner"

    try:
        # Check if the project has any access control
        has_acl = await ProjectAccessService.has_any_access_control(db, project_id)
        if not has_acl:
            # No access control → open to all authenticated users
            return "editor"

        # Check user's role
        user_role = await ProjectAccessService.check_access(db, project_id, current_user.id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project access control is temporarily unavailable",
        ) from exc

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
