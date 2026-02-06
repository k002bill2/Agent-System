"""Claude Code external session model."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class SessionStatus(str, Enum):
    """Session status enum."""

    ACTIVE = "active"
    IDLE = "idle"
    COMPLETED = "completed"
    UNKNOWN = "unknown"


class MessageType(str, Enum):
    """Message type enum."""

    USER = "user"
    ASSISTANT = "assistant"
    PROGRESS = "progress"
    TOOL_USE = "tool_use"
    TOOL_RESULT = "tool_result"


class TokenUsage(BaseModel):
    """Token usage information."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0


class SessionMessage(BaseModel):
    """Individual message in a session."""

    type: MessageType
    timestamp: datetime
    model: str | None = None
    content: str | None = None
    tool_name: str | None = None
    tool_id: str | None = None
    tool_input: dict | None = None  # Tool input parameters
    usage: TokenUsage | None = None


class ClaudeSessionInfo(BaseModel):
    """Claude Code session information."""

    session_id: str = Field(..., description="Unique session ID (UUID)")
    slug: str = Field(..., description="Human-readable slug like 'federated-booping-frog'")
    status: SessionStatus = Field(default=SessionStatus.UNKNOWN, description="Session status")
    model: str = Field(default="unknown", description="Model name like 'claude-opus-4-5-20251101'")
    project_path: str = Field(..., description="Encoded project path like '-Users-username-Work-MyProject'")
    project_name: str = Field(default="", description="Human-readable project name")
    git_branch: str = Field(default="", description="Current git branch")
    cwd: str = Field(default="", description="Current working directory")
    version: str = Field(default="", description="Claude Code version")

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity: datetime = Field(default_factory=datetime.utcnow)

    # Counts
    message_count: int = Field(default=0, description="Total messages in session")
    user_message_count: int = Field(default=0, description="User messages count")
    assistant_message_count: int = Field(default=0, description="Assistant messages count")
    tool_call_count: int = Field(default=0, description="Tool calls count")

    # Token/Cost tracking
    total_input_tokens: int = Field(default=0)
    total_output_tokens: int = Field(default=0)
    estimated_cost: float = Field(default=0.0)

    # File metadata
    file_path: str = Field(default="", description="Path to the .jsonl file")
    file_size: int = Field(default=0, description="File size in bytes")

    # AI-generated summary
    summary: str | None = Field(default=None, description="AI-generated conversation summary")

    # Source user tracking (for external sessions)
    source_user: str = Field(default="", description="Username who owns this session (extracted from path)")
    source_path: str = Field(default="", description="Base path where this session was found")


class ClaudeSessionDetail(ClaudeSessionInfo):
    """Detailed session information with recent messages."""

    recent_messages: list[SessionMessage] = Field(
        default_factory=list,
        description="Recent messages (last 20)"
    )
    current_task: str | None = Field(
        default=None,
        description="Current task description if active"
    )


class ClaudeSessionResponse(BaseModel):
    """API response for session list."""

    sessions: list[ClaudeSessionInfo]
    total_count: int  # Total count before filtering
    filtered_count: int  # Count after filtering (for pagination)
    active_count: int
    has_more: bool  # Whether more sessions are available
    offset: int  # Current offset
    limit: int  # Page size


class ClaudeSessionSaveRequest(BaseModel):
    """Request to save session to database."""

    session_id: str
    notes: str = ""


class ClaudeSessionSaveResponse(BaseModel):
    """Response after saving session."""

    success: bool
    message: str
    saved_at: datetime | None = None


# ========================================
# Activity/Tasks Models for Dashboard Integration
# ========================================


class ActivityEventType(str, Enum):
    """Activity event type enum."""

    USER = "user"
    ASSISTANT = "assistant"
    TOOL_USE = "tool_use"
    TOOL_RESULT = "tool_result"
    ERROR = "error"


class ActivityEvent(BaseModel):
    """Activity event extracted from Claude Code session."""

    id: str = Field(..., description="Unique event ID")
    type: ActivityEventType = Field(..., description="Event type")
    timestamp: datetime = Field(..., description="Event timestamp")
    content: str | None = Field(default=None, description="Text content")
    tool_name: str | None = Field(default=None, description="Tool name (for tool_use/tool_result)")
    tool_input: dict | None = Field(default=None, description="Tool input parameters")
    tool_result: str | None = Field(default=None, description="Tool result (for tool_result)")
    session_id: str = Field(..., description="Parent session ID")


class ClaudeCodeTaskStatus(str, Enum):
    """Task status enum."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class ClaudeCodeTask(BaseModel):
    """Task extracted from Claude Code TaskCreate/TaskUpdate tool calls."""

    id: str = Field(..., description="Task ID")
    title: str = Field(..., description="Task title/subject")
    description: str | None = Field(default=None, description="Task description")
    status: ClaudeCodeTaskStatus = Field(
        default=ClaudeCodeTaskStatus.PENDING,
        description="Task status"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    parent_id: str | None = Field(default=None, description="Parent task ID")
    children: list[str] = Field(default_factory=list, description="Child task IDs")
    active_form: str | None = Field(default=None, description="Active form text for spinner")


class ActivityResponse(BaseModel):
    """Response for activity list endpoint."""

    session_id: str
    events: list[ActivityEvent]
    total_count: int
    offset: int
    limit: int
    has_more: bool


class TasksResponse(BaseModel):
    """Response for tasks endpoint."""

    session_id: str
    tasks: dict[str, ClaudeCodeTask]
    root_task_ids: list[str]
    total_count: int


# Cost per 1K tokens for different models
MODEL_COSTS = {
    "claude-opus-4-5-20251101": {"input": 0.015, "output": 0.075},
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
    "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
    "claude-3-5-haiku-20241022": {"input": 0.001, "output": 0.005},
}


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate estimated cost for token usage."""
    costs = MODEL_COSTS.get(model, {"input": 0.003, "output": 0.015})
    return (input_tokens / 1000 * costs["input"]) + (output_tokens / 1000 * costs["output"])
