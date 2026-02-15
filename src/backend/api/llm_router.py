"""LLM Router API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.audit_service import AuditAction, AuditService, ResourceType
from models.llm_router import (
    LLMHealthCheck,
    LLMProviderConfig,
    LLMProviderConfigCreate,
    LLMProviderConfigUpdate,
    LLMRouterConfig,
    LLMRouterState,
    LLMRoutingDecision,
    LLMRoutingStats,
    LLMRoutingStrategy,
)
from services.llm_router_service import LLMRouterService

router = APIRouter(prefix="/llm-router", tags=["llm-router"])


# ─────────────────────────────────────────────────────────────
# Provider Management
# ─────────────────────────────────────────────────────────────


@router.get("/providers", response_model=list[LLMProviderConfig])
async def list_providers():
    """List all LLM providers."""
    providers = LLMRouterService.list_providers()
    # Mask API keys in response
    for p in providers:
        if p.api_key:
            p.api_key = "***" + p.api_key[-4:] if len(p.api_key) > 4 else "***"
    return providers


@router.post("/providers", response_model=LLMProviderConfig)
async def create_provider(data: LLMProviderConfigCreate):
    """Create a new LLM provider configuration."""
    provider = LLMRouterService.create_provider(data)
    AuditService.log(
        action=AuditAction.LLM_PROVIDER_CHANGED,
        resource_type=ResourceType.LLM_PROVIDER,
        resource_id=provider.id,
        metadata={"operation": "created", "provider": provider.provider, "name": provider.name},
    )
    # Mask API key in response
    if provider.api_key:
        provider.api_key = "***" + provider.api_key[-4:] if len(provider.api_key) > 4 else "***"
    return provider


@router.get("/providers/{provider_id}", response_model=LLMProviderConfig)
async def get_provider(provider_id: str):
    """Get a specific LLM provider."""
    provider = LLMRouterService.get_provider(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    # Mask API key in response
    if provider.api_key:
        provider.api_key = "***" + provider.api_key[-4:] if len(provider.api_key) > 4 else "***"
    return provider


@router.patch("/providers/{provider_id}", response_model=LLMProviderConfig)
async def update_provider(provider_id: str, data: LLMProviderConfigUpdate):
    """Update an LLM provider configuration."""
    provider = LLMRouterService.update_provider(provider_id, data)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    AuditService.log(
        action=AuditAction.LLM_PROVIDER_CHANGED,
        resource_type=ResourceType.LLM_PROVIDER,
        resource_id=provider_id,
        metadata={"operation": "updated", "provider": provider.provider},
    )
    # Mask API key in response
    if provider.api_key:
        provider.api_key = "***" + provider.api_key[-4:] if len(provider.api_key) > 4 else "***"
    return provider


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str):
    """Delete an LLM provider."""
    if not LLMRouterService.delete_provider(provider_id):
        raise HTTPException(status_code=404, detail="Provider not found")
    AuditService.log(
        action=AuditAction.LLM_PROVIDER_CHANGED,
        resource_type=ResourceType.LLM_PROVIDER,
        resource_id=provider_id,
        metadata={"operation": "deleted"},
    )
    return {"success": True, "message": "Provider deleted"}


@router.post("/providers/{provider_id}/toggle")
async def toggle_provider(provider_id: str):
    """Toggle a provider's enabled status."""
    provider = LLMRouterService.get_provider(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    updated = LLMRouterService.update_provider(
        provider_id,
        LLMProviderConfigUpdate(enabled=not provider.enabled),
    )
    AuditService.log(
        action=AuditAction.LLM_PROVIDER_CHANGED,
        resource_type=ResourceType.LLM_PROVIDER,
        resource_id=provider_id,
        metadata={"operation": "toggled", "enabled": updated.enabled if updated else False},
    )
    return {"success": True, "enabled": updated.enabled if updated else False}


# ─────────────────────────────────────────────────────────────
# Health Checks
# ─────────────────────────────────────────────────────────────


@router.get("/health", response_model=list[LLMHealthCheck])
async def check_all_health():
    """Check health of all enabled providers."""
    return await LLMRouterService.check_all_providers_health()


@router.get("/health/{provider_id}", response_model=LLMHealthCheck)
async def check_provider_health(provider_id: str):
    """Check health of a specific provider."""
    return await LLMRouterService.check_provider_health(provider_id)


# ─────────────────────────────────────────────────────────────
# Routing
# ─────────────────────────────────────────────────────────────


@router.get("/select", response_model=LLMRoutingDecision | None)
async def select_provider(strategy: LLMRoutingStrategy | None = None):
    """Select the best provider based on routing strategy."""
    decision = LLMRouterService.select_provider(strategy)
    if not decision:
        raise HTTPException(status_code=503, detail="No available providers")
    return decision


class RecordRequestResult(BaseModel):
    """Request to record a request result."""

    provider_id: str
    success: bool
    latency_ms: float | None = None
    tokens_used: int = 0


@router.post("/record")
async def record_request_result(data: RecordRequestResult):
    """Record the result of a request for statistics."""
    LLMRouterService.record_request_result(
        provider_id=data.provider_id,
        success=data.success,
        latency_ms=data.latency_ms,
        tokens_used=data.tokens_used,
    )
    return {"success": True}


# ─────────────────────────────────────────────────────────────
# Router Configuration
# ─────────────────────────────────────────────────────────────


@router.get("/config", response_model=LLMRouterConfig)
async def get_router_config():
    """Get the current router configuration."""
    return LLMRouterService.get_router_config()


class UpdateRouterConfig(BaseModel):
    """Request to update router configuration."""

    strategy: LLMRoutingStrategy | None = None
    health_check_interval_seconds: int | None = None
    auto_failover: bool | None = None
    max_failover_attempts: int | None = None
    cooldown_seconds: int | None = None
    enable_fallback: bool | None = None
    fallback_providers: list[str] | None = None


@router.patch("/config", response_model=LLMRouterConfig)
async def update_router_config(data: UpdateRouterConfig):
    """Update the router configuration."""
    config = LLMRouterService.update_router_config(
        strategy=data.strategy,
        health_check_interval_seconds=data.health_check_interval_seconds,
        auto_failover=data.auto_failover,
        max_failover_attempts=data.max_failover_attempts,
        cooldown_seconds=data.cooldown_seconds,
        enable_fallback=data.enable_fallback,
        fallback_providers=data.fallback_providers,
    )
    AuditService.log(
        action=AuditAction.LLM_PROVIDER_CHANGED,
        resource_type=ResourceType.LLM_PROVIDER,
        resource_id="router_config",
        metadata={"operation": "config_updated", "strategy": config.strategy.value if config.strategy else None},
    )
    return config


# ─────────────────────────────────────────────────────────────
# State & Stats
# ─────────────────────────────────────────────────────────────


@router.get("/state", response_model=LLMRouterState)
async def get_router_state():
    """Get the current router state."""
    state = LLMRouterService.get_router_state()
    # Mask API keys in providers
    for p in state.providers:
        if p.api_key:
            p.api_key = "***" + p.api_key[-4:] if len(p.api_key) > 4 else "***"
    return state


@router.get("/stats", response_model=LLMRoutingStats)
async def get_stats(period_hours: int = 24):
    """Get routing statistics for a time period."""
    return LLMRouterService.get_stats(period_hours)


@router.post("/stats/reset")
async def reset_stats():
    """Reset routing statistics."""
    LLMRouterService.reset_stats()
    return {"success": True, "message": "Statistics reset"}


# ─────────────────────────────────────────────────────────────
# Initialization
# ─────────────────────────────────────────────────────────────


@router.post("/initialize")
async def initialize_providers():
    """Initialize default providers from environment variables."""
    LLMRouterService.initialize_default_providers()
    return {"success": True, "message": "Providers initialized"}
