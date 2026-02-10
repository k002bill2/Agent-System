"""Organization API routes for multi-tenant support."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import (
    get_current_user,
    get_db_session,
    require_org_member,
    require_org_role,
)
from config import get_settings
from db.models import UserModel

logger = logging.getLogger(__name__)
from models.notification import (
    ChannelConfig,
    NotificationChannel,
    NotificationEventType,
    NotificationMessage,
    NotificationPriority,
)
from models.organization import (
    InviteMemberRequest,
    MemberRole,
    Organization,
    OrganizationCreate,
    OrganizationInvitation,
    OrganizationMember,
    OrganizationPlan,
    OrganizationStats,
    OrganizationStatus,
    OrganizationUpdate,
    TenantContext,
)
from services.notification_service import NotificationService
from services.organization_service import OrganizationService

router = APIRouter(prefix="/organizations", tags=["organizations"])


async def _sync_user_role(db: AsyncSession, user_id: str) -> None:
    """Helper to sync a user's role from their organization memberships."""
    from services.auth_service import AuthService

    auth_service = AuthService(db)
    user = await auth_service.get_user_by_id(user_id)
    if user:
        await auth_service.sync_user_role_from_org(user)


# ─────────────────────────────────────────────────────────────
# Organization CRUD
# ─────────────────────────────────────────────────────────────


class CreateOrganizationRequest(BaseModel):
    """Request to create an organization."""

    organization: OrganizationCreate
    owner_name: str | None = None


@router.post("", response_model=Organization)
async def create_organization(
    data: CreateOrganizationRequest,
    current_user: UserModel = Depends(get_current_user),
):
    """Create a new organization. The current user becomes the owner."""
    try:
        return OrganizationService.create_organization(
            data=data.organization,
            owner_user_id=current_user.id,
            owner_email=current_user.email or "",
            owner_name=data.owner_name or current_user.name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=list[Organization])
async def list_organizations(
    status: OrganizationStatus | None = None,
    plan: OrganizationPlan | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: UserModel = Depends(get_current_user),
):
    """List organizations the current user belongs to (admins see all)."""
    # System admins can see all organizations
    if current_user.role == "admin" or current_user.is_admin:
        return OrganizationService.list_organizations(
            status=status,
            plan=plan,
            limit=limit,
            offset=offset,
        )
    # Regular users only see their own organizations
    return OrganizationService.get_user_organizations(current_user.id)


@router.get("/{org_id}", response_model=Organization)
async def get_organization(
    org_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get an organization by ID. Requires membership."""
    await require_org_member(org_id, current_user, db)
    org = OrganizationService.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("/slug/{slug}", response_model=Organization)
async def get_organization_by_slug(
    slug: str,
    current_user: UserModel = Depends(get_current_user),
):
    """Get an organization by slug. Requires authentication."""
    org = OrganizationService.get_organization_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.patch("/{org_id}", response_model=Organization)
async def update_organization(
    org_id: str,
    data: OrganizationUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update an organization. Requires admin role in the org."""
    await require_org_role(org_id, current_user, db, min_role=MemberRole.ADMIN)
    org = OrganizationService.update_organization(org_id, data)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.delete("/{org_id}")
async def delete_organization(
    org_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete an organization (soft delete). Requires owner role."""
    await require_org_role(org_id, current_user, db, min_role=MemberRole.OWNER)
    if not OrganizationService.delete_organization(org_id):
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"success": True, "message": "Organization deleted"}


class UpgradePlanRequest(BaseModel):
    """Request to upgrade organization plan."""

    plan: OrganizationPlan


@router.post("/{org_id}/upgrade", response_model=Organization)
async def upgrade_plan(
    org_id: str,
    data: UpgradePlanRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Upgrade organization plan. Requires admin role."""
    await require_org_role(org_id, current_user, db, min_role=MemberRole.ADMIN)
    org = OrganizationService.upgrade_plan(org_id, data.plan)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


# ─────────────────────────────────────────────────────────────
# Member Management
# ─────────────────────────────────────────────────────────────


@router.get("/{org_id}/members", response_model=list[OrganizationMember])
async def list_members(
    org_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all members of an organization. Requires membership."""
    await require_org_member(org_id, current_user, db)
    return OrganizationService.get_members(org_id)


async def send_invitation_email(
    org_name: str,
    invitation: OrganizationInvitation,
) -> tuple[bool, str | None]:
    """Send invitation email to the invited user."""
    from services.notification_service import ADAPTERS

    config = NotificationService.get_channel_config(NotificationChannel.EMAIL)

    if not config.enabled:
        return False, "Email channel is disabled"

    if not config.smtp_host or not config.smtp_username or not config.smtp_password:
        return False, "SMTP not configured"

    # Create config with recipient email
    recipient_config = ChannelConfig(
        channel=NotificationChannel.EMAIL,
        enabled=True,
        email_address=invitation.email,  # Send to invited user
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_username=config.smtp_username,
        smtp_password=config.smtp_password,
        smtp_use_tls=config.smtp_use_tls,
    )

    settings = get_settings()
    accept_url = f"{settings.frontend_url}/invitations/accept?token={invitation.token}"

    message = NotificationMessage(
        event_type=NotificationEventType.SESSION_STARTED,  # Reuse existing type
        priority=NotificationPriority.MEDIUM,
        title=f"You're invited to join {org_name}",
        body=f"""You have been invited to join the organization "{org_name}" on Agent Orchestration Service.

Role: {invitation.role.value.title()}
{f"Message: {invitation.message}" if invitation.message else ""}

Click the link below to accept the invitation:
{accept_url}

This invitation expires in 7 days.""",
        channels=[NotificationChannel.EMAIL],
        data={},
    )

    adapter = ADAPTERS.get(NotificationChannel.EMAIL)
    if not adapter:
        return False, "Email adapter not found"

    return await adapter.send(message, recipient_config)


class InvitationResponse(BaseModel):
    """Response for invitation with email status."""

    invitation: OrganizationInvitation
    email_sent: bool
    email_error: str | None = None


@router.post("/{org_id}/members/invite", response_model=InvitationResponse)
async def invite_member(
    org_id: str,
    data: InviteMemberRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Invite a new member to the organization. Requires admin role."""
    await require_org_role(org_id, current_user, db, min_role=MemberRole.ADMIN)
    try:
        invitation = OrganizationService.invite_member(org_id, data, current_user.id)

        # Get organization name for email
        org = OrganizationService.get_organization(org_id)
        org_name = org.name if org else "Organization"

        # Send invitation email
        success, error = await send_invitation_email(org_name, invitation)

        return InvitationResponse(
            invitation=invitation,
            email_sent=success,
            email_error=error,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{org_id}/invitations")
async def list_invitations(
    org_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List pending invitations for an organization. Requires admin role."""
    await require_org_role(org_id, current_user, db, min_role=MemberRole.ADMIN)
    return OrganizationService.get_pending_invitations(org_id)


@router.delete("/{org_id}/invitations/{invitation_id}")
async def cancel_invitation(
    org_id: str,
    invitation_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Cancel a pending invitation. Requires admin role."""
    await require_org_role(org_id, current_user, db, min_role=MemberRole.ADMIN)
    try:
        OrganizationService.cancel_invitation(org_id, invitation_id)
        return {"success": True, "message": "Invitation cancelled"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class AcceptInvitationRequest(BaseModel):
    """Request to accept an invitation."""

    token: str
    user_name: str | None = None


@router.post("/invitations/accept", response_model=OrganizationMember)
async def accept_invitation(
    data: AcceptInvitationRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Accept an invitation and join the organization."""
    try:
        member = OrganizationService.accept_invitation(
            token=data.token,
            user_id=current_user.id,
            user_name=data.user_name or current_user.name,
        )

        # Sync user role from organization membership
        await _sync_user_role(db, current_user.id)

        return member
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class UpdateRoleRequest(BaseModel):
    """Request to update member role."""

    role: MemberRole


@router.patch("/{org_id}/members/{member_id}/role", response_model=OrganizationMember)
async def update_member_role(
    org_id: str,
    member_id: str,
    data: UpdateRoleRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a member's role. Requires owner role."""
    await require_org_role(org_id, current_user, db, min_role=MemberRole.OWNER)
    try:
        member = OrganizationService.update_member_role(member_id, data.role)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        # Sync user role from organization membership
        if member.user_id:
            await _sync_user_role(db, member.user_id)

        return member
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{org_id}/members/{member_id}")
async def remove_member(
    org_id: str,
    member_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a member from the organization. Requires admin role."""
    await require_org_role(org_id, current_user, db, min_role=MemberRole.ADMIN)
    try:
        # Get user_id before removal for role sync
        members = OrganizationService.get_members(org_id)
        target_user_id = None
        for m in members:
            if m.id == member_id:
                target_user_id = m.user_id
                break

        if not OrganizationService.remove_member(member_id):
            raise HTTPException(status_code=404, detail="Member not found")

        # Sync user role after removal (recalculate from remaining orgs)
        if target_user_id:
            await _sync_user_role(db, target_user_id)

        return {"success": True, "message": "Member removed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─────────────────────────────────────────────────────────────
# User Organizations
# ─────────────────────────────────────────────────────────────


@router.get("/user/{user_id}/organizations", response_model=list[Organization])
async def get_user_organizations(
    user_id: str,
    current_user: UserModel = Depends(get_current_user),
):
    """Get all organizations a user belongs to. Users can only query their own."""
    if current_user.id != user_id and not (current_user.role == "admin" or current_user.is_admin):
        raise HTTPException(status_code=403, detail="Cannot view other user's organizations")
    return OrganizationService.get_user_organizations(user_id)


@router.get("/user/{user_id}/memberships", response_model=list[OrganizationMember])
async def get_user_memberships(
    user_id: str,
    current_user: UserModel = Depends(get_current_user),
):
    """Get all memberships for a user. Users can only query their own."""
    if current_user.id != user_id and not (current_user.role == "admin" or current_user.is_admin):
        raise HTTPException(status_code=403, detail="Cannot view other user's memberships")
    return OrganizationService.get_user_memberships(user_id)


# ─────────────────────────────────────────────────────────────
# Tenant Context
# ─────────────────────────────────────────────────────────────


@router.get("/{org_id}/context/{user_id}", response_model=TenantContext)
async def get_tenant_context(
    org_id: str,
    user_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get tenant context for a user within an organization."""
    # Users can only get their own context, admins can get any
    if current_user.id != user_id and not (current_user.role == "admin" or current_user.is_admin):
        raise HTTPException(status_code=403, detail="Access denied")
    await require_org_member(org_id, current_user, db)
    context = OrganizationService.get_tenant_context(org_id, user_id)
    if not context:
        raise HTTPException(status_code=403, detail="Access denied")
    return context


# ─────────────────────────────────────────────────────────────
# Statistics
# ─────────────────────────────────────────────────────────────


@router.get("/{org_id}/stats", response_model=OrganizationStats)
async def get_organization_stats(
    org_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get statistics for an organization. Requires membership."""
    await require_org_member(org_id, current_user, db)
    return OrganizationService.get_organization_stats(org_id)


# ─────────────────────────────────────────────────────────────
# Usage Tracking
# ─────────────────────────────────────────────────────────────


class TrackUsageRequest(BaseModel):
    """Request to track token usage."""

    tokens: int
    user_id: str | None = None
    session_id: str | None = None
    model: str | None = None


@router.post("/{org_id}/usage/track")
async def track_usage(
    org_id: str,
    data: TrackUsageRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Track token usage for an organization. Requires membership."""
    await require_org_member(org_id, current_user, db)
    if not OrganizationService.track_token_usage(
        org_id,
        data.tokens,
        user_id=data.user_id or current_user.id,
        session_id=data.session_id,
        model=data.model,
    ):
        raise HTTPException(
            status_code=429,
            detail="Token limit exceeded for this billing period",
        )
    return {"success": True, "tokens_tracked": data.tokens}


# ─────────────────────────────────────────────────────────────
# Member Usage Analytics
# ─────────────────────────────────────────────────────────────


@router.get("/{org_id}/members/usage")
async def get_member_usage(
    org_id: str,
    period: str = Query(default="month", regex="^(day|week|month)$"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get per-member usage breakdown. Requires admin role in the org."""
    await require_org_role(org_id, current_user, db, min_role=MemberRole.ADMIN)
    org = OrganizationService.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    usage = OrganizationService.get_member_usage(org_id, period=period)
    return usage.model_dump()


# ─────────────────────────────────────────────────────────────
# Quota Status
# ─────────────────────────────────────────────────────────────


@router.get("/{org_id}/quota")
async def get_quota_status(
    org_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get quota status. Requires membership."""
    from services.quota_service import QuotaService

    await require_org_member(org_id, current_user, db)
    org = OrganizationService.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Get today's session count
    sessions_today = org.sessions_today

    status = QuotaService.get_quota_status(org, sessions_today)
    return status.model_dump()
