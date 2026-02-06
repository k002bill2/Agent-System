"""Rate limiting service using Redis sliding window algorithm."""

import time
from datetime import datetime, timedelta
from typing import Any

from models.rate_limit import (
    RATE_LIMIT_TIERS,
    RateLimitOverride,
    RateLimitResult,
    RateLimitStatus,
    RateLimitTier,
    TierConfig,
)


class RateLimitService:
    """
    Redis-based rate limiting service using sliding window algorithm.

    Features:
    - Sliding window rate limiting (more accurate than fixed window)
    - Multiple time windows (minute, hour, day)
    - Tier-based limits
    - Per-user/API key tracking
    - Graceful degradation when Redis unavailable
    """

    def __init__(self, redis_client: Any = None):
        """
        Initialize rate limit service.

        Args:
            redis_client: Redis async client (optional, falls back to in-memory)
        """
        self.redis = redis_client
        self._memory_store: dict[str, dict] = {}  # Fallback in-memory store
        self._overrides: dict[str, RateLimitOverride] = {}  # Custom overrides
        self._key_prefix = "ratelimit:"

    # ─────────────────────────────────────────────────────────────
    # Core Rate Limiting
    # ─────────────────────────────────────────────────────────────

    async def check_rate_limit(
        self,
        identifier: str,
        tier: str = RateLimitTier.FREE.value,
        endpoint: str | None = None,
    ) -> RateLimitResult:
        """
        Check if request is allowed under rate limits.

        Uses sliding window log algorithm for accurate rate limiting.

        Args:
            identifier: User ID or API key
            tier: Rate limit tier
            endpoint: Optional specific endpoint (for granular limits)

        Returns:
            RateLimitResult with allowed status and limits info
        """
        # Check for custom override
        override = self._overrides.get(identifier)
        if override:
            if override.expires_at and override.expires_at < datetime.utcnow():
                # Override expired, remove it
                del self._overrides[identifier]
            elif override.tier:
                tier = override.tier

        # Get tier config
        config = RATE_LIMIT_TIERS.get(tier, RATE_LIMIT_TIERS[RateLimitTier.FREE.value])

        # Enterprise tier has no limits
        if tier == RateLimitTier.ENTERPRISE.value:
            return RateLimitResult(
                allowed=True,
                tier=tier,
                limit=-1,
                remaining=-1,
                reset_at=datetime.utcnow(),
                minute_limit=-1,
                minute_remaining=-1,
                hour_limit=-1,
                hour_remaining=-1,
            )

        now = time.time()
        now_dt = datetime.utcnow()

        # Check all time windows
        minute_key = f"{self._key_prefix}{identifier}:minute"
        hour_key = f"{self._key_prefix}{identifier}:hour"

        if self.redis:
            result = await self._check_redis(
                identifier, config, minute_key, hour_key, now
            )
        else:
            result = await self._check_memory(
                identifier, config, minute_key, hour_key, now
            )

        # Calculate reset time and retry after
        if not result["allowed"]:
            if result["minute_remaining"] <= 0:
                reset_at = now_dt + timedelta(seconds=60 - (now % 60))
                retry_after = int(60 - (now % 60))
            else:
                reset_at = now_dt + timedelta(seconds=3600 - (now % 3600))
                retry_after = int(3600 - (now % 3600))
        else:
            reset_at = now_dt + timedelta(seconds=60 - (now % 60))
            retry_after = None

        return RateLimitResult(
            allowed=result["allowed"],
            tier=tier,
            limit=config.requests_per_minute,
            remaining=result["minute_remaining"],
            reset_at=reset_at,
            retry_after=retry_after,
            minute_limit=config.requests_per_minute,
            minute_remaining=result["minute_remaining"],
            hour_limit=config.requests_per_hour,
            hour_remaining=result["hour_remaining"],
        )

    async def _check_redis(
        self,
        identifier: str,
        config: TierConfig,
        minute_key: str,
        hour_key: str,
        now: float,
    ) -> dict:
        """Check rate limit using Redis sliding window."""
        pipe = self.redis.pipeline()

        # Get current minute window
        minute_start = int(now) - 60
        hour_start = int(now) - 3600

        # Remove old entries and count current
        pipe.zremrangebyscore(minute_key, 0, minute_start)
        pipe.zremrangebyscore(hour_key, 0, hour_start)
        pipe.zcard(minute_key)
        pipe.zcard(hour_key)

        results = await pipe.execute()
        minute_count = results[2]
        hour_count = results[3]

        # Check if allowed
        minute_allowed = minute_count < config.requests_per_minute
        hour_allowed = hour_count < config.requests_per_hour
        allowed = minute_allowed and hour_allowed

        if allowed:
            # Add this request to the windows
            request_id = f"{now}:{identifier}"
            pipe = self.redis.pipeline()
            pipe.zadd(minute_key, {request_id: now})
            pipe.zadd(hour_key, {request_id: now})
            pipe.expire(minute_key, 120)  # 2 minutes TTL
            pipe.expire(hour_key, 7200)  # 2 hours TTL
            await pipe.execute()

        return {
            "allowed": allowed,
            "minute_remaining": max(0, config.requests_per_minute - minute_count - (1 if allowed else 0)),
            "hour_remaining": max(0, config.requests_per_hour - hour_count - (1 if allowed else 0)),
        }

    async def _check_memory(
        self,
        identifier: str,
        config: TierConfig,
        minute_key: str,
        hour_key: str,
        now: float,
    ) -> dict:
        """Check rate limit using in-memory storage (fallback)."""
        # Initialize if needed
        if minute_key not in self._memory_store:
            self._memory_store[minute_key] = {"requests": []}
        if hour_key not in self._memory_store:
            self._memory_store[hour_key] = {"requests": []}

        # Clean old entries
        minute_start = now - 60
        hour_start = now - 3600

        self._memory_store[minute_key]["requests"] = [
            t for t in self._memory_store[minute_key]["requests"] if t > minute_start
        ]
        self._memory_store[hour_key]["requests"] = [
            t for t in self._memory_store[hour_key]["requests"] if t > hour_start
        ]

        minute_count = len(self._memory_store[minute_key]["requests"])
        hour_count = len(self._memory_store[hour_key]["requests"])

        # Check if allowed
        minute_allowed = minute_count < config.requests_per_minute
        hour_allowed = hour_count < config.requests_per_hour
        allowed = minute_allowed and hour_allowed

        if allowed:
            self._memory_store[minute_key]["requests"].append(now)
            self._memory_store[hour_key]["requests"].append(now)

        return {
            "allowed": allowed,
            "minute_remaining": max(0, config.requests_per_minute - minute_count - (1 if allowed else 0)),
            "hour_remaining": max(0, config.requests_per_hour - hour_count - (1 if allowed else 0)),
        }

    # ─────────────────────────────────────────────────────────────
    # Status & Management
    # ─────────────────────────────────────────────────────────────

    async def get_status(
        self,
        identifier: str,
        tier: str = RateLimitTier.FREE.value,
    ) -> RateLimitStatus:
        """Get current rate limit status for an identifier."""
        config = RATE_LIMIT_TIERS.get(tier, RATE_LIMIT_TIERS[RateLimitTier.FREE.value])
        now = time.time()
        now_dt = datetime.utcnow()

        minute_key = f"{self._key_prefix}{identifier}:minute"
        hour_key = f"{self._key_prefix}{identifier}:hour"

        if self.redis:
            minute_count = await self.redis.zcard(minute_key)
            hour_count = await self.redis.zcard(hour_key)
        else:
            minute_count = len(self._memory_store.get(minute_key, {}).get("requests", []))
            hour_count = len(self._memory_store.get(hour_key, {}).get("requests", []))

        return RateLimitStatus(
            identifier=identifier,
            tier=tier,
            minute_count=minute_count,
            hour_count=hour_count,
            day_count=0,  # Not tracked for simplicity
            minute_limit=config.requests_per_minute,
            hour_limit=config.requests_per_hour,
            day_limit=config.requests_per_day,
            minute_reset_at=now_dt + timedelta(seconds=60 - (now % 60)),
            hour_reset_at=now_dt + timedelta(seconds=3600 - (now % 3600)),
            minute_remaining=max(0, config.requests_per_minute - minute_count),
            hour_remaining=max(0, config.requests_per_hour - hour_count),
            day_remaining=0,
        )

    async def reset_limits(self, identifier: str) -> bool:
        """Reset rate limits for an identifier (admin operation)."""
        minute_key = f"{self._key_prefix}{identifier}:minute"
        hour_key = f"{self._key_prefix}{identifier}:hour"

        if self.redis:
            await self.redis.delete(minute_key, hour_key)
        else:
            self._memory_store.pop(minute_key, None)
            self._memory_store.pop(hour_key, None)

        return True

    # ─────────────────────────────────────────────────────────────
    # Overrides
    # ─────────────────────────────────────────────────────────────

    def set_override(self, override: RateLimitOverride) -> None:
        """Set a custom rate limit override for an identifier."""
        self._overrides[override.identifier] = override

    def remove_override(self, identifier: str) -> bool:
        """Remove a custom rate limit override."""
        if identifier in self._overrides:
            del self._overrides[identifier]
            return True
        return False

    def get_override(self, identifier: str) -> RateLimitOverride | None:
        """Get the current override for an identifier."""
        return self._overrides.get(identifier)

    def list_overrides(self) -> list[RateLimitOverride]:
        """List all active overrides."""
        now = datetime.utcnow()
        # Clean up expired overrides
        expired = [
            k for k, v in self._overrides.items()
            if v.expires_at and v.expires_at < now
        ]
        for k in expired:
            del self._overrides[k]
        return list(self._overrides.values())

    # ─────────────────────────────────────────────────────────────
    # Tier Management
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_tier_config(tier: str) -> TierConfig | None:
        """Get configuration for a tier."""
        return RATE_LIMIT_TIERS.get(tier)

    @staticmethod
    def list_tiers() -> dict[str, TierConfig]:
        """List all available tiers and their configurations."""
        return RATE_LIMIT_TIERS


# Global singleton instance
_rate_limit_service: RateLimitService | None = None


def get_rate_limit_service(redis_client: Any = None) -> RateLimitService:
    """Get or create the rate limit service singleton."""
    global _rate_limit_service
    if _rate_limit_service is None:
        _rate_limit_service = RateLimitService(redis_client)
    return _rate_limit_service
