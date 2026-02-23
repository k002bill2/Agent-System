"""Task models for API requests/responses."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from models.agent_state import TaskStatus


class TaskBase(BaseModel):
    """Base task model."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(default="", max_length=5000)
    parent_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskCreate(TaskBase):
    """Task creation request."""

    priority: int = Field(default=0, ge=0, le=10)
    tags: list[str] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    """Task update request."""

    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    status: TaskStatus | None = None
    result: Any | None = None
    error: str | None = None


class Task(TaskBase):
    """Complete task model."""

    id: str
    status: TaskStatus = TaskStatus.PENDING
    assigned_agent: str | None = None
    children: list[str] = Field(default_factory=list)
    result: Any | None = None
    error: str | None = None
    priority: int = 0
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TaskTree(BaseModel):
    """Task tree representation for UI."""

    id: str
    title: str
    status: TaskStatus
    children: list["TaskTree"] = Field(default_factory=list)
    depth: int = 0
    progress: float = 0.0  # 0-100%


TaskTree.model_rebuild()


class TaskExecutionResult(BaseModel):
    """Result from task execution."""

    task_id: str
    success: bool
    result: Any | None = None
    error: str | None = None
    execution_time_ms: int = 0
    tokens_used: int = 0
