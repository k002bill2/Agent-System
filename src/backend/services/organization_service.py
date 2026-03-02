"""Organization service for multi-tenant management."""

import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from models.organization import (
    PLAN_LIMITS,
    InviteMemberRequest,
    MemberRole,
    MemberUsageRecord,
    MemberUsageResponse,
    MemberUsageSummary,
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
from utils.time import utcnow

# ─────────────────────────────────────────────────────────────
# Database Toggle
# ─────────────────────────────────────────────────────────────

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

# Conditional DB imports (only when USE_DATABASE=true)
try:
    from sqlalchemy import and_, select
    from sqlalchemy.ext.asyncio import AsyncSession

    from db.models import (
        OrganizationInvitationModel,
        OrganizationMemberModel,
        OrganizationModel,
    )

    _DB_AVAILABLE = True
except ImportError:
    # DB modules not available - use in-memory storage only
    _DB_AVAILABLE = False
    AsyncSession = Any  # type: ignore
    OrganizationModel = None  # type: ignore
    OrganizationMemberModel = None  # type: ignore
    OrganizationInvitationModel = None  # type: ignore


# ─────────────────────────────────────────────────────────────
# JSON File Persistence
# ─────────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).parent.parent / "data"
ORGS_FILE = DATA_DIR / "organizations.json"
MEMBERS_FILE = DATA_DIR / "organization_members.json"
INVITATIONS_FILE = DATA_DIR / "organization_invitations.json"
MEMBER_USAGE_FILE = DATA_DIR / "member_usage_records.json"


def _ensure_data_dir():
    """Ensure data directory exists."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_json(file_path: Path) -> dict:
    """Load JSON from file, return empty dict if not exists."""
    if file_path.exists():
        try:
            with open(file_path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return {}
    return {}


def _save_json(file_path: Path, data: dict):
    """Save dict to JSON file."""
    _ensure_data_dir()
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str, ensure_ascii=False)


def _load_organizations() -> dict[str, Organization]:
    """Load organizations from JSON file."""
    raw = _load_json(ORGS_FILE)
    return {k: Organization(**v) for k, v in raw.items()}


def _save_organizations(orgs: dict[str, Organization]):
    """Save organizations to JSON file."""
    raw = {k: v.model_dump() for k, v in orgs.items()}
    _save_json(ORGS_FILE, raw)


def _load_members() -> dict[str, OrganizationMember]:
    """Load members from JSON file."""
    raw = _load_json(MEMBERS_FILE)
    return {k: OrganizationMember(**v) for k, v in raw.items()}


def _save_members(members: dict[str, OrganizationMember]):
    """Save members to JSON file."""
    raw = {k: v.model_dump() for k, v in members.items()}
    _save_json(MEMBERS_FILE, raw)


def _load_invitations() -> dict[str, OrganizationInvitation]:
    """Load invitations from JSON file."""
    raw = _load_json(INVITATIONS_FILE)
    return {k: OrganizationInvitation(**v) for k, v in raw.items()}


def _save_invitations(invitations: dict[str, OrganizationInvitation]):
    """Save invitations to JSON file."""
    raw = {k: v.model_dump() for k, v in invitations.items()}
    _save_json(INVITATIONS_FILE, raw)


def _load_member_usage() -> dict[str, MemberUsageRecord]:
    """Load member usage records from JSON file."""
    raw = _load_json(MEMBER_USAGE_FILE)
    return {k: MemberUsageRecord(**v) for k, v in raw.items()}


def _save_member_usage(records: dict[str, MemberUsageRecord]):
    """Save member usage records to JSON file."""
    raw = {k: v.model_dump() for k, v in records.items()}
    _save_json(MEMBER_USAGE_FILE, raw)


# ─────────────────────────────────────────────────────────────
# In-memory cache (loaded from files on startup)
# ─────────────────────────────────────────────────────────────

_organizations: dict[str, Organization] = {}
_members: dict[str, OrganizationMember] = {}
_invitations: dict[str, OrganizationInvitation] = {}
_member_usage: dict[str, MemberUsageRecord] = {}

# Indexes
_slug_to_id: dict[str, str] = {}
_user_orgs: dict[str, list[str]] = {}  # user_id -> list of org_ids


def _init_storage():
    """Initialize storage from JSON files."""
    global _organizations, _members, _invitations, _member_usage, _slug_to_id, _user_orgs

    _organizations = _load_organizations()
    _members = _load_members()
    _invitations = _load_invitations()
    _member_usage = _load_member_usage()

    # Rebuild indexes (exclude soft-deleted orgs from slug index)
    _slug_to_id = {
        org.slug: org.id
        for org in _organizations.values()
        if org.status != OrganizationStatus.DELETED
    }
    _user_orgs = {}
    for member in _members.values():
        if member.is_active:
            if member.user_id not in _user_orgs:
                _user_orgs[member.user_id] = []
            if member.organization_id not in _user_orgs[member.user_id]:
                _user_orgs[member.user_id].append(member.organization_id)


# Initialize on module load
_init_storage()


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
            joined_at=utcnow(),
        )
        _members[owner_member.id] = owner_member

        # Update user orgs index
        if owner_user_id not in _user_orgs:
            _user_orgs[owner_user_id] = []
        _user_orgs[owner_user_id].append(org.id)

        # Update member count
        org.current_members = 1

        # Persist to file
        _save_organizations(_organizations)
        _save_members(_members)

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
            # Explicit status filter: return only matching status
            orgs = [o for o in orgs if o.status == status]
        else:
            # Default: exclude soft-deleted organizations
            orgs = [o for o in orgs if o.status != OrganizationStatus.DELETED]

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

        org.updated_at = utcnow()
        _save_organizations(_organizations)
        return org

    @staticmethod
    def delete_organization(org_id: str) -> bool:
        """Soft delete an organization."""
        org = _organizations.get(org_id)
        if not org:
            return False

        org.status = OrganizationStatus.DELETED
        org.updated_at = utcnow()

        # Remove slug from index so it can be reused
        _slug_to_id.pop(org.slug, None)

        _save_organizations(_organizations)
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
        org.updated_at = utcnow()
        _save_organizations(_organizations)
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

        # Check member limit via QuotaService
        from services.quota_service import QuotaService

        check = QuotaService.check_member_quota(org)
        if not check.allowed:
            raise ValueError(check.message or "Organization has reached member limit")

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
                and inv.expires_at > utcnow()
            ):
                raise ValueError("Invitation already pending")

        # Create invitation
        invitation = OrganizationInvitation(
            organization_id=org_id,
            email=request.email,
            role=request.role,
            invited_by=invited_by,
            message=request.message,
            expires_at=utcnow() + timedelta(days=7),
        )
        _invitations[invitation.id] = invitation
        _save_invitations(_invitations)
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

        if invitation.expires_at < utcnow():
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
            joined_at=utcnow(),
        )
        _members[member.id] = member

        # Update invitation
        invitation.accepted = True
        invitation.accepted_at = utcnow()

        # Update user orgs index
        if user_id not in _user_orgs:
            _user_orgs[user_id] = []
        _user_orgs[user_id].append(invitation.organization_id)

        # Update member count
        org.current_members += 1

        # Persist changes
        _save_members(_members)
        _save_invitations(_invitations)
        _save_organizations(_organizations)

        return member

    @staticmethod
    def get_pending_invitations(org_id: str) -> list[OrganizationInvitation]:
        """Get all pending invitations for an organization."""
        return [
            inv
            for inv in _invitations.values()
            if inv.organization_id == org_id and not inv.accepted and inv.expires_at > utcnow()
        ]

    @staticmethod
    def cancel_invitation(org_id: str, invitation_id: str) -> None:
        """Cancel a pending invitation."""
        invitation = _invitations.get(invitation_id)
        if not invitation:
            raise ValueError("Invitation not found")
        if invitation.organization_id != org_id:
            raise ValueError("Invitation does not belong to this organization")
        if invitation.accepted:
            raise ValueError("Invitation already accepted")

        del _invitations[invitation_id]
        _save_invitations(_invitations)

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
                if m.organization_id == member.organization_id
                and m.role == MemberRole.OWNER
                and m.is_active
            ]
            if len(owners) <= 1 and new_role != MemberRole.OWNER:
                raise ValueError("Cannot demote the last owner")

        member.role = new_role
        _save_members(_members)
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
                if m.organization_id == member.organization_id
                and m.role == MemberRole.OWNER
                and m.is_active
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
            _save_organizations(_organizations)

        _save_members(_members)
        return True

    # ─────────────────────────────────────────────────────────────
    # User Organizations
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_user_organizations(user_id: str) -> list[Organization]:
        """Get all organizations a user belongs to (excludes soft-deleted)."""
        org_ids = _user_orgs.get(user_id, [])
        return [
            _organizations[oid]
            for oid in org_ids
            if oid in _organizations and _organizations[oid].status != OrganizationStatus.DELETED
        ]

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
    def track_token_usage(
        org_id: str,
        tokens: int,
        user_id: str | None = None,
        session_id: str | None = None,
        model: str | None = None,
    ) -> bool:
        """Track token usage for an organization (and optionally per-member)."""
        org = _organizations.get(org_id)
        if not org:
            return False

        # Check limit via QuotaService
        from services.quota_service import QuotaService

        check = QuotaService.check_token_quota(org, tokens)
        if not check.allowed:
            return False  # Would exceed limit

        org.tokens_used_this_month += tokens
        _save_organizations(_organizations)

        # Record per-member usage if user_id provided
        if user_id:
            record = MemberUsageRecord(
                organization_id=org_id,
                user_id=user_id,
                tokens=tokens,
                session_id=session_id,
                model=model,
            )
            _member_usage[record.id] = record
            _save_member_usage(_member_usage)

        return True

    @staticmethod
    def reset_monthly_usage() -> None:
        """Reset monthly usage for all organizations (called by cron)."""
        for org in _organizations.values():
            org.tokens_used_this_month = 0
        _save_organizations(_organizations)

    # ─────────────────────────────────────────────────────────────
    # Member Usage Analytics
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_member_usage(
        org_id: str,
        period: str = "month",
    ) -> MemberUsageResponse:
        """Get per-member usage breakdown for an organization.

        Args:
            org_id: Organization ID
            period: 'day', 'week', or 'month'
        """
        now = utcnow()
        if period == "day":
            cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            cutoff = now - timedelta(days=7)
        else:  # month
            cutoff = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Get members of this org
        members = OrganizationService.get_members(org_id)

        # Aggregate by user_id
        user_tokens: dict[str, int] = {}
        user_tokens_today: dict[str, int] = {}
        user_tokens_month: dict[str, int] = {}
        user_sessions: dict[str, set] = {}
        user_sessions_today: dict[str, set] = {}
        user_last_active: dict[str, datetime] = {}

        for record in _member_usage.values():
            if record.organization_id != org_id:
                continue

            uid = record.user_id

            # Monthly tokens
            if record.timestamp >= month_start:
                user_tokens_month[uid] = user_tokens_month.get(uid, 0) + record.tokens
                if record.session_id:
                    if uid not in user_sessions:
                        user_sessions[uid] = set()
                    user_sessions[uid].add(record.session_id)

            # Today tokens
            if record.timestamp >= today_start:
                user_tokens_today[uid] = user_tokens_today.get(uid, 0) + record.tokens
                if record.session_id:
                    if uid not in user_sessions_today:
                        user_sessions_today[uid] = set()
                    user_sessions_today[uid].add(record.session_id)

            # Period tokens
            if record.timestamp >= cutoff:
                user_tokens[uid] = user_tokens.get(uid, 0) + record.tokens

            # Last active
            if uid not in user_last_active or record.timestamp > user_last_active[uid]:
                user_last_active[uid] = record.timestamp

        total_tokens = sum(user_tokens.values())

        # Build member summaries
        summaries: list[MemberUsageSummary] = []
        for member in members:
            uid = member.user_id
            month_tokens = user_tokens_month.get(uid, 0)
            pct = (month_tokens / total_tokens * 100) if total_tokens > 0 else 0.0

            summaries.append(
                MemberUsageSummary(
                    user_id=uid,
                    email=member.email,
                    name=member.name,
                    role=member.role,
                    tokens_used_today=user_tokens_today.get(uid, 0),
                    tokens_used_this_month=month_tokens,
                    sessions_today=len(user_sessions_today.get(uid, set())),
                    sessions_this_month=len(user_sessions.get(uid, set())),
                    last_active_at=user_last_active.get(uid),
                    percentage_of_org=round(pct, 1),
                )
            )

        # Sort by tokens used this month (desc)
        summaries.sort(key=lambda s: s.tokens_used_this_month, reverse=True)

        return MemberUsageResponse(
            organization_id=org_id,
            period=period,
            total_tokens=total_tokens,
            members=summaries,
        )

    # ─────────────────────────────────────────────────────────────
    # Async Database Methods (USE_DATABASE=true)
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def _org_model_to_pydantic(model: OrganizationModel) -> Organization:
        """Convert SQLAlchemy model to Pydantic model."""
        return Organization(
            id=model.id,
            name=model.name,
            slug=model.slug,
            description=model.description,
            logo_url=model.logo_url,
            primary_color=model.primary_color,
            contact_email=model.contact_email,
            contact_name=model.contact_name,
            status=OrganizationStatus(model.status),
            plan=OrganizationPlan(model.plan),
            max_members=model.max_members,
            max_projects=model.max_projects,
            max_sessions_per_day=model.max_sessions_per_day,
            max_tokens_per_month=model.max_tokens_per_month,
            current_members=model.current_members,
            current_projects=model.current_projects,
            tokens_used_this_month=model.tokens_used_this_month,
            settings=model.settings or {},
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    @staticmethod
    def _member_model_to_pydantic(model: OrganizationMemberModel) -> OrganizationMember:
        """Convert SQLAlchemy model to Pydantic model."""
        return OrganizationMember(
            id=model.id,
            organization_id=model.organization_id,
            user_id=model.user_id,
            email=model.email,
            name=model.name,
            avatar_url=model.avatar_url,
            role=MemberRole(model.role),
            permissions=model.permissions or [],
            is_active=model.is_active,
            invited_by=model.invited_by,
            invited_at=model.invited_at,
            joined_at=model.joined_at,
        )

    @staticmethod
    def _invitation_model_to_pydantic(model: OrganizationInvitationModel) -> OrganizationInvitation:
        """Convert SQLAlchemy model to Pydantic model."""
        return OrganizationInvitation(
            id=model.id,
            organization_id=model.organization_id,
            email=model.email,
            role=MemberRole(model.role),
            token=model.token,
            invited_by=model.invited_by,
            message=model.message,
            expires_at=model.expires_at,
            accepted=model.accepted,
            accepted_at=model.accepted_at,
            created_at=model.created_at,
        )

    @staticmethod
    async def create_organization_async(
        db: AsyncSession,
        data: OrganizationCreate,
        owner_user_id: str,
        owner_email: str,
        owner_name: str | None = None,
    ) -> Organization:
        """Create a new organization with an owner (async DB version)."""
        import uuid

        # Validate slug format
        if not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$", data.slug) or len(data.slug) < 3:
            raise ValueError("Slug must be lowercase alphanumeric with hyphens, min 3 chars")

        # Check slug uniqueness
        result = await db.execute(
            select(OrganizationModel).where(OrganizationModel.slug == data.slug)
        )
        if result.scalar_one_or_none():
            raise ValueError(f"Slug '{data.slug}' is already taken")

        # Get plan limits
        limits = PLAN_LIMITS.get(data.plan, PLAN_LIMITS[OrganizationPlan.FREE])

        # Create organization
        org_id = str(uuid.uuid4())
        now = utcnow()
        org_model = OrganizationModel(
            id=org_id,
            name=data.name,
            slug=data.slug,
            description=data.description,
            contact_email=data.contact_email,
            contact_name=data.contact_name,
            plan=data.plan.value,
            max_members=limits["max_members"],
            max_projects=limits["max_projects"],
            max_sessions_per_day=limits["max_sessions_per_day"],
            max_tokens_per_month=limits["max_tokens_per_month"],
            current_members=1,
            created_at=now,
            updated_at=now,
        )
        db.add(org_model)

        # Add owner as member
        member_model = OrganizationMemberModel(
            id=str(uuid.uuid4()),
            organization_id=org_id,
            user_id=owner_user_id,
            email=owner_email,
            name=owner_name,
            role=MemberRole.OWNER.value,
            joined_at=now,
        )
        db.add(member_model)

        await db.commit()
        await db.refresh(org_model)

        return OrganizationService._org_model_to_pydantic(org_model)

    @staticmethod
    async def get_organization_async(db: AsyncSession, org_id: str) -> Organization | None:
        """Get an organization by ID (async DB version)."""
        result = await db.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        model = result.scalar_one_or_none()
        if not model:
            return None
        return OrganizationService._org_model_to_pydantic(model)

    @staticmethod
    async def get_organization_by_slug_async(db: AsyncSession, slug: str) -> Organization | None:
        """Get an organization by slug (async DB version)."""
        result = await db.execute(select(OrganizationModel).where(OrganizationModel.slug == slug))
        model = result.scalar_one_or_none()
        if not model:
            return None
        return OrganizationService._org_model_to_pydantic(model)

    @staticmethod
    async def list_organizations_async(
        db: AsyncSession,
        status: OrganizationStatus | None = None,
        plan: OrganizationPlan | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Organization]:
        """List organizations with optional filtering (async DB version)."""
        query = select(OrganizationModel)

        if status:
            query = query.where(OrganizationModel.status == status.value)
        if plan:
            query = query.where(OrganizationModel.plan == plan.value)

        query = query.order_by(OrganizationModel.created_at.desc())
        query = query.offset(offset).limit(limit)

        result = await db.execute(query)
        models = result.scalars().all()
        return [OrganizationService._org_model_to_pydantic(m) for m in models]

    @staticmethod
    async def update_organization_async(
        db: AsyncSession,
        org_id: str,
        data: OrganizationUpdate,
    ) -> Organization | None:
        """Update an organization (async DB version)."""
        result = await db.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        model = result.scalar_one_or_none()
        if not model:
            return None

        if data.name is not None:
            model.name = data.name
        if data.description is not None:
            model.description = data.description
        if data.contact_email is not None:
            model.contact_email = data.contact_email
        if data.contact_name is not None:
            model.contact_name = data.contact_name
        if data.logo_url is not None:
            model.logo_url = data.logo_url
        if data.primary_color is not None:
            model.primary_color = data.primary_color
        if data.settings is not None:
            model.settings = {**(model.settings or {}), **data.settings}

        model.updated_at = utcnow()
        await db.commit()
        await db.refresh(model)

        return OrganizationService._org_model_to_pydantic(model)

    @staticmethod
    async def delete_organization_async(db: AsyncSession, org_id: str) -> bool:
        """Soft delete an organization (async DB version)."""
        result = await db.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        model = result.scalar_one_or_none()
        if not model:
            return False

        model.status = OrganizationStatus.DELETED.value
        model.updated_at = utcnow()
        await db.commit()
        return True

    @staticmethod
    async def get_members_async(db: AsyncSession, org_id: str) -> list[OrganizationMember]:
        """Get all members of an organization (async DB version)."""
        result = await db.execute(
            select(OrganizationMemberModel).where(
                and_(
                    OrganizationMemberModel.organization_id == org_id,
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        models = result.scalars().all()
        return [OrganizationService._member_model_to_pydantic(m) for m in models]

    @staticmethod
    async def get_member_by_user_async(
        db: AsyncSession,
        org_id: str,
        user_id: str,
    ) -> OrganizationMember | None:
        """Get a member by user ID within an organization (async DB version)."""
        result = await db.execute(
            select(OrganizationMemberModel).where(
                and_(
                    OrganizationMemberModel.organization_id == org_id,
                    OrganizationMemberModel.user_id == user_id,
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        model = result.scalar_one_or_none()
        if not model:
            return None
        return OrganizationService._member_model_to_pydantic(model)

    @staticmethod
    async def invite_member_async(
        db: AsyncSession,
        org_id: str,
        request: InviteMemberRequest,
        invited_by: str,
    ) -> OrganizationInvitation:
        """Create an invitation for a new member (async DB version)."""
        import secrets
        import uuid

        # Check org exists
        org_result = await db.execute(
            select(OrganizationModel).where(OrganizationModel.id == org_id)
        )
        org = org_result.scalar_one_or_none()
        if not org:
            raise ValueError("Organization not found")

        # Check member limit via QuotaService
        from services.quota_service import QuotaService

        org_pydantic = OrganizationService._org_model_to_pydantic(org)
        check = QuotaService.check_member_quota(org_pydantic)
        if not check.allowed:
            raise ValueError(check.message or "Organization has reached member limit")

        # Check if already a member
        member_result = await db.execute(
            select(OrganizationMemberModel).where(
                and_(
                    OrganizationMemberModel.organization_id == org_id,
                    OrganizationMemberModel.email == request.email,
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        if member_result.scalar_one_or_none():
            raise ValueError("User is already a member")

        # Check for existing invitation
        inv_result = await db.execute(
            select(OrganizationInvitationModel).where(
                and_(
                    OrganizationInvitationModel.organization_id == org_id,
                    OrganizationInvitationModel.email == request.email,
                    OrganizationInvitationModel.accepted == False,  # noqa: E712
                    OrganizationInvitationModel.expires_at > utcnow(),
                )
            )
        )
        if inv_result.scalar_one_or_none():
            raise ValueError("Invitation already pending")

        # Create invitation
        now = utcnow()
        invitation = OrganizationInvitationModel(
            id=str(uuid.uuid4()),
            organization_id=org_id,
            email=request.email,
            role=request.role.value,
            token=secrets.token_urlsafe(32),
            invited_by=invited_by,
            message=request.message,
            expires_at=now + timedelta(days=7),
            created_at=now,
        )
        db.add(invitation)
        await db.commit()
        await db.refresh(invitation)

        return OrganizationService._invitation_model_to_pydantic(invitation)

    @staticmethod
    async def accept_invitation_async(
        db: AsyncSession,
        token: str,
        user_id: str,
        user_name: str | None = None,
    ) -> OrganizationMember:
        """Accept an invitation and become a member (async DB version)."""
        import uuid

        # Find invitation
        result = await db.execute(
            select(OrganizationInvitationModel).where(
                and_(
                    OrganizationInvitationModel.token == token,
                    OrganizationInvitationModel.accepted == False,  # noqa: E712
                )
            )
        )
        invitation = result.scalar_one_or_none()
        if not invitation:
            raise ValueError("Invalid or expired invitation")

        if invitation.expires_at < utcnow():
            raise ValueError("Invitation has expired")

        # Get org
        org_result = await db.execute(
            select(OrganizationModel).where(OrganizationModel.id == invitation.organization_id)
        )
        org = org_result.scalar_one_or_none()
        if not org:
            raise ValueError("Organization not found")

        # Create member
        now = utcnow()
        member = OrganizationMemberModel(
            id=str(uuid.uuid4()),
            organization_id=invitation.organization_id,
            user_id=user_id,
            email=invitation.email,
            name=user_name,
            role=invitation.role,
            invited_by=invitation.invited_by,
            invited_at=invitation.created_at,
            joined_at=now,
        )
        db.add(member)

        # Update invitation
        invitation.accepted = True
        invitation.accepted_at = now

        # Update org member count
        org.current_members += 1

        await db.commit()
        await db.refresh(member)

        return OrganizationService._member_model_to_pydantic(member)

    @staticmethod
    async def get_user_organizations_async(
        db: AsyncSession,
        user_id: str,
    ) -> list[Organization]:
        """Get all organizations a user belongs to (async DB version)."""
        # Get member records for user
        member_result = await db.execute(
            select(OrganizationMemberModel.organization_id).where(
                and_(
                    OrganizationMemberModel.user_id == user_id,
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        org_ids = [row[0] for row in member_result.fetchall()]

        if not org_ids:
            return []

        # Get organizations
        org_result = await db.execute(
            select(OrganizationModel).where(OrganizationModel.id.in_(org_ids))
        )
        models = org_result.scalars().all()
        return [OrganizationService._org_model_to_pydantic(m) for m in models]

    @staticmethod
    async def get_user_memberships_async(
        db: AsyncSession,
        user_id: str,
    ) -> list[OrganizationMember]:
        """Get all memberships for a user (async DB version)."""
        result = await db.execute(
            select(OrganizationMemberModel).where(
                and_(
                    OrganizationMemberModel.user_id == user_id,
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        models = result.scalars().all()
        return [OrganizationService._member_model_to_pydantic(m) for m in models]

    @staticmethod
    async def get_tenant_context_async(
        db: AsyncSession,
        org_id: str,
        user_id: str,
    ) -> TenantContext | None:
        """Get tenant context for a user within an organization (async DB version)."""
        org = await OrganizationService.get_organization_async(db, org_id)
        if not org or org.status != OrganizationStatus.ACTIVE:
            return None

        member = await OrganizationService.get_member_by_user_async(db, org_id, user_id)
        if not member:
            return None

        return TenantContext(
            organization_id=org.id,
            organization_slug=org.slug,
            user_id=user_id,
            user_role=member.role,
            permissions=member.permissions,
        )

    @staticmethod
    async def track_token_usage_async(
        db: AsyncSession,
        org_id: str,
        tokens: int,
        user_id: str | None = None,
        session_id: str | None = None,
        model: str | None = None,
    ) -> bool:
        """Track token usage for an organization (async DB version)."""
        result = await db.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        org = result.scalar_one_or_none()
        if not org:
            return False

        # Check limit via QuotaService
        from services.quota_service import QuotaService

        org_pydantic = OrganizationService._org_model_to_pydantic(org)
        check = QuotaService.check_token_quota(org_pydantic, tokens)
        if not check.allowed:
            return False  # Would exceed limit

        org.tokens_used_this_month += tokens

        # Record per-member usage if user_id provided
        if user_id:
            record = MemberUsageRecord(
                organization_id=org_id,
                user_id=user_id,
                tokens=tokens,
                session_id=session_id,
                model=model,
            )
            _member_usage[record.id] = record
            _save_member_usage(_member_usage)

        await db.commit()
        return True

    @staticmethod
    async def reset_monthly_usage_async(db: AsyncSession) -> int:
        """Reset monthly usage for all organizations (async DB version)."""
        result = await db.execute(select(OrganizationModel))
        orgs = result.scalars().all()
        count = 0
        for org in orgs:
            org.tokens_used_this_month = 0
            count += 1
        await db.commit()
        return count
