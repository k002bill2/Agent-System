"""LLM Router service for auto-switching between providers."""

import asyncio
import os
import time
from datetime import datetime, timedelta

from models.llm_router import (
    LLMHealthCheck,
    LLMProvider,
    LLMProviderConfig,
    LLMProviderConfigCreate,
    LLMProviderConfigUpdate,
    LLMProviderStatus,
    LLMRouterConfig,
    LLMRouterState,
    LLMRoutingDecision,
    LLMRoutingStats,
    LLMRoutingStrategy,
)

# In-memory storage
_providers: dict[str, LLMProviderConfig] = {}
_router_config: LLMRouterConfig = LLMRouterConfig()
_health_history: list[LLMHealthCheck] = []
_routing_history: list[LLMRoutingDecision] = []
_stats: LLMRoutingStats = LLMRoutingStats()

# Provider-specific latency tracking (provider_id -> list of latencies)
_latency_tracker: dict[str, list[float]] = {}


class LLMRouterService:
    """Service for managing LLM routing and auto-switching."""

    # ─────────────────────────────────────────────────────────────
    # Provider Management
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def create_provider(data: LLMProviderConfigCreate) -> LLMProviderConfig:
        """Create a new LLM provider configuration."""
        provider = LLMProviderConfig(
            provider=data.provider,
            model=data.model,
            api_key=data.api_key,
            base_url=data.base_url,
            enabled=data.enabled,
            priority=data.priority,
            max_retries=data.max_retries,
            timeout_seconds=data.timeout_seconds,
            requests_per_minute=data.requests_per_minute,
            tokens_per_minute=data.tokens_per_minute,
            cost_per_1k_input=data.cost_per_1k_input,
            cost_per_1k_output=data.cost_per_1k_output,
        )
        _providers[provider.id] = provider
        return provider

    @staticmethod
    def get_provider(provider_id: str) -> LLMProviderConfig | None:
        """Get a provider by ID."""
        return _providers.get(provider_id)

    @staticmethod
    def list_providers() -> list[LLMProviderConfig]:
        """List all providers sorted by priority (highest first)."""
        return sorted(
            _providers.values(),
            key=lambda p: (-p.priority, p.created_at),
        )

    @staticmethod
    def update_provider(
        provider_id: str,
        data: LLMProviderConfigUpdate,
    ) -> LLMProviderConfig | None:
        """Update a provider configuration."""
        provider = _providers.get(provider_id)
        if not provider:
            return None

        if data.model is not None:
            provider.model = data.model
        if data.api_key is not None:
            provider.api_key = data.api_key
        if data.base_url is not None:
            provider.base_url = data.base_url
        if data.enabled is not None:
            provider.enabled = data.enabled
        if data.priority is not None:
            provider.priority = data.priority
        if data.max_retries is not None:
            provider.max_retries = data.max_retries
        if data.timeout_seconds is not None:
            provider.timeout_seconds = data.timeout_seconds
        if data.requests_per_minute is not None:
            provider.requests_per_minute = data.requests_per_minute
        if data.tokens_per_minute is not None:
            provider.tokens_per_minute = data.tokens_per_minute
        if data.cost_per_1k_input is not None:
            provider.cost_per_1k_input = data.cost_per_1k_input
        if data.cost_per_1k_output is not None:
            provider.cost_per_1k_output = data.cost_per_1k_output

        provider.updated_at = datetime.utcnow()
        return provider

    @staticmethod
    def delete_provider(provider_id: str) -> bool:
        """Delete a provider."""
        if provider_id in _providers:
            del _providers[provider_id]
            return True
        return False

    # ─────────────────────────────────────────────────────────────
    # Health Checks
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def check_provider_health(provider_id: str) -> LLMHealthCheck:
        """Check health of a specific provider."""
        provider = _providers.get(provider_id)
        if not provider:
            return LLMHealthCheck(
                provider_id=provider_id,
                provider=LLMProvider.ANTHROPIC,  # Default
                model="unknown",
                status=LLMProviderStatus.UNKNOWN,
                error="Provider not found",
            )

        start_time = time.time()

        try:
            # Simulate health check (in production, make actual API call)
            await asyncio.sleep(0.1)  # Simulate network latency

            # Mock health check logic based on provider
            is_healthy = _simulate_provider_health(provider)
            latency_ms = int((time.time() - start_time) * 1000)

            if is_healthy:
                status = LLMProviderStatus.HEALTHY
                provider.consecutive_failures = 0
            else:
                provider.consecutive_failures += 1
                if provider.consecutive_failures >= 3:
                    status = LLMProviderStatus.UNHEALTHY
                else:
                    status = LLMProviderStatus.DEGRADED

            provider.status = status
            provider.last_health_check = datetime.utcnow()

            health_check = LLMHealthCheck(
                provider_id=provider_id,
                provider=provider.provider,
                model=provider.model,
                status=status,
                latency_ms=latency_ms,
            )

        except Exception as e:
            provider.consecutive_failures += 1
            provider.status = LLMProviderStatus.UNHEALTHY
            provider.last_health_check = datetime.utcnow()

            health_check = LLMHealthCheck(
                provider_id=provider_id,
                provider=provider.provider,
                model=provider.model,
                status=LLMProviderStatus.UNHEALTHY,
                error=str(e),
            )

        _health_history.append(health_check)
        # Keep only last 100 health checks
        if len(_health_history) > 100:
            _health_history.pop(0)

        return health_check

    @staticmethod
    async def check_all_providers_health() -> list[LLMHealthCheck]:
        """Check health of all enabled providers."""
        results = []
        for provider_id, provider in _providers.items():
            if provider.enabled:
                health_check = await LLMRouterService.check_provider_health(
                    provider_id
                )
                results.append(health_check)
        return results

    # ─────────────────────────────────────────────────────────────
    # Routing
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def select_provider(
        strategy: LLMRoutingStrategy | None = None,
    ) -> LLMRoutingDecision | None:
        """Select the best provider based on routing strategy."""
        global _stats

        effective_strategy = strategy or _router_config.strategy
        start_time = time.time()

        # Get healthy and enabled providers
        healthy_providers = [
            p
            for p in _providers.values()
            if p.enabled and p.status in (LLMProviderStatus.HEALTHY, LLMProviderStatus.DEGRADED)
        ]

        if not healthy_providers:
            # No healthy providers - try to use any enabled provider
            healthy_providers = [p for p in _providers.values() if p.enabled]

        if not healthy_providers:
            return None

        selected = None
        reason = ""

        if effective_strategy == LLMRoutingStrategy.PRIORITY:
            selected = max(healthy_providers, key=lambda p: p.priority)
            reason = f"Highest priority ({selected.priority})"

        elif effective_strategy == LLMRoutingStrategy.ROUND_ROBIN:
            # Simple round-robin based on request count
            _stats.total_requests += 1
            idx = _stats.total_requests % len(healthy_providers)
            selected = sorted(healthy_providers, key=lambda p: p.id)[idx]
            reason = "Round-robin selection"

        elif effective_strategy == LLMRoutingStrategy.LEAST_COST:
            selected = min(
                healthy_providers,
                key=lambda p: p.cost_per_1k_input + p.cost_per_1k_output,
            )
            total_cost = selected.cost_per_1k_input + selected.cost_per_1k_output
            reason = f"Lowest cost (${total_cost:.4f}/1K tokens)"

        elif effective_strategy == LLMRoutingStrategy.LEAST_LATENCY:
            # Use latency tracker or default to priority
            latencies = {
                p.id: sum(_latency_tracker.get(p.id, [100])) / len(_latency_tracker.get(p.id, [100]))
                for p in healthy_providers
            }
            selected_id = min(latencies, key=latencies.get)  # type: ignore
            selected = _providers[selected_id]
            reason = f"Lowest latency ({latencies[selected_id]:.0f}ms avg)"

        elif effective_strategy == LLMRoutingStrategy.FALLBACK_CHAIN:
            # Use fallback order from config
            for provider_id in _router_config.fallback_providers:
                p = _providers.get(provider_id)
                if p and p.enabled and p.status != LLMProviderStatus.UNHEALTHY:
                    selected = p
                    reason = "Fallback chain order"
                    break
            if not selected:
                selected = max(healthy_providers, key=lambda p: p.priority)
                reason = "Fallback chain exhausted, using priority"

        if not selected:
            return None

        decision = LLMRoutingDecision(
            selected_provider_id=selected.id,
            selected_provider=selected.provider,
            selected_model=selected.model,
            reason=reason,
            decision_time_ms=int((time.time() - start_time) * 1000),
        )

        _routing_history.append(decision)
        if len(_routing_history) > 1000:
            _routing_history.pop(0)

        return decision

    @staticmethod
    def record_request_result(
        provider_id: str,
        success: bool,
        latency_ms: float | None = None,
        tokens_used: int = 0,
    ) -> None:
        """Record the result of a request for statistics."""
        global _stats

        _stats.total_requests += 1
        if success:
            _stats.successful_requests += 1
        else:
            _stats.failed_requests += 1
            provider = _providers.get(provider_id)
            if provider:
                provider.consecutive_failures += 1
                if provider.consecutive_failures >= 3:
                    provider.status = LLMProviderStatus.UNHEALTHY

        # Track provider usage
        _stats.provider_usage[provider_id] = (
            _stats.provider_usage.get(provider_id, 0) + 1
        )

        # Track latency
        if latency_ms is not None:
            if provider_id not in _latency_tracker:
                _latency_tracker[provider_id] = []
            _latency_tracker[provider_id].append(latency_ms)
            # Keep only last 100 latencies per provider
            if len(_latency_tracker[provider_id]) > 100:
                _latency_tracker[provider_id].pop(0)
            # Update average
            all_latencies = [
                lat for lats in _latency_tracker.values() for lat in lats
            ]
            if all_latencies:
                _stats.average_latency_ms = sum(all_latencies) / len(all_latencies)

    # ─────────────────────────────────────────────────────────────
    # Router Configuration
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_router_config() -> LLMRouterConfig:
        """Get the current router configuration."""
        return _router_config

    @staticmethod
    def update_router_config(
        strategy: LLMRoutingStrategy | None = None,
        health_check_interval_seconds: int | None = None,
        auto_failover: bool | None = None,
        max_failover_attempts: int | None = None,
        cooldown_seconds: int | None = None,
        enable_fallback: bool | None = None,
        fallback_providers: list[str] | None = None,
    ) -> LLMRouterConfig:
        """Update the router configuration."""
        global _router_config

        if strategy is not None:
            _router_config.strategy = strategy
        if health_check_interval_seconds is not None:
            _router_config.health_check_interval_seconds = health_check_interval_seconds
        if auto_failover is not None:
            _router_config.auto_failover = auto_failover
        if max_failover_attempts is not None:
            _router_config.max_failover_attempts = max_failover_attempts
        if cooldown_seconds is not None:
            _router_config.cooldown_seconds = cooldown_seconds
        if enable_fallback is not None:
            _router_config.enable_fallback = enable_fallback
        if fallback_providers is not None:
            _router_config.fallback_providers = fallback_providers

        return _router_config

    # ─────────────────────────────────────────────────────────────
    # State & Stats
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_router_state() -> LLMRouterState:
        """Get the current router state."""
        # Determine active provider
        decision = LLMRouterService.select_provider()
        active_provider_id = decision.selected_provider_id if decision else None

        return LLMRouterState(
            active_provider_id=active_provider_id,
            routing_strategy=_router_config.strategy,
            providers=list(_providers.values()),
            health_checks=_health_history[-10:],  # Last 10 health checks
            last_routing_decision=_routing_history[-1].created_at if _routing_history else None,
            total_requests=_stats.total_requests,
            total_failures=_stats.failed_requests,
            total_fallbacks=_stats.fallback_count,
        )

    @staticmethod
    def get_stats(
        period_hours: int = 24,
    ) -> LLMRoutingStats:
        """Get routing statistics for a time period."""
        _stats.period_end = datetime.utcnow()
        _stats.period_start = _stats.period_end - timedelta(hours=period_hours)
        return _stats

    @staticmethod
    def reset_stats() -> None:
        """Reset routing statistics."""
        global _stats
        _stats = LLMRoutingStats()

    # ─────────────────────────────────────────────────────────────
    # Initialization
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def _has_provider(provider_type: LLMProvider) -> bool:
        """Check if a provider type already exists."""
        return any(p.provider == provider_type for p in _providers.values())

    @staticmethod
    def initialize_default_providers() -> None:
        """Initialize default providers from environment variables.
        Skips providers that already exist to prevent duplicates.
        """
        # Anthropic
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if anthropic_key and not LLMRouterService._has_provider(LLMProvider.ANTHROPIC):
            LLMRouterService.create_provider(
                LLMProviderConfigCreate(
                    provider=LLMProvider.ANTHROPIC,
                    model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
                    api_key=anthropic_key,
                    priority=100,
                    cost_per_1k_input=0.003,
                    cost_per_1k_output=0.015,
                )
            )

        # Google
        google_key = os.getenv("GOOGLE_API_KEY")
        if google_key and not LLMRouterService._has_provider(LLMProvider.GOOGLE):
            LLMRouterService.create_provider(
                LLMProviderConfigCreate(
                    provider=LLMProvider.GOOGLE,
                    model=os.getenv("GOOGLE_MODEL", "gemini-2.0-flash"),
                    api_key=google_key,
                    priority=90,
                    cost_per_1k_input=0.00025,
                    cost_per_1k_output=0.001,
                )
            )

        # OpenAI
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key and not LLMRouterService._has_provider(LLMProvider.OPENAI):
            LLMRouterService.create_provider(
                LLMProviderConfigCreate(
                    provider=LLMProvider.OPENAI,
                    model=os.getenv("OPENAI_MODEL", "gpt-4o"),
                    api_key=openai_key,
                    priority=80,
                    cost_per_1k_input=0.005,
                    cost_per_1k_output=0.015,
                )
            )

        # Ollama (local)
        ollama_url = os.getenv("OLLAMA_BASE_URL")
        if ollama_url and not LLMRouterService._has_provider(LLMProvider.OLLAMA):
            LLMRouterService.create_provider(
                LLMProviderConfigCreate(
                    provider=LLMProvider.OLLAMA,
                    model=os.getenv("OLLAMA_MODEL", "qwen2.5:7b"),
                    base_url=ollama_url,
                    priority=50,
                    cost_per_1k_input=0.0,
                    cost_per_1k_output=0.0,
                )
            )


# ─────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────


def _simulate_provider_health(provider: LLMProviderConfig) -> bool:
    """Simulate provider health check (for mock mode)."""
    import random

    # Check if provider has required credentials
    if provider.provider == LLMProvider.OLLAMA:
        # Ollama doesn't need API key
        return provider.base_url is not None
    else:
        # Other providers need API key
        if not provider.api_key:
            return False

    # 95% chance of being healthy if credentials exist
    return random.random() < 0.95
