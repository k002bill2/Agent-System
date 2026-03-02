"""Notification models for smart alerts."""

import uuid
from datetime import datetime

from utils.time import utcnow
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class NotificationChannel(str, Enum):
    """Supported notification channels."""

    SLACK = "slack"
    DISCORD = "discord"
    EMAIL = "email"
    WEBHOOK = "webhook"


class NotificationEventType(str, Enum):
    """Events that can trigger notifications."""

    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    APPROVAL_REQUIRED = "approval_required"
    SESSION_STARTED = "session_started"
    SESSION_ENDED = "session_ended"
    COST_THRESHOLD = "cost_threshold"
    ERROR_OCCURRED = "error_occurred"
    AGENT_BLOCKED = "agent_blocked"


class NotificationPriority(str, Enum):
    """Notification priority levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ChannelConfig(BaseModel):
    """Configuration for a notification channel."""

    channel: NotificationChannel
    enabled: bool = True

    # Channel-specific settings
    webhook_url: str | None = None
    api_key: str | None = None
    bot_token: str | None = None
    email_address: str | None = None

    # SMTP settings for email
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None  # App password for Gmail
    smtp_use_tls: bool = True

    # Rate limiting
    rate_limit_per_hour: int = 60
    last_sent: datetime | None = None
    sent_this_hour: int = 0


class NotificationCondition(BaseModel):
    """Condition for triggering a notification."""

    field: str  # e.g., "status", "cost", "agent_id"
    operator: str  # "equals", "contains", "greater_than", "less_than"
    value: Any


class NotificationRule(BaseModel):
    """Rule for when to send notifications."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    enabled: bool = True

    # Trigger
    event_type: NotificationEventType
    conditions: list[NotificationCondition] = Field(default_factory=list)

    # Channels
    channels: list[NotificationChannel]

    # Project filter
    project_ids: list[str] = Field(default_factory=list)  # Empty list = all projects

    # Customization
    priority: NotificationPriority = NotificationPriority.MEDIUM
    message_template: str | None = None  # Custom message template

    # Metadata
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class NotificationMessage(BaseModel):
    """A notification message to be sent."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    rule_id: str | None = None
    event_type: NotificationEventType
    priority: NotificationPriority = NotificationPriority.MEDIUM

    # Content
    title: str
    body: str
    data: dict[str, Any] = Field(default_factory=dict)

    # Delivery
    channels: list[NotificationChannel]
    sent_at: datetime | None = None
    delivery_status: dict[str, str] = Field(default_factory=dict)  # channel -> status


class NotificationRuleCreate(BaseModel):
    """Request body for creating a notification rule."""

    name: str
    description: str = ""
    event_type: NotificationEventType
    conditions: list[NotificationCondition] = []
    channels: list[NotificationChannel]
    project_ids: list[str] = []
    priority: NotificationPriority = NotificationPriority.MEDIUM
    message_template: str | None = None


class NotificationRuleUpdate(BaseModel):
    """Request body for updating a notification rule."""

    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    event_type: NotificationEventType | None = None
    conditions: list[NotificationCondition] | None = None
    channels: list[NotificationChannel] | None = None
    project_ids: list[str] | None = None
    priority: NotificationPriority | None = None
    message_template: str | None = None


# Default message templates
DEFAULT_TEMPLATES: dict[NotificationEventType, str] = {
    NotificationEventType.TASK_COMPLETED: "Task '{task_title}' completed successfully.",
    NotificationEventType.TASK_FAILED: "Task '{task_title}' failed: {error}",
    NotificationEventType.APPROVAL_REQUIRED: "Approval required for '{tool_name}' in session {session_id}",
    NotificationEventType.SESSION_STARTED: "New orchestration session started: {session_id}",
    NotificationEventType.SESSION_ENDED: "Session {session_id} ended. Total cost: ${total_cost:.4f}",
    NotificationEventType.COST_THRESHOLD: "Cost threshold reached: ${current_cost:.4f} (limit: ${threshold:.4f})",
    NotificationEventType.ERROR_OCCURRED: "Error in session {session_id}: {error}",
    NotificationEventType.AGENT_BLOCKED: "Agent '{agent_id}' is blocked waiting for approval",
}


def format_notification(
    event_type: NotificationEventType,
    data: dict[str, Any],
    template: str | None = None,
) -> str:
    """Format a notification message using template and data."""
    template = template or DEFAULT_TEMPLATES.get(event_type, str(event_type.value))

    try:
        return template.format(**data)
    except KeyError:
        # If template has missing keys, return partial format
        return template
