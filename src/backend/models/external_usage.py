"""External LLM usage monitoring models."""

from __future__ import annotations

import uuid
from datetime import datetime

from utils.time import utcnow
from enum import Enum

from pydantic import BaseModel, Field


class ExternalProvider(str, Enum):
    """Supported external LLM providers."""

    OPENAI = "openai"
    GITHUB_COPILOT = "github_copilot"
    GOOGLE_GEMINI = "google_gemini"
    ANTHROPIC = "anthropic"


class ProviderHealthStatus(BaseModel):
    """Health check result for a provider."""

    provider: ExternalProvider
    is_healthy: bool
    last_checked: datetime = Field(default_factory=utcnow)
    error_message: str | None = None
    latency_ms: float | None = None


class UnifiedUsageRecord(BaseModel):
    """Normalized usage record across providers."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    provider: ExternalProvider
    timestamp: datetime
    bucket_width: str = "1d"  # "1h", "1d"

    # Common metrics
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    request_count: int = 0

    # Classification
    model: str | None = None
    user_id: str | None = None
    user_email: str | None = None
    project_id: str | None = None

    # Copilot-specific
    code_suggestions: int | None = None
    code_acceptances: int | None = None
    acceptance_rate: float | None = None

    # Metadata
    raw_data: dict = Field(default_factory=dict)
    collected_at: datetime = Field(default_factory=utcnow)


class UsageSummary(BaseModel):
    """Aggregated usage summary for a provider."""

    provider: ExternalProvider
    period_start: datetime
    period_end: datetime
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cost_usd: float = 0.0
    total_requests: int = 0
    model_breakdown: dict[str, float] = Field(default_factory=dict)  # model -> cost_usd
    member_breakdown: dict[str, float] = Field(default_factory=dict)  # user_id -> cost_usd


class ExternalUsageSummaryResponse(BaseModel):
    """Combined external usage response."""

    providers: list[UsageSummary] = Field(default_factory=list)
    total_cost_usd: float = 0.0
    records: list[UnifiedUsageRecord] = Field(default_factory=list)
    period_start: datetime
    period_end: datetime


class ProviderConfig(BaseModel):
    """Provider configuration status."""

    provider: ExternalProvider
    enabled: bool
    api_key_masked: str | None = None
    org_id: str | None = None
    last_sync_at: datetime | None = None
    error_message: str | None = None


class ProviderConfigRequest(BaseModel):
    """Request to configure a provider."""

    api_key: str
    org_id: str | None = None


class SyncRequest(BaseModel):
    """Request to sync usage data."""

    provider: ExternalProvider | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


# ── LLM Credential 관련 스키마 ────────────────────────────────────


class LLMCredentialCreate(BaseModel):
    """사용자가 API Key 등록 시 전달하는 요청 바디."""

    provider: ExternalProvider
    key_name: str = Field(min_length=1, max_length=100)
    api_key: str = Field(min_length=10)


class LLMCredentialUpdate(BaseModel):
    """API Key 수정 요청 바디. 모든 필드는 선택적."""

    key_name: str | None = Field(default=None, min_length=1, max_length=100)
    api_key: str | None = Field(default=None, min_length=10)


class LLMCredentialResponse(BaseModel):
    """API 응답 — api_key는 마스킹 처리."""

    id: str
    provider: ExternalProvider
    key_name: str
    api_key_masked: str
    is_active: bool
    last_verified_at: datetime | None
    created_at: datetime


class LLMCredentialVerifyResponse(BaseModel):
    """API Key 유효성 검증 결과."""

    is_valid: bool
    provider: ExternalProvider
    error_message: str | None = None
    latency_ms: float | None = None
