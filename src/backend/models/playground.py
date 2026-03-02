"""Playground models for agent testing environment."""

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from models.llm_models import LLMModelRegistry, LLMProvider
from utils.time import utcnow


# Get default model from central registry
def _get_default_model() -> str:
    """Get default model for playground."""
    return LLMModelRegistry.get_default(LLMProvider.GOOGLE)


class PlaygroundExecutionStatus(str, Enum):
    """Status of a playground execution."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PlaygroundMessage(BaseModel):
    """A message in playground conversation."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str  # "user", "assistant", "system", "tool"
    content: str
    tool_calls: list[dict] | None = None
    tool_results: list[dict] | None = None
    timestamp: datetime = Field(default_factory=utcnow)
    tokens: int = 0
    latency_ms: int = 0
    rag_sources: list[dict] | None = None


class PlaygroundExecution(BaseModel):
    """A single execution in the playground."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    prompt: str
    context: dict[str, Any] = Field(default_factory=dict)

    # Execution settings
    temperature: float = 0.7
    max_tokens: int = 4096
    tools_enabled: list[str] = Field(default_factory=list)

    # Results
    status: PlaygroundExecutionStatus = PlaygroundExecutionStatus.PENDING
    messages: list[PlaygroundMessage] = Field(default_factory=list)
    result: str | None = None
    error: str | None = None

    # Metrics
    total_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_latency_ms: int = 0
    cost: float = 0.0

    # Timestamps
    created_at: datetime = Field(default_factory=utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class PlaygroundSession(BaseModel):
    """A playground session for testing agents."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Untitled Session"
    description: str = ""

    # Owner
    user_id: str | None = None  # Owner user ID (None = legacy/unowned)

    # Project context
    project_id: str | None = None  # Optional project ID
    working_directory: str | None = None  # Working directory for code execution and file ops

    # Current settings
    agent_id: str | None = None
    model: str = Field(default_factory=_get_default_model)
    temperature: float = 0.7
    max_tokens: int = 4096
    system_prompt: str | None = None

    # RAG
    rag_enabled: bool = False

    # Tools
    available_tools: list[str] = Field(default_factory=list)
    enabled_tools: list[str] = Field(default_factory=list)

    # Conversation
    messages: list[PlaygroundMessage] = Field(default_factory=list)
    executions: list[PlaygroundExecution] = Field(default_factory=list)

    # Metrics
    total_executions: int = 0
    total_tokens: int = 0
    total_cost: float = 0.0

    # Timestamps
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PlaygroundSessionCreate(BaseModel):
    """Request to create a playground session."""

    name: str = "Untitled Session"
    description: str = ""
    user_id: str | None = None  # Set by API route from auth context
    project_id: str | None = None  # Optional project ID
    working_directory: str | None = None  # Working directory for tools
    agent_id: str | None = None
    model: str = Field(default_factory=_get_default_model)
    system_prompt: str | None = None
    rag_enabled: bool = False


class PlaygroundExecuteRequest(BaseModel):
    """Request to execute a prompt in playground."""

    prompt: str
    context: dict[str, Any] = Field(default_factory=dict)
    temperature: float | None = None
    max_tokens: int | None = None
    tools: list[str] | None = None
    stream: bool = False


class PlaygroundToolTest(BaseModel):
    """Request to test a specific tool."""

    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    mock_response: bool = False
    working_directory: str | None = None  # Working directory for file/code tools


class PlaygroundCompareRequest(BaseModel):
    """Request to compare multiple agents/models."""

    prompt: str
    agents: list[str]  # List of agent IDs to compare
    models: list[str] | None = None  # Optional: compare same agent on different models
    context: dict[str, Any] = Field(default_factory=dict)


class PlaygroundCompareResult(BaseModel):
    """Result of a comparison execution."""

    prompt: str
    results: list[PlaygroundExecution]
    winner: str | None = None  # agent_id of best result (if auto-evaluated)
    comparison_metrics: dict[str, Any] = Field(default_factory=dict)
