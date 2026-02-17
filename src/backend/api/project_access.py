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


# ─────────────────────────────────────────────────────────────
# Invitation Endpoints
# ─────────────────────────────────────────────────────────────

invitation_router = APIRouter(
    prefix="/projects/{project_id}/invitations",
    tags=["project-invitations"],
)

public_invitation_router = APIRouter(
    prefix="/invitations",
    tags=["project-invitations"],
)


class InvitationCreate(BaseModel):
    """Request to create an invitation."""

    email: str
    role: str = "viewer"


class InvitationResponse(BaseModel):
    """Response for a project invitation."""

    id: str
    project_id: str
    email: str
    role: str
    status: str
    expires_at: str
    created_at: str


class InvitationPreviewResponse(BaseModel):
    """Response for invitation preview (public endpoint)."""

    project_id: str
    project_name: str | None = None
    email: str
    role: str
    expires_at: str
    valid: bool


def _to_invitation_response(inv) -> InvitationResponse:
    return InvitationResponse(
        id=inv.id,
        project_id=inv.project_id,
        email=inv.email,
        role=inv.role,
        status=inv.status,
        expires_at=inv.expires_at.isoformat() if inv.expires_at else "",
        created_at=inv.created_at.isoformat() if inv.created_at else "",
    )


@invitation_router.post("", response_model=InvitationResponse, status_code=201)
async def create_invitation(
    project_id: str,
    request: InvitationCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """이메일로 프로젝트 초대 생성. owner 권한 필요."""
    await require_project_role(project_id, current_user, db, min_role="owner")
    if request.role not in {"owner", "editor", "viewer"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    from services.project_invitation_service import ProjectInvitationService

    inv = await ProjectInvitationService.create_invitation(
        db=db,
        project_id=project_id,
        invited_by=current_user.id,
        email=request.email,
        role=request.role,
    )
    logger.info(f"Invitation created: {inv.token[:8]}... → {request.email}")
    return _to_invitation_response(inv)


@invitation_router.get("", response_model=list[InvitationResponse])
async def list_invitations(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """pending 초대 목록. owner 권한 필요."""
    await require_project_role(project_id, current_user, db, min_role="owner")

    from services.project_invitation_service import ProjectInvitationService

    invs = await ProjectInvitationService.list_pending(db, project_id)
    return [_to_invitation_response(i) for i in invs]


@invitation_router.delete("/{invitation_id}")
async def cancel_invitation(
    project_id: str,
    invitation_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """초대 취소. owner 권한 필요."""
    await require_project_role(project_id, current_user, db, min_role="owner")

    from services.project_invitation_service import ProjectInvitationService

    cancelled = await ProjectInvitationService.cancel_invitation(db, invitation_id, project_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return {"message": "Invitation cancelled"}


@public_invitation_router.get("/{token}", response_model=InvitationPreviewResponse)
async def preview_invitation(
    token: str,
    db: AsyncSession = Depends(get_db_session),
):
    """토큰으로 초대 미리보기 (인증 불필요)."""
    from datetime import datetime as dt

    from sqlalchemy import select

    from db.models import ProjectModel
    from services.project_invitation_service import ProjectInvitationService

    inv = await ProjectInvitationService.get_by_token(db, token)
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")

    valid = inv.status == "pending" and inv.expires_at > dt.utcnow()

    proj_result = await db.execute(select(ProjectModel).where(ProjectModel.id == inv.project_id))
    project = proj_result.scalar_one_or_none()

    return InvitationPreviewResponse(
        project_id=inv.project_id,
        project_name=project.name if project else None,
        email=inv.email,
        role=inv.role,
        expires_at=inv.expires_at.isoformat(),
        valid=valid,
    )


@public_invitation_router.post("/{token}/accept")
async def accept_invitation(
    token: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """초대 수락. 로그인 필요."""
    from services.project_invitation_service import ProjectInvitationService

    try:
        access = await ProjectInvitationService.accept_invitation(
            db=db,
            token=token,
            user_id=current_user.id,
            user_email=current_user.email,
        )
        return {
            "message": "초대를 수락했습니다",
            "project_id": access.project_id,
            "role": access.role,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
