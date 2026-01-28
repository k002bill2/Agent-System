"""Organization models for multi-tenant support."""

from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field, EmailStr
import uuid


class OrganizationPlan(str, Enum):
    """Organization subscription plan."""

    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class OrganizationStatus(str, Enum):
    """Organization status."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING = "pending"
    DELETED = "deleted"


class MemberRole(str, Enum):
    """Member role within an organization."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class Organization(BaseModel):
    """Organization entity for multi-tenant isolation."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str  # URL-friendly unique identifier
    description: str | None = None
    status: OrganizationStatus = OrganizationStatus.ACTIVE
    plan: OrganizationPlan = OrganizationPlan.FREE
    # Contact info
    contact_email: EmailStr | None = None
    contact_name: str | None = None
    # Branding
    logo_url: str | None = None
    primary_color: str | None = None
    # Limits based on plan
    max_members: int = 5
    max_projects: int = 3
    max_sessions_per_day: int = 100
    max_tokens_per_month: int = 100000
    # Usage tracking
    current_members: int = 0
    current_projects: int = 0
    tokens_used_this_month: int = 0
    # Metadata
    settings: dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class OrganizationCreate(BaseModel):
    """Request to create a new organization."""

    name: str
    slug: str
    description: str | None = None
    contact_email: EmailStr | None = None
    contact_name: str | None = None
    plan: OrganizationPlan = OrganizationPlan.FREE


class OrganizationUpdate(BaseModel):
    """Request to update an organization."""

    name: str | None = None
    description: str | None = None
    contact_email: EmailStr | None = None
    contact_name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    settings: dict[str, Any] | None = None


class OrganizationMember(BaseModel):
    """Member of an organization."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    organization_id: str
    user_id: str
    email: EmailStr
    name: str | None = None
    role: MemberRole = MemberRole.MEMBER
    # Permissions override
    permissions: list[str] = []
    # Status
    is_active: bool = True
    invited_by: str | None = None
    invited_at: datetime | None = None
    joined_at: datetime | None = None
    last_active_at: datetime | None = None
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)


class InviteMemberRequest(BaseModel):
    """Request to invite a member to an organization."""

    email: EmailStr
    role: MemberRole = MemberRole.MEMBER
    name: str | None = None
    message: str | None = None  # Custom invitation message


class OrganizationInvitation(BaseModel):
    """Pending invitation to join an organization."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    organization_id: str
    email: EmailStr
    role: MemberRole = MemberRole.MEMBER
    invited_by: str
    token: str = Field(default_factory=lambda: str(uuid.uuid4()))
    message: str | None = None
    expires_at: datetime
    accepted: bool = False
    accepted_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OrganizationStats(BaseModel):
    """Statistics for an organization."""

    organization_id: str
    total_members: int = 0
    active_members: int = 0
    total_projects: int = 0
    active_projects: int = 0
    total_sessions: int = 0
    sessions_today: int = 0
    sessions_this_week: int = 0
    tokens_used_today: int = 0
    tokens_used_this_month: int = 0
    total_cost_this_month: float = 0.0
    api_calls_today: int = 0


class TenantContext(BaseModel):
    """Context for tenant-scoped operations."""

    organization_id: str
    organization_slug: str
    user_id: str
    user_role: MemberRole
    permissions: list[str] = []


# Plan limits configuration
PLAN_LIMITS = {
    OrganizationPlan.FREE: {
        "max_members": 5,
        "max_projects": 3,
        "max_sessions_per_day": 100,
        "max_tokens_per_month": 100000,
    },
    OrganizationPlan.STARTER: {
        "max_members": 10,
        "max_projects": 10,
        "max_sessions_per_day": 500,
        "max_tokens_per_month": 500000,
    },
    OrganizationPlan.PROFESSIONAL: {
        "max_members": 50,
        "max_projects": 50,
        "max_sessions_per_day": 2000,
        "max_tokens_per_month": 2000000,
    },
    OrganizationPlan.ENTERPRISE: {
        "max_members": -1,  # Unlimited
        "max_projects": -1,
        "max_sessions_per_day": -1,
        "max_tokens_per_month": -1,
    },
}
