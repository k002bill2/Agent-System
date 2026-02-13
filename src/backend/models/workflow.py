"""Workflow automation models."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class WorkflowStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DRAFT = "draft"


class WorkflowRunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"
    SKIPPED = "skipped"


class TriggerType(str, Enum):
    MANUAL = "manual"
    PUSH = "push"
    PULL_REQUEST = "pull_request"
    SCHEDULE = "schedule"
    WEBHOOK = "webhook"
    MERGE = "merge"


class RunnerType(str, Enum):
    LOCAL = "local"
    DOCKER = "docker"


# Pydantic schemas for API
class RetryConfig(BaseModel):
    max_attempts: int = 1
    backoff: str = "linear"  # linear, exponential
    delay_seconds: float = 1.0


class WorkflowStepDef(BaseModel):
    name: str
    id: str | None = None  # step id for output referencing
    run: str | None = None
    uses: str | None = None
    with_args: dict[str, Any] | None = Field(None, alias="with")
    env: dict[str, str] | None = None
    if_condition: str | None = Field(None, alias="if")
    continue_on_error: bool = False
    timeout_minutes: int = 30
    retry: RetryConfig | dict | None = None
    outputs: dict[str, str] | None = None  # output definitions


class WorkflowJobDef(BaseModel):
    name: str | None = None
    runs_on: RunnerType = RunnerType.LOCAL
    needs: list[str] = Field(default_factory=list)
    steps: list[WorkflowStepDef] = Field(default_factory=list)
    matrix: dict[str, list[str]] | None = None
    matrix_exclude: list[dict[str, str]] | None = None
    matrix_include: list[dict[str, str]] | None = None
    environment: str | None = None
    if_condition: str | None = Field(None, alias="if")
    env: dict[str, str] | None = None
    timeout_minutes: int = 60
    outputs: dict[str, str] | None = None


class TriggerConfig(BaseModel):
    push: dict[str, Any] | None = None
    pull_request: dict[str, Any] | None = None
    schedule: list[dict[str, str]] | None = None
    manual: dict[str, Any] | None = None
    webhook: dict[str, Any] | None = None


class WorkflowDefinitionSchema(BaseModel):
    name: str
    description: str = ""
    on: TriggerConfig = Field(default_factory=TriggerConfig)
    env: dict[str, str] = Field(default_factory=dict)
    jobs: dict[str, WorkflowJobDef] = Field(default_factory=dict)


# API Request/Response schemas
class WorkflowCreate(BaseModel):
    name: str
    description: str = ""
    yaml_content: str | None = None
    definition: WorkflowDefinitionSchema | None = None
    project_id: str | None = None


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    yaml_content: str | None = None
    definition: WorkflowDefinitionSchema | None = None
    status: WorkflowStatus | None = None
    project_id: str | None = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: str
    status: WorkflowStatus
    project_id: str | None
    definition: dict
    yaml_content: str | None
    version: int
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    last_run_at: datetime | None = None
    last_run_status: WorkflowRunStatus | None = None


class WorkflowRunTrigger(BaseModel):
    trigger_type: TriggerType = TriggerType.MANUAL
    inputs: dict[str, Any] = Field(default_factory=dict)
    branch: str | None = None


class WorkflowRunResponse(BaseModel):
    id: str
    workflow_id: str
    workflow_name: str
    trigger_type: TriggerType
    trigger_payload: dict
    status: WorkflowRunStatus
    started_at: datetime
    completed_at: datetime | None
    duration_seconds: float | None
    total_cost: float
    error_summary: str | None
    jobs: list["WorkflowJobResponse"] = Field(default_factory=list)


class WorkflowJobResponse(BaseModel):
    id: str
    run_id: str
    name: str
    status: JobStatus
    runner: RunnerType
    needs: list[str]
    environment: str | None
    started_at: datetime | None
    completed_at: datetime | None
    duration_seconds: float | None
    steps: list["WorkflowStepResponse"] = Field(default_factory=list)


class WorkflowStepResponse(BaseModel):
    id: str
    job_id: str
    name: str
    status: StepStatus
    run: str | None
    uses: str | None
    output: str | None
    error: str | None
    duration_ms: int | None
    started_at: datetime | None
    completed_at: datetime | None


class WorkflowListResponse(BaseModel):
    workflows: list[WorkflowResponse]
    total: int


class WorkflowRunListResponse(BaseModel):
    runs: list[WorkflowRunResponse]
    total: int
