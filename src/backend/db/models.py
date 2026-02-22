"""SQLAlchemy models for database persistence."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from db.database import Base
from db.types import EncryptedString


class SessionModel(Base):
    """Session model for storing orchestration sessions."""

    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(255), nullable=True, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    organization_id = Column(String(36), nullable=True, index=True)

    # Session state stored as JSON
    state_json = Column(JSONB, nullable=False, default=dict)

    # Metadata
    status = Column(String(50), default="active", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Cost tracking
    total_tokens = Column(Integer, default=0)
    total_cost_usd = Column(Float, default=0.0)

    # Relationships
    tasks = relationship("TaskModel", back_populates="session", cascade="all, delete-orphan")
    messages = relationship("MessageModel", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_sessions_user_project", "user_id", "project_id"),
        Index("ix_sessions_status_created", "status", "created_at"),
        Index("ix_sessions_org_status", "organization_id", "status"),
    )


class TaskModel(Base):
    """Task model for storing task history."""

    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id = Column(
        String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Task content
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="pending", index=True)

    # Execution details
    assigned_agent = Column(String(100), nullable=True)
    agent_id = Column(String(100), nullable=True, index=True)  # For analytics
    result_json = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
    error_type = Column(String(50), nullable=True)  # timeout, api_error, validation_error, etc.
    error_message = Column(Text, nullable=True)

    # Performance metrics
    duration_ms = Column(Integer, nullable=True)
    tokens_used = Column(Integer, default=0)
    cost = Column(Float, default=0.0)

    # Retry tracking
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Dependencies stored as JSON array of task IDs
    dependencies = Column(JSONB, default=list)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    session = relationship("SessionModel", back_populates="tasks")
    parent = relationship("TaskModel", remote_side=[id], backref="children")

    __table_args__ = (
        Index("ix_tasks_session_status", "session_id", "status"),
        Index("ix_tasks_session_parent", "session_id", "parent_id"),
        Index("ix_tasks_agent", "agent_id"),
    )


class MessageModel(Base):
    """Message model for storing conversation history."""

    __tablename__ = "messages"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Message content
    role = Column(String(50), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    message_type = Column(String(50), nullable=True)  # thinking, action, error, etc.

    # Optional metadata
    agent_id = Column(String(100), nullable=True)
    tool_name = Column(String(100), nullable=True)
    tool_args = Column(JSONB, nullable=True)
    tool_result = Column(JSONB, nullable=True)

    # Token usage for this message
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)

    # Timestamps
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    session = relationship("SessionModel", back_populates="messages")

    __table_args__ = (Index("ix_messages_session_timestamp", "session_id", "timestamp"),)


class ApprovalModel(Base):
    """Approval model for storing HITL approval history."""

    __tablename__ = "approvals"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id = Column(String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)

    # Approval details
    tool_name = Column(String(100), nullable=False)
    tool_args = Column(JSONB, nullable=False)
    risk_level = Column(String(20), nullable=False)  # low, medium, high, critical
    risk_description = Column(Text, nullable=True)

    # Status
    status = Column(String(20), default="pending", index=True)  # pending, approved, denied
    approved_by = Column(String(255), nullable=True)
    denial_reason = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (Index("ix_approvals_session_status", "session_id", "status"),)


class FeedbackModel(Base):
    """Feedback model for storing RLHF feedback data."""

    __tablename__ = "feedbacks"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)
    task_id = Column(String(36), nullable=True, index=True)
    message_id = Column(String(36), nullable=True)

    # Feedback details
    feedback_type = Column(
        String(50), nullable=False, index=True
    )  # implicit, explicit_positive, explicit_negative
    reason = Column(
        String(50), nullable=True
    )  # incorrect, incomplete, off_topic, style, performance, other
    reason_detail = Column(Text, nullable=True)

    # Content
    original_output = Column(Text, nullable=False)
    corrected_output = Column(Text, nullable=True)

    # Context (stored as JSON for flexibility)
    context_json = Column(JSONB, nullable=True, default=dict)

    # Metadata
    agent_id = Column(String(100), nullable=True, index=True)
    project_name = Column(String(255), nullable=True)
    effort_level = Column(String(20), nullable=True)
    status = Column(String(20), default="pending", index=True)  # pending, processed, skipped, error

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    processed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_feedbacks_session_type", "session_id", "feedback_type"),
        Index("ix_feedbacks_status_created", "status", "created_at"),
        Index("ix_feedbacks_agent_type", "agent_id", "feedback_type"),
    )


class DatasetEntryModel(Base):
    """Dataset entry model for Fine-tuning data."""

    __tablename__ = "dataset_entries"

    id = Column(String(36), primary_key=True)
    feedback_id = Column(
        String(36), ForeignKey("feedbacks.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Training data format (OpenAI-compatible)
    system_prompt = Column(Text, nullable=False)
    user_input = Column(Text, nullable=False)
    assistant_output = Column(Text, nullable=False)

    # Classification
    is_positive = Column(Boolean, nullable=False, default=True)

    # Metadata (agent info, timestamps, etc.)
    metadata_json = Column(JSONB, nullable=True, default=dict)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_dataset_positive", "is_positive"),
        Index("ix_dataset_feedback", "feedback_id"),
    )


class UserModel(Base):
    """User model for OAuth and email/password authentication."""

    __tablename__ = "users"

    id = Column(String(36), primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    avatar_url = Column(String(500), nullable=True)

    # Password (for email/password auth; null for OAuth-only users)
    password_hash = Column(String(255), nullable=True)

    # OAuth provider info (nullable for email/password users)
    oauth_provider = Column(String(50), nullable=True)  # google | github | email
    oauth_provider_id = Column(String(255), nullable=True)

    # Status flags
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)

    # Role: user, manager, admin
    role = Column(String(20), default="user")

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_login_at = Column(DateTime, nullable=True)

    __table_args__ = (Index("ix_users_provider_id", "oauth_provider", "oauth_provider_id"),)


class AuditLogModel(Base):
    """Audit log model for tracking all system actions."""

    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Action details
    action = Column(
        String(100), nullable=False, index=True
    )  # e.g., TASK_CREATED, TOOL_EXECUTED, APPROVAL_GRANTED
    resource_type = Column(
        String(50), nullable=False, index=True
    )  # session, task, approval, agent, etc.
    resource_id = Column(String(36), nullable=True, index=True)

    # Change tracking
    old_value = Column(JSONB, nullable=True)  # Previous state
    new_value = Column(JSONB, nullable=True)  # New state
    changes = Column(JSONB, nullable=True)  # Diff of changes

    # Project scope
    project_id = Column(String(36), nullable=True, index=True)

    # Context
    agent_id = Column(String(100), nullable=True, index=True)
    ip_address = Column(String(45), nullable=True)  # IPv6 compatible
    user_agent = Column(String(500), nullable=True)

    # Additional metadata
    metadata_json = Column(JSONB, nullable=True, default=dict)

    # Result
    status = Column(String(20), default="success", index=True)  # success, failed, denied
    error_message = Column(Text, nullable=True)

    # Compliance fields (Enterprise)
    data_classification = Column(
        String(20), default="internal"
    )  # public, internal, confidential, restricted
    change_reason = Column(Text, nullable=True)
    compliance_flags = Column(JSONB, default=list)  # PCI, HIPAA, GDPR, etc.

    # Hash chain for integrity (Enterprise)
    previous_hash = Column(String(64), nullable=True)
    hash = Column(String(64), nullable=True)
    signature = Column(Text, nullable=True)

    # Retention (Enterprise)
    retention_days = Column(Integer, default=2555)  # 7 years
    retention_policy = Column(String(20), default="standard")
    expires_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_audit_session_action", "session_id", "action"),
        Index("ix_audit_user_action", "user_id", "action"),
        Index("ix_audit_resource", "resource_type", "resource_id"),
        Index("ix_audit_created_action", "created_at", "action"),
        Index("ix_audit_project_action", "project_id", "action"),
        Index("ix_audit_classification", "data_classification"),
        Index("ix_audit_expires", "expires_at"),
    )


class CostCenterModel(Base):
    """Cost center model for enterprise billing."""

    __tablename__ = "cost_centers"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False, unique=True)
    description = Column(Text, nullable=True)

    # Budget settings
    budget_usd = Column(Float, nullable=True)
    budget_period = Column(String(20), default="monthly")  # monthly, quarterly, yearly
    alert_threshold_percent = Column(Float, default=80.0)

    # Metadata
    tags = Column(JSONB, default=dict)
    owner_id = Column(String(36), nullable=True)
    parent_id = Column(
        String(36), ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True
    )

    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_cost_centers_org", "organization_id"),
        Index("ix_cost_centers_active", "is_active"),
    )


class CostAllocationModel(Base):
    """Cost allocation model for session cost tracking."""

    __tablename__ = "cost_allocations"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id = Column(String(36), nullable=True, index=True)
    cost_center_id = Column(
        String(36), ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Cost breakdown
    total_cost_usd = Column(Float, default=0.0)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    model_costs = Column(JSONB, default=dict)

    # Allocation metadata
    allocation_tags = Column(JSONB, default=dict)
    allocation_percent = Column(Float, default=100.0)

    # Timestamps
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_cost_allocations_center", "cost_center_id", "created_at"),
        Index("ix_cost_allocations_project", "project_id", "created_at"),
        Index("ix_cost_allocations_user", "user_id", "created_at"),
    )


class TokenBlacklistModel(Base):
    """Token blacklist model for JWT revocation."""

    __tablename__ = "token_blacklist"

    id = Column(String(36), primary_key=True)
    jti = Column(String(36), nullable=False, unique=True, index=True)  # JWT ID
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    token_type = Column(String(20), nullable=False)  # access, refresh
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, default=datetime.utcnow)
    reason = Column(String(100), nullable=True)  # logout, password_change, admin_revoke

    __table_args__ = (Index("ix_token_blacklist_expires", "expires_at"),)


class SAMLConfigModel(Base):
    """SAML IdP configuration model."""

    __tablename__ = "saml_configs"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=False)

    # IdP settings
    idp_entity_id = Column(String(500), nullable=False)
    idp_sso_url = Column(String(500), nullable=False)
    idp_slo_url = Column(String(500), nullable=True)
    idp_certificate = Column(EncryptedString(length=None), nullable=False)

    # SP settings (overrides)
    sp_entity_id = Column(String(500), nullable=True)
    sp_acs_url = Column(String(500), nullable=True)

    # Attribute mapping
    attribute_mapping = Column(JSONB, default=dict)  # {email: "mail", name: "displayName"}

    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (Index("ix_saml_configs_active", "is_active"),)


# ─────────────────────────────────────────────────────────────
# Organization Models
# ─────────────────────────────────────────────────────────────


class OrganizationModel(Base):
    """Organization model for multi-tenant support."""

    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="active", index=True)  # active, suspended, pending, deleted
    plan = Column(String(20), default="free")  # free, starter, professional, enterprise

    # Contact info
    contact_email = Column(String(255), nullable=True)
    contact_name = Column(String(255), nullable=True)

    # Branding
    logo_url = Column(String(500), nullable=True)
    primary_color = Column(String(20), nullable=True)

    # Limits based on plan
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
    role = Column(String(20), default="member")  # owner, admin, member, viewer

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


# ─────────────────────────────────────────────────────────────
# Notification Models
# ─────────────────────────────────────────────────────────────


class NotificationRuleModel(Base):
    """Notification rule model."""

    __tablename__ = "notification_rules"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    enabled = Column(Boolean, default=True)

    # Trigger
    event_type = Column(String(50), nullable=False, index=True)
    conditions = Column(JSONB, default=list)

    # Channels
    channels = Column(JSONB, default=list)  # List of channel names

    # Project filter
    project_ids = Column(JSONB, default=list)  # Empty list = all projects

    # Customization
    priority = Column(String(20), default="medium")
    message_template = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class NotificationHistoryModel(Base):
    """Notification history model."""

    __tablename__ = "notification_history"

    id = Column(String(36), primary_key=True)
    rule_id = Column(
        String(36), ForeignKey("notification_rules.id", ondelete="SET NULL"), nullable=True
    )
    event_type = Column(String(50), nullable=False, index=True)
    priority = Column(String(20), default="medium")

    # Content
    title = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    data = Column(JSONB, default=dict)

    # Delivery
    channels = Column(JSONB, default=list)
    sent_at = Column(DateTime, nullable=True)
    delivery_status = Column(JSONB, default=dict)  # channel -> status

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_notification_history_sent", "sent_at"),)


class ChannelConfigModel(Base):
    """Channel configuration model."""

    __tablename__ = "channel_configs"

    id = Column(String(36), primary_key=True)
    channel = Column(String(20), nullable=False, unique=True)  # slack, discord, email, webhook
    enabled = Column(Boolean, default=True)

    # Channel-specific settings (encrypted at rest via EncryptedString)
    webhook_url = Column(EncryptedString(500), nullable=True)
    api_key = Column(EncryptedString(500), nullable=True)
    bot_token = Column(EncryptedString(500), nullable=True)
    email_address = Column(String(255), nullable=True)

    # SMTP settings for email
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, default=587)
    smtp_username = Column(String(255), nullable=True)
    smtp_password = Column(EncryptedString(500), nullable=True)  # App password (encrypted at rest)
    smtp_use_tls = Column(Boolean, default=True)

    # Rate limiting
    rate_limit_per_hour = Column(Integer, default=60)
    last_sent = Column(DateTime, nullable=True)
    sent_this_hour = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────────────────────
# Session Activity Models
# ─────────────────────────────────────────────────────────────


class TaskAnalysisModel(Base):
    """Task analysis model for storing task analysis history."""

    __tablename__ = "task_analyses"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), nullable=True, index=True)
    user_id = Column(String(36), nullable=True, index=True)

    # Task input
    task_input = Column(Text, nullable=False)
    context_json = Column(JSONB, nullable=True, default=dict)

    # Analysis result
    success = Column(Boolean, nullable=False)
    analysis_json = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)

    # Summary fields for quick filtering
    execution_time_ms = Column(Integer, default=0)
    complexity_score = Column(Integer, nullable=True)
    effort_level = Column(String(20), nullable=True)  # quick, medium, thorough
    subtask_count = Column(Integer, nullable=True)
    strategy = Column(String(20), nullable=True)  # sequential, parallel, mixed

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_task_analyses_project_created", "project_id", "created_at"),
        Index("ix_task_analyses_user_created", "user_id", "created_at"),
    )


class SessionActivityModel(Base):
    """Session activity model for tracking user/agent activities."""

    __tablename__ = "session_activities"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Activity details
    activity_type = Column(
        String(50), nullable=False, index=True
    )  # message, tool_use, task_update, etc.
    actor_type = Column(String(20), default="user")  # user, agent, system
    actor_id = Column(String(100), nullable=True)  # user_id or agent_id

    # Activity data
    data = Column(JSONB, default=dict)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_session_activity_session", "session_id", "created_at"),
        Index("ix_session_activity_type", "activity_type", "created_at"),
    )


# ─────────────────────────────────────────────────────────────
# Menu Visibility Model
# ─────────────────────────────────────────────────────────────


class MenuVisibilityModel(Base):
    """Menu visibility settings per role."""

    __tablename__ = "menu_visibility"

    id = Column(Integer, primary_key=True, autoincrement=True)
    menu_key = Column(String(50), nullable=False)  # ViewType 값 (dashboard, tasks, ...)
    role = Column(String(20), nullable=False)  # user, manager, admin
    visible = Column(Boolean, default=True)
    sort_order = Column(Integer, nullable=True)  # 메뉴 순서 (낮을수록 먼저 표시)

    __table_args__ = (UniqueConstraint("menu_key", "role", name="uq_menu_role"),)


# ─────────────────────────────────────────────────────────────
# Git Collaboration Models
# ─────────────────────────────────────────────────────────────


class MergeRequestModel(Base):
    """Merge request model for persistent MR storage."""

    __tablename__ = "merge_requests"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(100), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    source_branch = Column(String(200), nullable=False)
    target_branch = Column(String(200), nullable=False)
    status = Column(String(20), default="open")  # draft/open/merged/closed
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
    branch_pattern = Column(String(200), nullable=False)  # "main", "release/*"
    require_approvals = Column(Integer, default=0)
    require_no_conflicts = Column(Boolean, default=True)
    allowed_merge_roles = Column(JSONB, default=lambda: ["owner", "admin"])
    allow_force_push = Column(Boolean, default=False)
    allow_deletion = Column(Boolean, default=False)
    auto_deploy = Column(Boolean, default=False)
    deploy_workflow = Column(String(200), nullable=True)  # e.g. "deploy-staging.yml"
    enabled = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_branch_protection_project", "project_id"),
        Index("ix_branch_protection_enabled", "project_id", "enabled"),
    )


# ─────────────────────────────────────────────────────────────
# Project Access Control (RBAC) Models
# ─────────────────────────────────────────────────────────────


class ProjectAccessModel(Base):
    """Project-level access control model for RBAC."""

    __tablename__ = "project_access"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), nullable=False, index=True)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String(20), nullable=False)  # owner, editor, viewer
    granted_by = Column(String(36), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_user"),
        Index("ix_project_access_project_user", "project_id", "user_id"),
    )

    # Relationships
    user = relationship("UserModel")


class TaskEvaluationModel(Base):
    """Task evaluation model for storing task-level RLHF evaluations."""

    __tablename__ = "task_evaluations"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)
    task_id = Column(String(36), nullable=True, index=True)

    # Evaluation details
    rating = Column(Integer, nullable=False)  # 1-5
    result_accuracy = Column(Boolean, nullable=False, default=True)
    speed_satisfaction = Column(Boolean, nullable=False, default=True)
    comment = Column(Text, nullable=True)

    # Metadata
    agent_id = Column(String(100), nullable=True, index=True)
    context_summary = Column(Text, nullable=True)
    project_name = Column(String(255), nullable=True)
    effort_level = Column(String(20), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        UniqueConstraint("session_id", "task_id", name="uq_task_eval_session_task"),
        Index("ix_task_eval_agent_created", "agent_id", "created_at"),
        Index("ix_task_eval_rating", "rating"),
    )


# ─────────────────────────────────────────────────────────────
# Workflow Automation Models
# ─────────────────────────────────────────────────────────────


class WorkflowDefinitionModel(Base):
    """Workflow definition model for storing workflow configurations."""

    __tablename__ = "workflow_definitions"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    status = Column(String(20), default="active", index=True)
    definition = Column(JSONB, nullable=False, default=dict)
    yaml_content = Column(Text, nullable=True)
    env = Column(JSONB, default=dict)
    version = Column(Integer, default=1)
    created_by = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_run_at = Column(DateTime, nullable=True)
    last_run_status = Column(String(20), nullable=True)

    runs = relationship("WorkflowRunModel", back_populates="workflow", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_workflow_defs_project_status", "project_id", "status"),)


class WorkflowRunModel(Base):
    """Workflow run model for storing execution history."""

    __tablename__ = "workflow_runs"

    id = Column(String(36), primary_key=True)
    workflow_id = Column(
        String(36),
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trigger_type = Column(String(20), nullable=False)
    trigger_payload = Column(JSONB, default=dict)
    status = Column(String(20), default="queued", index=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    total_cost = Column(Float, default=0.0)
    error_summary = Column(Text, nullable=True)

    workflow = relationship("WorkflowDefinitionModel", back_populates="runs")
    jobs = relationship("WorkflowJobModel", back_populates="run", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_workflow_runs_workflow_status", "workflow_id", "status"),
        Index("ix_workflow_runs_started", "started_at"),
    )


class WorkflowJobModel(Base):
    """Workflow job model for storing job execution details."""

    __tablename__ = "workflow_jobs"

    id = Column(String(36), primary_key=True)
    run_id = Column(
        String(36),
        ForeignKey("workflow_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    needs = Column(JSONB, default=list)
    runs_on = Column(String(20), default="local")
    status = Column(String(20), default="queued", index=True)
    matrix_values = Column(JSONB, nullable=True)
    environment = Column(String(100), nullable=True)
    outputs = Column(JSONB, default=dict)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)

    run = relationship("WorkflowRunModel", back_populates="jobs")
    steps = relationship("WorkflowStepModel", back_populates="job", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_workflow_jobs_run_status", "run_id", "status"),)


class WorkflowStepModel(Base):
    """Workflow step model for storing step execution details."""

    __tablename__ = "workflow_steps"

    id = Column(String(36), primary_key=True)
    job_id = Column(
        String(36),
        ForeignKey("workflow_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    step_order = Column(Integer, default=0)
    uses = Column(String(255), nullable=True)
    run_command = Column(Text, nullable=True)
    with_args = Column(JSONB, nullable=True)
    env = Column(JSONB, nullable=True)
    if_condition = Column(String(500), nullable=True)
    continue_on_error = Column(Boolean, default=False)
    status = Column(String(20), default="pending")
    output = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    exit_code = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    job = relationship("WorkflowJobModel", back_populates="steps")

    __table_args__ = (Index("ix_workflow_steps_job_order", "job_id", "step_order"),)


class WorkflowSecretModel(Base):
    """Workflow secret model for encrypted secrets storage (AES-256-GCM)."""

    __tablename__ = "workflow_secrets"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    encrypted_value = Column(EncryptedString(length=None), nullable=False)
    scope = Column(String(20), nullable=False, default="workflow")  # workflow, project, global
    scope_id = Column(String(36), nullable=True, index=True)
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("name", "scope", "scope_id", name="uq_secret_name_scope"),
        Index("ix_workflow_secrets_scope", "scope", "scope_id"),
        Index("ix_workflow_secrets_name_scope", "name", "scope", "scope_id"),
    )


class WorkflowWebhookModel(Base):
    """Workflow webhook model for trigger endpoints."""

    __tablename__ = "workflow_webhooks"

    id = Column(String(36), primary_key=True)
    workflow_id = Column(
        String(36),
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    secret = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    allowed_events = Column(JSONB, default=lambda: ["push", "pull_request"])
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_workflow_webhooks_workflow", "workflow_id"),)


class WorkflowArtifactModel(Base):
    """Workflow artifact model for run output storage."""

    __tablename__ = "workflow_artifacts"

    id = Column(String(36), primary_key=True)
    run_id = Column(
        String(36),
        ForeignKey("workflow_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id = Column(String(36), nullable=True)
    step_id = Column(String(36), nullable=True)
    name = Column(String(255), nullable=False)
    path = Column(Text, nullable=False)
    size_bytes = Column(Integer, default=0)
    content_type = Column(String(100), default="application/octet-stream")
    retention_days = Column(Integer, default=30)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_workflow_artifacts_run", "run_id"),
        Index("ix_workflow_artifacts_expires", "expires_at"),
    )


class ProjectModel(Base):
    """Project model for DB-managed project registry."""

    __tablename__ = "projects"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    path = Column(String(1000), nullable=True)  # Filesystem path for config scanning
    is_active = Column(Boolean, default=True, index=True)
    settings = Column(JSONB, default=dict)

    # Organization ownership
    organization_id = Column(String(36), nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Note: slug, is_active, created_at indexes are created via column-level index=True
    __table_args__: tuple = ()


class ProjectInvitationModel(Base):
    """Project invitation model for email-based membership."""

    __tablename__ = "project_invitations"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), nullable=False)
    invited_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    email = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # owner, editor, viewer
    token = Column(String(128), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="pending")  # pending, accepted, expired

    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("project_id", "email", name="uq_project_invitation_email"),
        Index("ix_project_invitation_token", "token"),
        Index("ix_project_invitation_project", "project_id"),
    )

    # Relationships
    inviter = relationship("UserModel", foreign_keys=[invited_by])


class WorkflowTemplateModel(Base):
    """Workflow template model for reusable workflow definitions."""

    __tablename__ = "workflow_templates"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    category = Column(String(20), default="utility")  # ci, deploy, test, utility
    tags = Column(JSONB, default=list)
    definition = Column(JSONB, nullable=True)
    yaml_content = Column(Text, nullable=True)
    icon = Column(String(50), default="zap")
    popularity = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_workflow_templates_category", "category"),
        Index("ix_workflow_templates_popularity", "popularity"),
    )


# ─────────────────────────────────────────────────────────────
# User LLM Credential Model
# ─────────────────────────────────────────────────────────────


class LLMModelConfigModel(Base):
    """LLM Model configuration stored in database.

    Single source of truth for all available LLM models.
    Seeded from llm_models._MODELS on first startup.
    """

    __tablename__ = "llm_model_configs"

    id = Column(String(100), primary_key=True)  # e.g. "gemini-3-flash-preview"
    display_name = Column(String(255), nullable=False)
    provider = Column(String(50), nullable=False, index=True)  # "google" | "anthropic" | ...
    context_window = Column(Integer, nullable=False, default=128000)
    input_price = Column(Float, nullable=False, default=0.001)  # USD per 1K tokens
    output_price = Column(Float, nullable=False, default=0.002)  # USD per 1K tokens
    is_default = Column(Boolean, default=False, nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False, index=True)
    supports_tools = Column(Boolean, default=True, nullable=False)
    supports_vision = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (Index("ix_llm_model_provider_enabled", "provider", "is_enabled"),)


class UserLLMCredentialModel(Base):
    """User's personal LLM API credentials (encrypted at rest)."""

    __tablename__ = "user_llm_credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    provider = Column(String(50), nullable=False)  # "openai" | "google_gemini" | "anthropic"
    key_name = Column(String(255), nullable=False)  # 사용자 표시용 이름
    api_key = Column(EncryptedString(1024), nullable=False)  # Fernet 자동 암호화
    is_active = Column(Boolean, default=True, nullable=False)
    last_verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "provider", "key_name", name="uq_user_provider_key_name"),
        Index("ix_user_llm_cred_user_provider", "user_id", "provider"),
    )
