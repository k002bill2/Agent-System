"""Organization API routes for multi-tenant support."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, EmailStr

from models.organization import (
    Organization,
    OrganizationCreate,
    OrganizationUpdate,
    OrganizationStatus,
    OrganizationPlan,
    OrganizationMember,
    MemberRole,
    InviteMemberRequest,
    OrganizationInvitation,
    OrganizationStats,
    TenantContext,
)
from services.organization_service import OrganizationService
from services.notification_service import NotificationService
from models.notification import NotificationChannel, ChannelConfig, NotificationMessage, NotificationPriority, NotificationEventType
from config import get_settings


router = APIRouter(prefix="/organizations", tags=["organizations"])


# ─────────────────────────────────────────────────────────────
# Organization CRUD
# ─────────────────────────────────────────────────────────────


class CreateOrganizationRequest(BaseModel):
    """Request to create an organization with owner info."""

    organization: OrganizationCreate
    owner_user_id: str
    owner_email: EmailStr
    owner_name: str | None = None


@router.post("", response_model=Organization)
async def create_organization(data: CreateOrganizationRequest):
    """Create a new organization."""
    try:
        return OrganizationService.create_organization(
            data=data.organization,
            owner_user_id=data.owner_user_id,
            owner_email=data.owner_email,
            owner_name=data.owner_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=list[Organization])
async def list_organizations(
    status: OrganizationStatus | None = None,
    plan: OrganizationPlan | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """List all organizations."""
    return OrganizationService.list_organizations(
        status=status,
        plan=plan,
        limit=limit,
        offset=offset,
    )


@router.get("/{org_id}", response_model=Organization)
async def get_organization(org_id: str):
    """Get an organization by ID."""
    org = OrganizationService.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("/slug/{slug}", response_model=Organization)
async def get_organization_by_slug(slug: str):
    """Get an organization by slug."""
    org = OrganizationService.get_organization_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.patch("/{org_id}", response_model=Organization)
async def update_organization(org_id: str, data: OrganizationUpdate):
    """Update an organization."""
    org = OrganizationService.update_organization(org_id, data)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.delete("/{org_id}")
async def delete_organization(org_id: str):
    """Delete an organization (soft delete)."""
    if not OrganizationService.delete_organization(org_id):
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"success": True, "message": "Organization deleted"}


class UpgradePlanRequest(BaseModel):
    """Request to upgrade organization plan."""

    plan: OrganizationPlan


@router.post("/{org_id}/upgrade", response_model=Organization)
async def upgrade_plan(org_id: str, data: UpgradePlanRequest):
    """Upgrade organization plan."""
    org = OrganizationService.upgrade_plan(org_id, data.plan)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


# ─────────────────────────────────────────────────────────────
# Member Management
# ─────────────────────────────────────────────────────────────


@router.get("/{org_id}/members", response_model=list[OrganizationMember])
async def list_members(org_id: str):
    """List all members of an organization."""
    return OrganizationService.get_members(org_id)


async def send_invitation_email(
    org_name: str,
    invitation: OrganizationInvitation,
) -> tuple[bool, str | None]:
    """Send invitation email to the invited user."""
    from services.notification_service import EmailAdapter, ADAPTERS

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
{f'Message: {invitation.message}' if invitation.message else ''}

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
async def invite_member(org_id: str, data: InviteMemberRequest, invited_by: str):
    """Invite a new member to the organization."""
    try:
        invitation = OrganizationService.invite_member(org_id, data, invited_by)

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
async def list_invitations(org_id: str):
    """List pending invitations for an organization."""
    return OrganizationService.get_pending_invitations(org_id)


@router.delete("/{org_id}/invitations/{invitation_id}")
async def cancel_invitation(org_id: str, invitation_id: str):
    """Cancel a pending invitation."""
    try:
        OrganizationService.cancel_invitation(org_id, invitation_id)
        return {"success": True, "message": "Invitation cancelled"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class AcceptInvitationRequest(BaseModel):
    """Request to accept an invitation."""

    token: str
    user_id: str
    user_name: str | None = None


@router.post("/invitations/accept", response_model=OrganizationMember)
async def accept_invitation(data: AcceptInvitationRequest):
    """Accept an invitation and join the organization."""
    try:
        return OrganizationService.accept_invitation(
            token=data.token,
            user_id=data.user_id,
            user_name=data.user_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class UpdateRoleRequest(BaseModel):
    """Request to update member role."""

    role: MemberRole


@router.patch("/{org_id}/members/{member_id}/role", response_model=OrganizationMember)
async def update_member_role(org_id: str, member_id: str, data: UpdateRoleRequest):
    """Update a member's role."""
    try:
        member = OrganizationService.update_member_role(member_id, data.role)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")
        return member
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{org_id}/members/{member_id}")
async def remove_member(org_id: str, member_id: str):
    """Remove a member from the organization."""
    try:
        if not OrganizationService.remove_member(member_id):
            raise HTTPException(status_code=404, detail="Member not found")
        return {"success": True, "message": "Member removed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─────────────────────────────────────────────────────────────
# User Organizations
# ─────────────────────────────────────────────────────────────


@router.get("/user/{user_id}/organizations", response_model=list[Organization])
async def get_user_organizations(user_id: str):
    """Get all organizations a user belongs to."""
    return OrganizationService.get_user_organizations(user_id)


@router.get("/user/{user_id}/memberships", response_model=list[OrganizationMember])
async def get_user_memberships(user_id: str):
    """Get all memberships for a user."""
    return OrganizationService.get_user_memberships(user_id)


# ─────────────────────────────────────────────────────────────
# Tenant Context
# ─────────────────────────────────────────────────────────────


@router.get("/{org_id}/context/{user_id}", response_model=TenantContext)
async def get_tenant_context(org_id: str, user_id: str):
    """Get tenant context for a user within an organization."""
    context = OrganizationService.get_tenant_context(org_id, user_id)
    if not context:
        raise HTTPException(status_code=403, detail="Access denied")
    return context


# ─────────────────────────────────────────────────────────────
# Statistics
# ─────────────────────────────────────────────────────────────


@router.get("/{org_id}/stats", response_model=OrganizationStats)
async def get_organization_stats(org_id: str):
    """Get statistics for an organization."""
    return OrganizationService.get_organization_stats(org_id)


# ─────────────────────────────────────────────────────────────
# Usage Tracking
# ─────────────────────────────────────────────────────────────


class TrackUsageRequest(BaseModel):
    """Request to track token usage."""

    tokens: int


@router.post("/{org_id}/usage/track")
async def track_usage(org_id: str, data: TrackUsageRequest):
    """Track token usage for an organization."""
    if not OrganizationService.track_token_usage(org_id, data.tokens):
        raise HTTPException(
            status_code=429,
            detail="Token limit exceeded for this billing period",
        )
    return {"success": True, "tokens_tracked": data.tokens}
