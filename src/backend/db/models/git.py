"""Git collaboration models: merge requests, branch protection."""

from db.models.base import (
    Base,
    Boolean,
    Column,
    DateTime,
    Index,
    JSONB,
    String,
    Text,
    datetime,
)


class MergeRequestModel(Base):
    """Merge request model for persistent MR storage."""

    __tablename__ = "merge_requests"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(100), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    source_branch = Column(String(200), nullable=False)
    target_branch = Column(String(200), nullable=False)
    status = Column(String(20), default="open")
    conflict_status = Column(String(20), default="unknown")
    auto_merge = Column(Boolean, default=False)

    # Author info
    author_id = Column(String(100), nullable=True)
    author_name = Column(String(200), nullable=True)
    author_email = Column(String(300), nullable=True)

    # Review
    reviewers = Column(JSONB, default=list)
    approved_by = Column(JSONB, default=list)

    # Merge/Close info
    merged_by = Column(String(100), nullable=True)
    closed_by = Column(String(100), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    merged_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_merge_requests_project_status", "project_id", "status"),
        Index("ix_merge_requests_created", "created_at"),
    )


class BranchProtectionRuleModel(Base):
    """Branch protection rule model for dynamic branch protection."""

    __tablename__ = "branch_protection_rules"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(100), nullable=False, index=True)
    branch_pattern = Column(String(200), nullable=False)
    require_approvals = Column(Integer, default=0)
    require_no_conflicts = Column(Boolean, default=True)
    allowed_merge_roles = Column(JSONB, default=lambda: ["owner", "admin"])
    allow_force_push = Column(Boolean, default=False)
    allow_deletion = Column(Boolean, default=False)
    auto_deploy = Column(Boolean, default=False)
    deploy_workflow = Column(String(200), nullable=True)
    enabled = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_branch_protection_project", "project_id"),
        Index("ix_branch_protection_enabled", "project_id", "enabled"),
    )
