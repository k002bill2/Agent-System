"""Organization service for multi-tenant management."""

import re
from datetime import datetime, timedelta
from typing import Any

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
    PLAN_LIMITS,
)


# In-memory storage
_organizations: dict[str, Organization] = {}
_members: dict[str, OrganizationMember] = {}
_invitations: dict[str, OrganizationInvitation] = {}

# Indexes
_slug_to_id: dict[str, str] = {}
_user_orgs: dict[str, list[str]] = {}  # user_id -> list of org_ids


class OrganizationService:
    """Service for managing organizations and members."""

    # ─────────────────────────────────────────────────────────────
    # Organization CRUD
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def create_organization(
        data: OrganizationCreate,
        owner_user_id: str,
        owner_email: str,
        owner_name: str | None = None,
    ) -> Organization:
        """Create a new organization with an owner."""
        # Validate slug format
        if not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$", data.slug) or len(data.slug) < 3:
            raise ValueError("Slug must be lowercase alphanumeric with hyphens, min 3 chars")

        # Check slug uniqueness
        if data.slug in _slug_to_id:
            raise ValueError(f"Slug '{data.slug}' is already taken")

        # Get plan limits
        limits = PLAN_LIMITS.get(data.plan, PLAN_LIMITS[OrganizationPlan.FREE])

        # Create organization
        org = Organization(
            name=data.name,
            slug=data.slug,
            description=data.description,
            contact_email=data.contact_email,
            contact_name=data.contact_name,
            plan=data.plan,
            max_members=limits["max_members"],
            max_projects=limits["max_projects"],
            max_sessions_per_day=limits["max_sessions_per_day"],
            max_tokens_per_month=limits["max_tokens_per_month"],
        )

        # Store organization
        _organizations[org.id] = org
        _slug_to_id[org.slug] = org.id

        # Add owner as member
        owner_member = OrganizationMember(
            organization_id=org.id,
            user_id=owner_user_id,
            email=owner_email,
            name=owner_name,
            role=MemberRole.OWNER,
            joined_at=datetime.utcnow(),
        )
        _members[owner_member.id] = owner_member

        # Update user orgs index
        if owner_user_id not in _user_orgs:
            _user_orgs[owner_user_id] = []
        _user_orgs[owner_user_id].append(org.id)

        # Update member count
        org.current_members = 1

        return org

    @staticmethod
    def get_organization(org_id: str) -> Organization | None:
        """Get an organization by ID."""
        return _organizations.get(org_id)

    @staticmethod
    def get_organization_by_slug(slug: str) -> Organization | None:
        """Get an organization by slug."""
        org_id = _slug_to_id.get(slug)
        if not org_id:
            return None
        return _organizations.get(org_id)

    @staticmethod
    def list_organizations(
        status: OrganizationStatus | None = None,
        plan: OrganizationPlan | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Organization]:
        """List organizations with optional filtering."""
        orgs = list(_organizations.values())

        if status:
            orgs = [o for o in orgs if o.status == status]
        if plan:
            orgs = [o for o in orgs if o.plan == plan]

        orgs.sort(key=lambda o: o.created_at, reverse=True)
        return orgs[offset : offset + limit]

    @staticmethod
    def update_organization(org_id: str, data: OrganizationUpdate) -> Organization | None:
        """Update an organization."""
        org = _organizations.get(org_id)
        if not org:
            return None

        if data.name is not None:
            org.name = data.name
        if data.description is not None:
            org.description = data.description
        if data.contact_email is not None:
            org.contact_email = data.contact_email
        if data.contact_name is not None:
            org.contact_name = data.contact_name
        if data.logo_url is not None:
            org.logo_url = data.logo_url
        if data.primary_color is not None:
            org.primary_color = data.primary_color
        if data.settings is not None:
            org.settings.update(data.settings)

        org.updated_at = datetime.utcnow()
        return org

    @staticmethod
    def delete_organization(org_id: str) -> bool:
        """Soft delete an organization."""
        org = _organizations.get(org_id)
        if not org:
            return False

        org.status = OrganizationStatus.DELETED
        org.updated_at = datetime.utcnow()
        return True

    @staticmethod
    def upgrade_plan(org_id: str, new_plan: OrganizationPlan) -> Organization | None:
        """Upgrade organization plan."""
        org = _organizations.get(org_id)
        if not org:
            return None

        limits = PLAN_LIMITS.get(new_plan, PLAN_LIMITS[OrganizationPlan.FREE])
        org.plan = new_plan
        org.max_members = limits["max_members"]
        org.max_projects = limits["max_projects"]
        org.max_sessions_per_day = limits["max_sessions_per_day"]
        org.max_tokens_per_month = limits["max_tokens_per_month"]
        org.updated_at = datetime.utcnow()
        return org

    # ─────────────────────────────────────────────────────────────
    # Member Management
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_members(org_id: str) -> list[OrganizationMember]:
        """Get all members of an organization."""
        return [m for m in _members.values() if m.organization_id == org_id and m.is_active]

    @staticmethod
    def get_member(member_id: str) -> OrganizationMember | None:
        """Get a specific member."""
        return _members.get(member_id)

    @staticmethod
    def get_member_by_user(org_id: str, user_id: str) -> OrganizationMember | None:
        """Get a member by user ID within an organization."""
        for m in _members.values():
            if m.organization_id == org_id and m.user_id == user_id and m.is_active:
                return m
        return None

    @staticmethod
    def invite_member(
        org_id: str,
        request: InviteMemberRequest,
        invited_by: str,
    ) -> OrganizationInvitation:
        """Create an invitation for a new member."""
        org = _organizations.get(org_id)
        if not org:
            raise ValueError("Organization not found")

        # Check member limit
        if org.max_members > 0 and org.current_members >= org.max_members:
            raise ValueError("Organization has reached member limit")

        # Check if already a member
        for m in _members.values():
            if m.organization_id == org_id and m.email == request.email and m.is_active:
                raise ValueError("User is already a member")

        # Check for existing invitation
        for inv in _invitations.values():
            if (
                inv.organization_id == org_id
                and inv.email == request.email
                and not inv.accepted
                and inv.expires_at > datetime.utcnow()
            ):
                raise ValueError("Invitation already pending")

        # Create invitation
        invitation = OrganizationInvitation(
            organization_id=org_id,
            email=request.email,
            role=request.role,
            invited_by=invited_by,
            message=request.message,
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        _invitations[invitation.id] = invitation
        return invitation

    @staticmethod
    def accept_invitation(
        token: str,
        user_id: str,
        user_name: str | None = None,
    ) -> OrganizationMember:
        """Accept an invitation and become a member."""
        invitation = None
        for inv in _invitations.values():
            if inv.token == token and not inv.accepted:
                invitation = inv
                break

        if not invitation:
            raise ValueError("Invalid or expired invitation")

        if invitation.expires_at < datetime.utcnow():
            raise ValueError("Invitation has expired")

        org = _organizations.get(invitation.organization_id)
        if not org:
            raise ValueError("Organization not found")

        # Create member
        member = OrganizationMember(
            organization_id=invitation.organization_id,
            user_id=user_id,
            email=invitation.email,
            name=user_name,
            role=invitation.role,
            invited_by=invitation.invited_by,
            invited_at=invitation.created_at,
            joined_at=datetime.utcnow(),
        )
        _members[member.id] = member

        # Update invitation
        invitation.accepted = True
        invitation.accepted_at = datetime.utcnow()

        # Update user orgs index
        if user_id not in _user_orgs:
            _user_orgs[user_id] = []
        _user_orgs[user_id].append(invitation.organization_id)

        # Update member count
        org.current_members += 1

        return member

    @staticmethod
    def update_member_role(member_id: str, new_role: MemberRole) -> OrganizationMember | None:
        """Update a member's role."""
        member = _members.get(member_id)
        if not member:
            return None

        # Cannot demote the last owner
        if member.role == MemberRole.OWNER:
            owners = [
                m
                for m in _members.values()
                if m.organization_id == member.organization_id and m.role == MemberRole.OWNER and m.is_active
            ]
            if len(owners) <= 1 and new_role != MemberRole.OWNER:
                raise ValueError("Cannot demote the last owner")

        member.role = new_role
        return member

    @staticmethod
    def remove_member(member_id: str) -> bool:
        """Remove a member from an organization."""
        member = _members.get(member_id)
        if not member:
            return False

        # Cannot remove the last owner
        if member.role == MemberRole.OWNER:
            owners = [
                m
                for m in _members.values()
                if m.organization_id == member.organization_id and m.role == MemberRole.OWNER and m.is_active
            ]
            if len(owners) <= 1:
                raise ValueError("Cannot remove the last owner")

        member.is_active = False

        # Update user orgs index
        if member.user_id in _user_orgs and member.organization_id in _user_orgs[member.user_id]:
            _user_orgs[member.user_id].remove(member.organization_id)

        # Update member count
        org = _organizations.get(member.organization_id)
        if org:
            org.current_members = max(0, org.current_members - 1)

        return True

    # ─────────────────────────────────────────────────────────────
    # User Organizations
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_user_organizations(user_id: str) -> list[Organization]:
        """Get all organizations a user belongs to."""
        org_ids = _user_orgs.get(user_id, [])
        return [_organizations[oid] for oid in org_ids if oid in _organizations]

    @staticmethod
    def get_user_memberships(user_id: str) -> list[OrganizationMember]:
        """Get all memberships for a user."""
        return [m for m in _members.values() if m.user_id == user_id and m.is_active]

    # ─────────────────────────────────────────────────────────────
    # Tenant Context
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_tenant_context(org_id: str, user_id: str) -> TenantContext | None:
        """Get tenant context for a user within an organization."""
        org = _organizations.get(org_id)
        if not org or org.status != OrganizationStatus.ACTIVE:
            return None

        member = OrganizationService.get_member_by_user(org_id, user_id)
        if not member:
            return None

        return TenantContext(
            organization_id=org.id,
            organization_slug=org.slug,
            user_id=user_id,
            user_role=member.role,
            permissions=member.permissions,
        )

    # ─────────────────────────────────────────────────────────────
    # Statistics
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_organization_stats(org_id: str) -> OrganizationStats:
        """Get statistics for an organization."""
        members = OrganizationService.get_members(org_id)
        org = _organizations.get(org_id)

        return OrganizationStats(
            organization_id=org_id,
            total_members=len(members),
            active_members=len([m for m in members if m.is_active]),
            total_projects=org.current_projects if org else 0,
            tokens_used_this_month=org.tokens_used_this_month if org else 0,
        )

    # ─────────────────────────────────────────────────────────────
    # Usage Tracking
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def track_token_usage(org_id: str, tokens: int) -> bool:
        """Track token usage for an organization."""
        org = _organizations.get(org_id)
        if not org:
            return False

        # Check limit
        if org.max_tokens_per_month > 0:
            if org.tokens_used_this_month + tokens > org.max_tokens_per_month:
                return False  # Would exceed limit

        org.tokens_used_this_month += tokens
        return True

    @staticmethod
    def reset_monthly_usage() -> None:
        """Reset monthly usage for all organizations (called by cron)."""
        for org in _organizations.values():
            org.tokens_used_this_month = 0
