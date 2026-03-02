"""Organization, Member, and Invitation models."""

from db.models.base import (
    Base,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSONB,
    String,
    Text,
    datetime,
)


class OrganizationModel(Base):
    """Organization model for multi-tenant support."""

    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="active", index=True)
    plan = Column(String(20), default="free")

    # Contact info
    contact_email = Column(String(255), nullable=True)
    contact_name = Column(String(255), nullable=True)

    # Branding
    logo_url = Column(String(500), nullable=True)
    primary_color = Column(String(20), nullable=True)

    # Limits
    max_members = Column(Integer, default=5)
    max_projects = Column(Integer, default=3)
    max_sessions_per_day = Column(Integer, default=100)
    max_tokens_per_month = Column(Integer, default=100000)

    # Usage tracking
    current_members = Column(Integer, default=0)
    current_projects = Column(Integer, default=0)
    tokens_used_this_month = Column(Integer, default=0)

    # Metadata
    settings = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OrganizationMemberModel(Base):
    """Organization member model."""

    __tablename__ = "organization_members"

    id = Column(String(36), primary_key=True)
    organization_id = Column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email = Column(String(255), nullable=False)
    name = Column(String(255), nullable=True)
    role = Column(String(20), default="member")

    # Permissions override
    permissions = Column(JSONB, default=list)

    # Status
    is_active = Column(Boolean, default=True)
    invited_by = Column(String(36), nullable=True)
    invited_at = Column(DateTime, nullable=True)
    joined_at = Column(DateTime, nullable=True)
    last_active_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_org_member_org_user", "organization_id", "user_id", unique=True),)


class OrganizationInvitationModel(Base):
    """Organization invitation model."""

    __tablename__ = "organization_invitations"

    id = Column(String(36), primary_key=True)
    organization_id = Column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email = Column(String(255), nullable=False)
    role = Column(String(20), default="member")
    invited_by = Column(String(36), nullable=False)
    token = Column(String(36), nullable=False, unique=True)
    message = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    accepted = Column(Boolean, default=False)
    accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_invitation_token", "token"),
        Index("ix_invitation_email", "email"),
    )
