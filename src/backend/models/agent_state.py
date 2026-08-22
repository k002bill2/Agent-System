"""Agent state definitions for LangGraph."""

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, TypedDict

from pydantic import BaseModel, ConfigDict, Field

from utils.time import utcnow

from .errors import StructuredError


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

    # 세션 state 는 JSON 으로 영속화되고 다시 모델로 복원된다. extra 를 버리면
    # 구/신 버전이 남긴 필드가 복원→저장 왕복에서 영구 삭제되므로 보존한다
    # (`db/repository.py` 의 serialize_state/deserialize_state 짝).
    model_config = ConfigDict(extra="allow")

    id: str
    role: AgentRole
    name: str
    status: TaskStatus = TaskStatus.PENDING
    current_task: str | None = None
    capabilities: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)


class TaskNode(BaseModel):
    """A node in the task tree."""

    # AgentInfo 와 같은 이유로 extra 를 보존한다 — 상세는 그쪽 주석 참조.
    model_config = ConfigDict(extra="allow")

    id: str
    parent_id: str | None = None
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.PENDING
    assigned_agent: str | None = None
    children: list[str] = Field(default_factory=list)
    result: Any | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    # HITL fields
    pending_approval_id: str | None = None  # ID of pending approval request

    # Self-correction fields
    retry_count: int = 0
    max_retries: int = 3
    error_history: list[str] = Field(default_factory=list)
    structured_errors: list[StructuredError] = Field(default_factory=list)

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

    # Schema version for forward-compatible migrations
    _schema_version: int

    # 그래프 밖에서 관리하는 키. LangGraph 는 `AgentState` 에 없는 키를 노드
    # 출력에서 **조용히 버리므로**, 선언하지 않으면 `compiled_graph.ainvoke` 를
    # 통과한 state 에서 사라진다 (실측 확인, issue #292).
    #  - `_metadata`: 세션 TTL. 사라지면 그래프를 한 번 돈 세션이 영속 state 에서
    #    만료 정보를 잃는다.
    #  - `_version`: 낙관적 동시성의 기준 행 버전. 사라지면 조건부 UPDATE 가
    #    무조건 쓰기로 떨어져 lost update 가 그대로 남는다. 저장되지는 않는다.
    _metadata: dict[str, Any]
    _version: int

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

    # Context compression tracking
    compression_history: list[dict[str, Any]]


# Current schema version — bump when adding/removing/renaming fields
AGENT_STATE_SCHEMA_VERSION = 2


def create_initial_state(
    session_id: str,
    user_id: str | None = None,
    organization_id: str | None = None,
    max_iterations: int = 100,
) -> AgentState:
    """Create an initial agent state."""
    return AgentState(
        _schema_version=AGENT_STATE_SCHEMA_VERSION,
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
        # Context compression
        compression_history=[],
    )


def migrate_state(state: dict) -> dict:
    """Migrate state from older schema versions to current.

    Each migration step is additive and idempotent — safe to re-apply.
    """
    version = state.get("_schema_version", 1)

    if version < 2:
        # v1 → v2: add batch_task_ids, compression_history
        state.setdefault("batch_task_ids", [])
        state.setdefault("compression_history", [])
        state["_schema_version"] = 2

    # Future migrations go here:
    # if version < 3: ...

    return state
