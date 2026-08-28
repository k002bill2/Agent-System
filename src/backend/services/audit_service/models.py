"""Audit trail enums and Pydantic shapes.

The leaf of the package: every other module depends on these and nothing here
depends back, so the split starts from this file.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from models.audit import DataClassification, RetentionPolicy
from utils.time import utcnow


class AuditAction(str, Enum):
    """Audit action types."""

    # Session actions
    SESSION_CREATED = "session_created"
    SESSION_DELETED = "session_deleted"
    SESSION_EXPIRED = "session_expired"

    # Task actions
    TASK_CREATED = "task_created"
    TASK_UPDATED = "task_updated"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_CANCELLED = "task_cancelled"
    TASK_PAUSED = "task_paused"
    TASK_RESUMED = "task_resumed"
    TASK_RETRIED = "task_retried"
    TASK_DELETED = "task_deleted"

    # Approval actions
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_GRANTED = "approval_granted"
    APPROVAL_DENIED = "approval_denied"

    # Tool actions
    TOOL_EXECUTED = "tool_executed"
    TOOL_FAILED = "tool_failed"

    # Agent actions
    AGENT_ASSIGNED = "agent_assigned"
    AGENT_COMPLETED = "agent_completed"

    # Permission actions
    PERMISSION_CHANGED = "permission_changed"
    AGENT_DISABLED = "agent_disabled"
    AGENT_ENABLED = "agent_enabled"

    # Authentication actions
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    TOKEN_REFRESHED = "token_refreshed"
    USER_REGISTERED = "user_registered"
    LOGIN_FAILED = "login_failed"

    # Project actions
    PROJECT_CREATED = "project_created"
    PROJECT_UPDATED = "project_updated"
    PROJECT_DELETED = "project_deleted"

    # Config actions (skills, agents, MCP, hooks, commands)
    CONFIG_CREATED = "config_created"
    CONFIG_UPDATED = "config_updated"
    CONFIG_DELETED = "config_deleted"

    # Notification actions
    NOTIFICATION_RULE_CREATED = "notification_rule_created"
    NOTIFICATION_RULE_UPDATED = "notification_rule_updated"
    NOTIFICATION_RULE_DELETED = "notification_rule_deleted"

    # LLM Router actions
    LLM_PROVIDER_CHANGED = "llm_provider_changed"


class ResourceType(str, Enum):
    """Resource types for audit logging."""

    SESSION = "session"
    TASK = "task"
    APPROVAL = "approval"
    AGENT = "agent"
    USER = "user"
    PERMISSION = "permission"
    TOOL = "tool"
    PROJECT = "project"
    CONFIG = "config"
    NOTIFICATION = "notification"
    LLM_PROVIDER = "llm_provider"


class AuditLogEntry(BaseModel):
    """Audit log entry model."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str | None = None
    user_id: str | None = None
    project_id: str | None = None

    action: AuditAction
    resource_type: ResourceType
    resource_id: str | None = None

    old_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    changes: dict[str, Any] | None = None

    agent_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None

    metadata: dict[str, Any] = Field(default_factory=dict)
    status: str = "success"
    error_message: str | None = None

    created_at: datetime = Field(default_factory=utcnow)

    # Compliance fields (optional for backward compatibility)
    data_classification: DataClassification | None = None
    change_reason: str | None = None
    compliance_flags: list[str] = Field(default_factory=list)
    previous_hash: str | None = None
    hash: str | None = None
    retention_policy: RetentionPolicy | None = None


class AuditLogFilter(BaseModel):
    """Filter for querying audit logs."""

    session_id: str | None = None
    user_id: str | None = None
    project_id: str | None = None
    include_global: bool = True  # Include project_id IS NULL events when filtering by project
    action: AuditAction | None = None
    resource_type: ResourceType | None = None
    resource_id: str | None = None
    status: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    limit: int = 100
    offset: int = 0


class AuditLogResponse(BaseModel):
    """Response model for audit log queries."""

    logs: list[AuditLogEntry]
    total: int
    limit: int
    offset: int
