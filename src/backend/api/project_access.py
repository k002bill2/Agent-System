"""Project access control (RBAC) API routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db_session, require_project_role
from db.models import UserModel
from services.project_access_service import ProjectAccessService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/projects/{project_id}/access",
    tags=["project-access"],
)


# ─────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────


class ProjectAccessCreate(BaseModel):
    """Request to grant access to a user."""

    user_id: str
    role: str = "viewer"  # owner, editor, viewer


class ProjectAccessUpdate(BaseModel):
    """Request to update a member's role."""

    role: str  # owner, editor, viewer


class ProjectAccessResponse(BaseModel):
    """Response for a project access record."""

    id: str
    project_id: str
    user_id: str
    user_email: str | None = None
    user_name: str | None = None
    role: str
    granted_by: str | None = None
    created_at: str
    updated_at: str


class MyAccessResponse(BaseModel):
    """Response for current user's access to a project."""

    project_id: str
    role: str | None = None
    has_access: bool = False


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

_VALID_ROLES = {"owner", "editor", "viewer"}


def _validate_role(role: str) -> None:
    if role not in _VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{role}'. Must be one of: {', '.join(_VALID_ROLES)}",
        )


def _to_response(access) -> ProjectAccessResponse:
    """Convert a ProjectAccessModel to response."""
    user_email = None
    user_name = None
    if access.user:
        user_email = access.user.email
        user_name = access.user.name

    return ProjectAccessResponse(
        id=access.id,
        project_id=access.project_id,
        user_id=access.user_id,
        user_email=user_email,
        user_name=user_name,
        role=access.role,
        granted_by=access.granted_by,
        created_at=access.created_at.isoformat() if access.created_at else "",
        updated_at=access.updated_at.isoformat() if access.updated_at else "",
    )


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("", response_model=list[ProjectAccessResponse])
async def list_members(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all members with access to a project. Requires viewer+ role."""
    await require_project_role(project_id, current_user, db, min_role="viewer")

    members = await ProjectAccessService.list_members(db, project_id)

    # Eagerly load user relationships
    results = []
    for m in members:
        # Access the user relationship (should be loaded)
        await db.refresh(m, ["user"])
        results.append(_to_response(m))

    return results


@router.post("", response_model=ProjectAccessResponse, status_code=201)
async def add_member(
    project_id: str,
    request: ProjectAccessCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Add a member to a project. Requires owner role."""
    await require_project_role(project_id, current_user, db, min_role="owner")
    _validate_role(request.role)

    try:
        access = await ProjectAccessService.grant_access(
            db=db,
            project_id=project_id,
            user_id=request.user_id,
            role=request.role,
            granted_by=current_user.id,
        )
        await db.refresh(access, ["user"])
        return _to_response(access)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.put("/{user_id}", response_model=ProjectAccessResponse)
async def update_member_role(
    project_id: str,
    user_id: str,
    request: ProjectAccessUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a member's role. Requires owner role."""
    await require_project_role(project_id, current_user, db, min_role="owner")
    _validate_role(request.role)

    try:
        access = await ProjectAccessService.update_role(
            db=db,
            project_id=project_id,
            user_id=user_id,
            new_role=request.role,
        )
        await db.refresh(access, ["user"])
        return _to_response(access)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{user_id}")
async def remove_member(
    project_id: str,
    user_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a member from a project. Requires owner role."""
    await require_project_role(project_id, current_user, db, min_role="owner")

    revoked = await ProjectAccessService.revoke_access(db, project_id, user_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="Access record not found")

    return {"message": "Access revoked", "project_id": project_id, "user_id": user_id}


@router.get("/me", response_model=MyAccessResponse)
async def get_my_access(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get the current user's role in a project."""
    # System admin
    if current_user.role == "admin" or current_user.is_admin:
        return MyAccessResponse(project_id=project_id, role="owner", has_access=True)

    # Check if project has ACL
    has_acl = await ProjectAccessService.has_any_access_control(db, project_id)
    if not has_acl:
        return MyAccessResponse(project_id=project_id, role="editor", has_access=True)

    role = await ProjectAccessService.check_access(db, project_id, current_user.id)
    return MyAccessResponse(
        project_id=project_id,
        role=role,
        has_access=role is not None,
    )
