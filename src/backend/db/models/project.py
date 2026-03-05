"""Project and access control models."""

from db.models.base import (
    JSONB,
    Base,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    datetime,
    relationship,
    timezone,
)


class ProjectModel(Base):
    """Project model for DB-managed project registry."""

    __tablename__ = "projects"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    path = Column(String(1000), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    settings = Column(JSONB, default=dict)

    # Organization ownership
    organization_id = Column(String(36), nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    __table_args__: tuple = ()


class ProjectInvitationModel(Base):
    """Project invitation model for email-based membership."""

    __tablename__ = "project_invitations"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), nullable=False)
    invited_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    email = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    token = Column(String(128), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="pending")

    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("project_id", "email", name="uq_project_invitation_email"),
        Index("ix_project_invitation_token", "token"),
        Index("ix_project_invitation_project", "project_id"),
    )

    # Relationships
    inviter = relationship("UserModel", foreign_keys=[invited_by])


class ProjectAccessModel(Base):
    """Project-level access control model for RBAC."""

    __tablename__ = "project_access"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), nullable=False, index=True)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String(20), nullable=False)
    granted_by = Column(String(36), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_user"),
        Index("ix_project_access_project_user", "project_id", "user_id"),
    )

    # Relationships
    user = relationship("UserModel")
