"""Rate limiting models."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RateLimitTier(str, Enum):
    """Rate limit tier levels."""

    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class TierConfig(BaseModel):
    """Configuration for a rate limit tier."""

    name: str
    requests_per_minute: int  # -1 for unlimited
    requests_per_hour: int  # -1 for unlimited
    requests_per_day: int = -1  # -1 for unlimited
    burst_limit: int = 10  # Max requests in burst
    description: str = ""


# Tier configurations
RATE_LIMIT_TIERS: dict[str, TierConfig] = {
    RateLimitTier.FREE.value: TierConfig(
        name="Free",
        requests_per_minute=60,
        requests_per_hour=1000,
        requests_per_day=5000,
        burst_limit=10,
        description="Basic access for individual developers",
    ),
    RateLimitTier.STARTER.value: TierConfig(
        name="Starter",
        requests_per_minute=120,
        requests_per_hour=5000,
        requests_per_day=25000,
        burst_limit=20,
        description="For small teams and startups",
    ),
    RateLimitTier.PROFESSIONAL.value: TierConfig(
        name="Professional",
        requests_per_minute=300,
        requests_per_hour=20000,
        requests_per_day=100000,
        burst_limit=50,
        description="For growing businesses",
    ),
    RateLimitTier.ENTERPRISE.value: TierConfig(
        name="Enterprise",
        requests_per_minute=-1,
        requests_per_hour=-1,
        requests_per_day=-1,
        burst_limit=-1,
        description="Unlimited access for enterprise customers",
    ),
}


class RateLimitResult(BaseModel):
    """Result of a rate limit check."""

    allowed: bool
    tier: str
    limit: int
    remaining: int
    reset_at: datetime
    retry_after: int | None = None  # Seconds until next allowed request

    # Detailed breakdown
    minute_limit: int = 0
    minute_remaining: int = 0
    hour_limit: int = 0
    hour_remaining: int = 0


class RateLimitStatus(BaseModel):
    """Current rate limit status for a user/key."""

    identifier: str  # user_id or api_key
    tier: str

    # Current usage
    minute_count: int = 0
    hour_count: int = 0
    day_count: int = 0

    # Limits
    minute_limit: int = 0
    hour_limit: int = 0
    day_limit: int = 0

    # Reset times
    minute_reset_at: datetime | None = None
    hour_reset_at: datetime | None = None
    day_reset_at: datetime | None = None

    # Remaining
    minute_remaining: int = 0
    hour_remaining: int = 0
    day_remaining: int = 0


class RateLimitOverride(BaseModel):
    """Custom rate limit override for specific users/keys."""

    identifier: str  # user_id or api_key
    tier: str | None = None  # Override tier
    custom_limits: dict[str, int] | None = None  # Custom limits
    expires_at: datetime | None = None  # Temporary override
    reason: str | None = None
    created_by: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
