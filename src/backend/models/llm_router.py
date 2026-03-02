"""LLM Router models for auto-switching between providers."""

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from utils.time import utcnow


class LLMProviderStatus(str, Enum):
    """LLM provider status."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class LLMProvider(str, Enum):
    """Supported LLM providers."""

    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OPENAI = "openai"
    OLLAMA = "ollama"


class LLMProviderConfig(BaseModel):
    """Configuration for an LLM provider."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    provider: LLMProvider
    model: str
    api_key: str | None = None  # Masked in responses
    base_url: str | None = None
    enabled: bool = True
    priority: int = 0  # Higher = more preferred
    max_retries: int = 3
    timeout_seconds: int = 30
    # Rate limiting
    requests_per_minute: int | None = None
    tokens_per_minute: int | None = None
    # Cost tracking
    cost_per_1k_input: float = 0.0
    cost_per_1k_output: float = 0.0
    # Health tracking
    status: LLMProviderStatus = LLMProviderStatus.UNKNOWN
    last_health_check: datetime | None = None
    consecutive_failures: int = 0
    # Metadata
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class LLMProviderConfigCreate(BaseModel):
    """Request to create a new LLM provider configuration."""

    provider: LLMProvider
    model: str
    api_key: str | None = None
    base_url: str | None = None
    enabled: bool = True
    priority: int = 0
    max_retries: int = 3
    timeout_seconds: int = 30
    requests_per_minute: int | None = None
    tokens_per_minute: int | None = None
    cost_per_1k_input: float = 0.0
    cost_per_1k_output: float = 0.0


class LLMProviderConfigUpdate(BaseModel):
    """Request to update an LLM provider configuration."""

    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    enabled: bool | None = None
    priority: int | None = None
    max_retries: int | None = None
    timeout_seconds: int | None = None
    requests_per_minute: int | None = None
    tokens_per_minute: int | None = None
    cost_per_1k_input: float | None = None
    cost_per_1k_output: float | None = None


class LLMHealthCheck(BaseModel):
    """Health check result for an LLM provider."""

    provider_id: str
    provider: LLMProvider
    model: str
    status: LLMProviderStatus
    latency_ms: int | None = None
    error: str | None = None
    checked_at: datetime = Field(default_factory=utcnow)


class LLMRoutingStrategy(str, Enum):
    """Routing strategy for selecting LLM provider."""

    PRIORITY = "priority"  # Use highest priority healthy provider
    ROUND_ROBIN = "round_robin"  # Distribute across healthy providers
    LEAST_COST = "least_cost"  # Use cheapest healthy provider
    LEAST_LATENCY = "least_latency"  # Use fastest healthy provider
    FALLBACK_CHAIN = "fallback_chain"  # Try in priority order until success


class LLMRouterConfig(BaseModel):
    """Global LLM router configuration."""

    strategy: LLMRoutingStrategy = LLMRoutingStrategy.PRIORITY
    health_check_interval_seconds: int = 60
    auto_failover: bool = True
    max_failover_attempts: int = 3
    cooldown_seconds: int = 300  # Time before retrying unhealthy provider
    # Fallback settings
    enable_fallback: bool = True
    fallback_providers: list[str] = []  # Provider IDs in fallback order


class LLMRouterState(BaseModel):
    """Current state of the LLM router."""

    active_provider_id: str | None = None
    routing_strategy: LLMRoutingStrategy = LLMRoutingStrategy.PRIORITY
    providers: list[LLMProviderConfig] = []
    health_checks: list[LLMHealthCheck] = []
    last_routing_decision: datetime | None = None
    total_requests: int = 0
    total_failures: int = 0
    total_fallbacks: int = 0


class LLMRoutingDecision(BaseModel):
    """Decision made by the router for a request."""

    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    selected_provider_id: str
    selected_provider: LLMProvider
    selected_model: str
    reason: str
    attempted_providers: list[str] = []
    fallback_used: bool = False
    decision_time_ms: int = 0
    created_at: datetime = Field(default_factory=utcnow)


class LLMRoutingStats(BaseModel):
    """Statistics for LLM routing."""

    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    fallback_count: int = 0
    provider_usage: dict[str, int] = {}  # provider_id -> request count
    average_latency_ms: float = 0.0
    total_cost: float = 0.0
    period_start: datetime = Field(default_factory=utcnow)
    period_end: datetime = Field(default_factory=utcnow)
