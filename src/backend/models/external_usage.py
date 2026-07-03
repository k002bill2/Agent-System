"""External LLM usage monitoring models."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from utils.time import utcnow


class ExternalProvider(str, Enum):
    """Supported external LLM providers."""

    CODEX_CLI = "codex_cli"
    CLAUDE_CLI = "claude_cli"
    INTERNAL_CLI = "internal_cli"
    INTERNAL_API = "internal_api"
    OPENAI = "openai"
    GITHUB_COPILOT = "github_copilot"
    GOOGLE = "google"
    GOOGLE_GEMINI = "google_gemini"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


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


class UsageReconciliationComparison(BaseModel):
    """Internal ledger vs provider billing comparison for one provider."""

    provider: ExternalProvider
    internal_total_tokens: int = 0
    internal_total_cost_usd: float = 0.0
    internal_total_requests: int = 0
    provider_billing_total_tokens: int = 0
    provider_billing_total_cost_usd: float = 0.0
    provider_billing_total_requests: int = 0
    delta_tokens: int = 0
    delta_cost_usd: float = 0.0
    status: str = "not_collected"


class UsageReconciliationSummary(BaseModel):
    """Summary metadata for comparing internal usage with optional provider billing."""

    primary_source: str = "internal_ledger"
    provider_billing_enabled: bool = False
    internal_total_tokens: int = 0
    internal_total_cost_usd: float = 0.0
    internal_total_requests: int = 0
    provider_billing_total_tokens: int = 0
    provider_billing_total_cost_usd: float = 0.0
    provider_billing_total_requests: int = 0
    provider_billing_record_count: int = 0
    comparisons: list[UsageReconciliationComparison] = Field(default_factory=list)


class ExternalUsageSummaryResponse(BaseModel):
    """Combined external usage response."""

    providers: list[UsageSummary] = Field(default_factory=list)
    total_cost_usd: float = 0.0
    records: list[UnifiedUsageRecord] = Field(default_factory=list)
    period_start: datetime
    period_end: datetime
    reconciliation: UsageReconciliationSummary | None = None


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


# ── Deployment Usage Credential 관련 스키마 ─────────────────────────
# admin/manager 가 관리하는 org-level usage 전용 키. api_key 평문은 응답에
# 절대 포함하지 않으며 항상 마스킹한다.


class DeploymentUsageKeyResponse(BaseModel):
    """배포 단위 usage 키 상태 응답 — api_key는 마스킹 처리."""

    provider: ExternalProvider
    has_db_key: bool
    is_active: bool
    source: str  # "db" | "env" | "none"
    api_key_masked: str | None = None
    label: str | None = None
    last_verified_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DeploymentUsageKeyUpsert(BaseModel):
    """usage 키 등록/수정 요청 바디.

    ``api_key`` 는 선택적: 제공 시에만 저장(길이 10..1024 검증), 생략/None 이면
    기존 암호화 키를 보존한다(label·is_active 만 수정 — 설계 A5). 신규 생성에는
    키가 필수이므로 서비스 계층이 거부(엔드포인트에서 HTTP 400)한다.
    """

    api_key: str | None = Field(default=None, min_length=10, max_length=1024)
    label: str | None = Field(default=None, max_length=255)
    is_active: bool = True


class DeploymentUsageKeyVerifyResponse(BaseModel):
    """usage 키 검증 결과 — HTTP status만 관찰(스코프 문자열 검사 없음)."""

    provider: ExternalProvider
    is_valid: bool
    usage_capable: bool
    status_code: int | None = None
    error_message: str | None = None
    latency_ms: float | None = None
