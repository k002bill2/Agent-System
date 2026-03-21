"""Pipeline data models."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from utils.time import utcnow


class StageConfig(BaseModel, frozen=True):
    """Configuration for a single pipeline stage."""

    stage_type: str  # Registered stage type name
    params: dict[str, Any] = {}


class PipelineConfig(BaseModel, frozen=True):
    """Pipeline configuration (immutable)."""

    name: str
    stages: list[StageConfig]
    error_strategy: Literal["fail_fast", "continue", "retry"] = "fail_fast"
    max_retries: int = 2
    timeout_seconds: int = 300


class PipelineResult(BaseModel):
    """Result of a pipeline execution."""

    run_id: str
    pipeline_id: str
    pipeline_name: str
    status: Literal["success", "failed", "partial"]
    stage_results: list[dict[str, Any]] = []
    total_duration_ms: float = 0
    started_at: datetime = Field(default_factory=utcnow)
    completed_at: datetime | None = None
    error: str | None = None


class PipelineSummary(BaseModel):
    """Summary of a pipeline definition."""

    pipeline_id: str
    name: str
    stage_count: int
    error_strategy: str
    created_at: datetime
    run_count: int = 0
