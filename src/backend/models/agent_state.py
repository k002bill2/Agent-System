"""Agent state definitions for LangGraph."""

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, TypedDict

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """Task execution status."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    WAITING = "waiting"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentRole(str, Enum):
    """Agent role types."""

    ORCHESTRATOR = "orchestrator"
    PLANNER = "planner"
    EXECUTOR = "executor"
    REVIEWER = "reviewer"
    SPECIALIST = "specialist"


class AgentInfo(BaseModel):
    """Information about an individual agent."""

    id: str
    role: AgentRole
    name: str
    status: TaskStatus = TaskStatus.PENDING
    current_task: str | None = None
    capabilities: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TaskNode(BaseModel):
    """A node in the task tree."""

    id: str
    parent_id: str | None = None
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.PENDING
    assigned_agent: str | None = None
    children: list[str] = Field(default_factory=list)
    result: Any | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # HITL fields
    pending_approval_id: str | None = None  # ID of pending approval request

    # Self-correction fields
    retry_count: int = 0
    max_retries: int = 3
    error_history: list[str] = Field(default_factory=list)

    # Pause/Resume fields
    paused_at: datetime | None = None
    pause_reason: str | None = None

    # Soft delete fields
    is_deleted: bool = False
    deleted_at: datetime | None = None


def merge_messages(left: list[dict], right: list[dict]) -> list[dict]:
    """Merge message lists by appending new messages."""
    return left + right


def merge_tasks(left: dict[str, TaskNode], right: dict[str, TaskNode]) -> dict[str, TaskNode]:
    """Merge task dictionaries, preferring right side values."""
    return {**left, **right}


class AgentState(TypedDict):
    """
    LangGraph agent state definition.

    This state is shared across all nodes in the graph and represents
    the complete state of the orchestration system.
    """

    # Session information
    session_id: str
    user_id: str | None
    organization_id: str | None

    # Messages (conversation history)
    messages: Annotated[list[dict], merge_messages]

    # Task tree structure
    tasks: Annotated[dict[str, TaskNode], merge_tasks]
    root_task_id: str | None
    current_task_id: str | None

    # Agent registry
    agents: dict[str, AgentInfo]
    active_agent_id: str | None

    # Execution context
    context: dict[str, Any]
    artifacts: dict[str, Any]

    # Control flow
    next_action: str | None
    iteration_count: int
    max_iterations: int

    # Error handling
    errors: list[str]
    last_error: str | None

    # HITL (Human-in-the-Loop)
    pending_approvals: dict[str, dict[str, Any]]  # approval_id -> approval_request
    waiting_for_approval: bool

    # Plan metadata (for dependency tracking)
    plan_metadata: dict[str, Any]

    # Token/Cost tracking
    token_usage: dict[str, Any]
    total_cost: float

    # Parallel execution
    batch_task_ids: list[str]  # Task IDs for parallel execution


def create_initial_state(
    session_id: str,
    user_id: str | None = None,
    organization_id: str | None = None,
    max_iterations: int = 100,
) -> AgentState:
    """Create an initial agent state."""
    return AgentState(
        session_id=session_id,
        user_id=user_id,
        organization_id=organization_id,
        messages=[],
        tasks={},
        root_task_id=None,
        current_task_id=None,
        agents={},
        active_agent_id=None,
        context={},
        artifacts={},
        next_action=None,
        iteration_count=0,
        max_iterations=max_iterations,
        errors=[],
        last_error=None,
        # HITL fields
        pending_approvals={},
        waiting_for_approval=False,
        # Plan metadata
        plan_metadata={},
        # Token/Cost tracking
        token_usage={},
        total_cost=0.0,
        # Parallel execution
        batch_task_ids=[],
    )
