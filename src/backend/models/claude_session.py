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
    project_path: str = Field(..., description="Encoded project path like '-Users-younghwankang-Work-LiveMetro'")
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
    total_count: int
    active_count: int


class ClaudeSessionSaveRequest(BaseModel):
    """Request to save session to database."""

    session_id: str
    notes: str = ""


class ClaudeSessionSaveResponse(BaseModel):
    """Response after saving session."""

    success: bool
    message: str
    saved_at: datetime | None = None


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
