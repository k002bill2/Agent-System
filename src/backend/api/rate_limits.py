"""Rate limiting API routes."""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Depends

from models.rate_limit import (
    RateLimitTier,
    TierConfig,
    RATE_LIMIT_TIERS,
    RateLimitStatus,
    RateLimitOverride,
)
from services.rate_limit_service import get_rate_limit_service, RateLimitService


router = APIRouter(prefix="/rate-limits", tags=["rate-limits"])


def get_service() -> RateLimitService:
    """Get rate limit service dependency."""
    return get_rate_limit_service()


# ─────────────────────────────────────────────────────────────
# Status & Info
# ─────────────────────────────────────────────────────────────


@router.get("/status")
async def get_rate_limit_status(
    identifier: str = Query(..., description="User ID or API key"),
    tier: str = Query(RateLimitTier.FREE.value, description="Rate limit tier"),
    service: RateLimitService = Depends(get_service),
) -> RateLimitStatus:
    """
    Get current rate limit status for an identifier.

    Returns:
    - Current usage counts
    - Remaining requests
    - Reset times for each window
    """
    return await service.get_status(identifier, tier)


@router.get("/tiers")
async def list_rate_limit_tiers() -> dict[str, TierConfig]:
    """
    Get all available rate limit tiers and their configurations.

    Returns tier details including:
    - requests_per_minute
    - requests_per_hour
    - requests_per_day
    - burst_limit
    """
    return RATE_LIMIT_TIERS


@router.get("/tiers/{tier}")
async def get_rate_limit_tier(tier: str) -> TierConfig:
    """Get configuration for a specific tier."""
    config = RATE_LIMIT_TIERS.get(tier)
    if not config:
        raise HTTPException(
            status_code=404,
            detail=f"Tier '{tier}' not found. Available tiers: {list(RATE_LIMIT_TIERS.keys())}",
        )
    return config


# ─────────────────────────────────────────────────────────────
# Admin Operations
# ─────────────────────────────────────────────────────────────


@router.post("/reset")
async def reset_rate_limits(
    identifier: str = Query(..., description="User ID or API key to reset"),
    service: RateLimitService = Depends(get_service),
):
    """
    Reset rate limits for an identifier (admin operation).

    This immediately clears all rate limit counters for the specified identifier.
    """
    success = await service.reset_limits(identifier)
    return {
        "success": success,
        "identifier": identifier,
        "message": f"Rate limits reset for {identifier}",
    }


# ─────────────────────────────────────────────────────────────
# Overrides
# ─────────────────────────────────────────────────────────────


@router.get("/overrides")
async def list_overrides(
    service: RateLimitService = Depends(get_service),
) -> list[RateLimitOverride]:
    """List all active rate limit overrides."""
    return service.list_overrides()


@router.get("/overrides/{identifier}")
async def get_override(
    identifier: str,
    service: RateLimitService = Depends(get_service),
) -> RateLimitOverride:
    """Get override for a specific identifier."""
    override = service.get_override(identifier)
    if not override:
        raise HTTPException(
            status_code=404,
            detail=f"No override found for '{identifier}'",
        )
    return override


@router.post("/overrides")
async def create_override(
    identifier: str = Query(..., description="User ID or API key"),
    tier: str | None = Query(None, description="Override tier"),
    expires_at: datetime | None = Query(None, description="Override expiration"),
    reason: str | None = Query(None, description="Reason for override"),
    created_by: str | None = Query(None, description="Admin who created override"),
    service: RateLimitService = Depends(get_service),
) -> RateLimitOverride:
    """
    Create a rate limit override for an identifier.

    This allows setting a custom tier or limits for specific users/keys.
    """
    override = RateLimitOverride(
        identifier=identifier,
        tier=tier,
        expires_at=expires_at,
        reason=reason,
        created_by=created_by,
    )
    service.set_override(override)
    return override


@router.delete("/overrides/{identifier}")
async def delete_override(
    identifier: str,
    service: RateLimitService = Depends(get_service),
):
    """Remove a rate limit override."""
    success = service.remove_override(identifier)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"No override found for '{identifier}'",
        )
    return {
        "success": True,
        "identifier": identifier,
        "message": f"Override removed for {identifier}",
    }


# ─────────────────────────────────────────────────────────────
# Check (for testing)
# ─────────────────────────────────────────────────────────────


@router.post("/check")
async def check_rate_limit(
    identifier: str = Query(..., description="User ID or API key"),
    tier: str = Query(RateLimitTier.FREE.value, description="Rate limit tier"),
    endpoint: str | None = Query(None, description="Optional endpoint"),
    service: RateLimitService = Depends(get_service),
):
    """
    Check if a request would be allowed under rate limits.

    This is a test endpoint that doesn't count against limits.
    """
    # Create a copy of service to avoid counting this request
    result = await service.check_rate_limit(identifier, tier, endpoint)
    return {
        "allowed": result.allowed,
        "tier": result.tier,
        "minute": {
            "limit": result.minute_limit,
            "remaining": result.minute_remaining,
        },
        "hour": {
            "limit": result.hour_limit,
            "remaining": result.hour_remaining,
        },
        "reset_at": result.reset_at.isoformat(),
        "retry_after": result.retry_after,
    }
