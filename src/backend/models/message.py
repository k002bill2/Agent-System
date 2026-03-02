"""Message models for WebSocket communication."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from utils.time import utcnow


class MessageType(str, Enum):
    """WebSocket message types."""

    # Client -> Server
    TASK_CREATE = "task_create"
    TASK_CANCEL = "task_cancel"
    USER_MESSAGE = "user_message"
    PING = "ping"

    # HITL - Client -> Server
    APPROVAL_RESPONSE = "approval_response"

    # Server -> Client
    TASK_STARTED = "task_started"
    TASK_PROGRESS = "task_progress"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    AGENT_THINKING = "agent_thinking"
    AGENT_ACTION = "agent_action"
    STATE_UPDATE = "state_update"
    ERROR = "error"
    PONG = "pong"

    # HITL - Server -> Client
    APPROVAL_REQUIRED = "approval_required"
    APPROVAL_GRANTED = "approval_granted"
    APPROVAL_DENIED = "approval_denied"

    # Token/Cost tracking - Server -> Client
    TOKEN_UPDATE = "token_update"

    # Monitoring - Server -> Client
    CHECK_STARTED = "check_started"
    CHECK_PROGRESS = "check_progress"
    CHECK_COMPLETED = "check_completed"


class Message(BaseModel):
    """Base WebSocket message."""

    type: MessageType
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=utcnow)
    session_id: str | None = None


class TaskCreatePayload(BaseModel):
    """Payload for task creation."""

    title: str
    description: str = ""
    parent_id: str | None = None


class TaskProgressPayload(BaseModel):
    """Payload for task progress updates."""

    task_id: str
    progress: float  # 0-100
    status: str
    message: str = ""
    current_step: int = 0
    total_steps: int = 0


class AgentThinkingPayload(BaseModel):
    """Payload for agent thinking updates."""

    agent_id: str
    agent_name: str
    thought: str
    task_id: str | None = None


class AgentActionPayload(BaseModel):
    """Payload for agent action updates."""

    agent_id: str
    agent_name: str
    action: str
    tool: str | None = None
    input: dict[str, Any] = Field(default_factory=dict)
    output: Any | None = None
    task_id: str | None = None


class StateUpdatePayload(BaseModel):
    """Payload for state synchronization."""

    tasks: dict[str, Any]
    agents: dict[str, Any]
    current_task_id: str | None = None
    active_agent_id: str | None = None


class ErrorPayload(BaseModel):
    """Payload for error messages."""

    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    recoverable: bool = True


# ─────────────────────────────────────────────────────────────
# HITL Payloads
# ─────────────────────────────────────────────────────────────


class ApprovalRequiredPayload(BaseModel):
    """Payload for approval required messages."""

    approval_id: str
    task_id: str
    tool_name: str
    tool_args: dict[str, Any]
    risk_level: str
    risk_description: str
    created_at: str


class ApprovalResponsePayload(BaseModel):
    """Payload for approval response from client."""

    approval_id: str
    approved: bool
    note: str | None = None


class ApprovalGrantedPayload(BaseModel):
    """Payload for approval granted confirmation."""

    approval_id: str
    task_id: str
    message: str = "Operation approved, continuing execution"


class ApprovalDeniedPayload(BaseModel):
    """Payload for approval denied confirmation."""

    approval_id: str
    task_id: str
    message: str = "Operation denied by user"
    note: str | None = None


# ─────────────────────────────────────────────────────────────
# Token/Cost Tracking Payloads
# ─────────────────────────────────────────────────────────────


class TokenUpdatePayload(BaseModel):
    """Payload for token usage updates."""

    agent_name: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    model: str
    cost_usd: float
    # Session totals
    session_total_tokens: int
    session_total_cost_usd: float
