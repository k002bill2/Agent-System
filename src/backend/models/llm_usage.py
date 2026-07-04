"""Internal LLM usage ledger models."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator

from utils.time import utcnow


class LLMRuntimeMode(str, Enum):
    """Runtime execution mode for an LLM request."""

    CLI = "cli"
    API = "api"
    LOCAL = "local"


class LLMUsageStatus(str, Enum):
    """Final status for a ledgered LLM request."""

    SUCCESS = "success"
    ERROR = "error"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class LLMUsageMeasurementMethod(str, Enum):
    """How token/cost usage was measured."""

    PROVIDER_METADATA = "provider_metadata"
    CLI_METADATA = "cli_metadata"
    ESTIMATED = "estimated"
    UNKNOWN = "unknown"


class LLMUsageSource(str, Enum):
    """Known first-party feature sources for LLM usage."""

    PLAYGROUND = "playground"
    TASK_ANALYZER = "task_analyzer"
    TASK_ANALYZER_OCR = "task_analyzer_ocr"
    TASK_ANALYZER_EXECUTION = "task_analyzer_execution"
    GIT_DRAFT_COMMIT = "git_draft_commit"
    SESSION = "session"
    ORCHESTRATOR = "orchestrator"
    AGENT = "agent"
    CONTEXT_COMPRESSION = "context_compression"
    API_FALLBACK_PROXY = "api_fallback_proxy"
    WARP_LAUNCH = "warp_launch"
    WARP_AGENT = "warp_agent"
    RECONCILIATION = "reconciliation"


class LLMUsageRecordCreate(BaseModel):
    """Input contract for writing a usage ledger record."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str | None = None
    organization_id: str | None = None
    provider: str = Field(min_length=1, max_length=50)
    mode: LLMRuntimeMode = LLMRuntimeMode.CLI
    source: str = Field(min_length=1, max_length=100)
    model: str | None = Field(default=None, max_length=255)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)
    measurement_method: LLMUsageMeasurementMethod = LLMUsageMeasurementMethod.UNKNOWN
    estimated_cost_usd: float | None = Field(default=None, ge=0)
    status: LLMUsageStatus = LLMUsageStatus.SUCCESS
    session_id: str | None = None
    task_id: str | None = None
    analysis_id: str | None = None
    project_id: str | None = None
    latency_ms: int | None = Field(default=None, ge=0)
    error_message: str | None = None
    metadata: dict = Field(default_factory=dict)
    started_at: datetime = Field(default_factory=utcnow)
    completed_at: datetime | None = None

    @field_validator("source", mode="before")
    @classmethod
    def _coerce_source(cls, value: object) -> object:
        if isinstance(value, Enum):
            return value.value
        return value


class LLMUsageRecordResponse(BaseModel):
    """API response for a usage ledger record."""

    id: str
    user_id: str | None
    organization_id: str | None
    provider: str
    mode: str
    source: str
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    measurement_method: str
    estimated_cost_usd: float | None
    status: str
    session_id: str | None
    task_id: str | None
    analysis_id: str | None
    project_id: str | None
    latency_ms: int | None
    error_message: str | None
    metadata: dict = Field(default_factory=dict)
    started_at: datetime
    completed_at: datetime | None
    created_at: datetime


class LLMUsageBreakdown(BaseModel):
    """Aggregated usage metrics for one grouping key."""

    total_requests: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0


class LLMUsageSummaryResponse(BaseModel):
    """Aggregated internal ledger usage summary."""

    period_start: datetime
    period_end: datetime
    total_requests: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0
    provider_breakdown: dict[str, LLMUsageBreakdown] = Field(default_factory=dict)
    source_breakdown: dict[str, LLMUsageBreakdown] = Field(default_factory=dict)
    member_breakdown: dict[str, LLMUsageBreakdown] = Field(default_factory=dict)
    organization_breakdown: dict[str, LLMUsageBreakdown] = Field(default_factory=dict)
    mode_breakdown: dict[str, LLMUsageBreakdown] = Field(default_factory=dict)
    model_breakdown: dict[str, LLMUsageBreakdown] = Field(default_factory=dict)
    status_breakdown: dict[str, LLMUsageBreakdown] = Field(default_factory=dict)
