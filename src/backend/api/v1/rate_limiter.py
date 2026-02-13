"""Sliding window rate limiter with in-memory storage.

Provides per-client rate limiting using a sliding window algorithm.
Different tiers: anonymous (10/min), authenticated (100/min), admin (unlimited).

Algorithm:
    Uses a sliding window log approach where each request timestamp is
    recorded. On each check, expired timestamps outside the window are
    pruned, and the count of remaining timestamps determines whether
    the request is allowed.

Memory management:
    Periodic cleanup runs every 100 requests to remove stale entries
    and prevent unbounded memory growth.
"""

import logging
import time
from collections import defaultdict
from enum import Enum
from typing import Any

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)


class RateLimitTier(str, Enum):
    """Rate limit tiers for different user types.

    Tiers:
        ANONYMOUS: Unauthenticated users (10 requests/minute).
        AUTHENTICATED: Logged-in users (100 requests/minute).
        ADMIN: Admin users (unlimited).
    """

    ANONYMOUS = "anonymous"
    AUTHENTICATED = "authenticated"
    ADMIN = "admin"


# Rate limit configurations: (max_requests, window_seconds)
# max_requests=0 means unlimited
RATE_LIMIT_CONFIG: dict[RateLimitTier, tuple[int, int]] = {
    RateLimitTier.ANONYMOUS: (10, 60),
    RateLimitTier.AUTHENTICATED: (100, 60),
    RateLimitTier.ADMIN: (0, 0),  # 0 means unlimited
}


class SlidingWindowCounter:
    """Sliding window rate limiter using in-memory storage.

    Tracks request timestamps per client key and enforces rate limits
    using a sliding window algorithm. This provides more accurate rate
    limiting than fixed-window approaches by avoiding the boundary
    burst problem.

    Attributes:
        _windows: Per-key list of request timestamps.
        _cleanup_counter: Counter for triggering periodic cleanup.
        _cleanup_interval: Number of requests between cleanup runs.
    """

    def __init__(self) -> None:
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._cleanup_counter: int = 0
        self._cleanup_interval: int = 100

    def _cleanup_expired(self, key: str, window_seconds: int) -> None:
        """Remove expired timestamps from the window for a specific key."""
        now = time.monotonic()
        cutoff = now - window_seconds
        self._windows[key] = [ts for ts in self._windows[key] if ts > cutoff]

    def _periodic_cleanup(self) -> None:
        """Periodically clean up all expired entries to prevent memory leaks.

        Runs every _cleanup_interval requests. Removes timestamps outside
        the maximum window and deletes empty key entries.
        """
        self._cleanup_counter += 1
        if self._cleanup_counter >= self._cleanup_interval:
            self._cleanup_counter = 0
            now = time.monotonic()
            max_window = max(cfg[1] for cfg in RATE_LIMIT_CONFIG.values() if cfg[1] > 0)
            keys_to_delete: list[str] = []
            for key, timestamps in self._windows.items():
                self._windows[key] = [ts for ts in timestamps if ts > now - max_window]
                if not self._windows[key]:
                    keys_to_delete.append(key)
            for key in keys_to_delete:
                del self._windows[key]

    def is_rate_limited(
        self, key: str, max_requests: int, window_seconds: int
    ) -> tuple[bool, dict[str, Any]]:
        """Check if a request should be rate limited.

        Args:
            key: Unique client identifier (IP or user ID).
            max_requests: Maximum allowed requests in the window.
            window_seconds: Size of the sliding window in seconds.

        Returns:
            Tuple of (is_limited, rate_limit_info) where rate_limit_info
            contains remaining count, limit, and reset time.
        """
        if max_requests <= 0:
            return False, {
                "rate_limit_remaining": -1,
                "rate_limit_limit": -1,
                "rate_limit_reset": 0,
            }

        self._periodic_cleanup()
        self._cleanup_expired(key, window_seconds)

        now = time.monotonic()
        current_count = len(self._windows[key])

        if current_count >= max_requests:
            # Find when the oldest request in the window will expire
            oldest = min(self._windows[key]) if self._windows[key] else now
            reset_after = int(oldest + window_seconds - now) + 1
            return True, {
                "rate_limit_remaining": 0,
                "rate_limit_limit": max_requests,
                "rate_limit_reset": reset_after,
            }

        # Record this request
        self._windows[key].append(now)

        return False, {
            "rate_limit_remaining": max_requests - current_count - 1,
            "rate_limit_limit": max_requests,
            "rate_limit_reset": window_seconds,
        }

    def get_usage(self, key: str, window_seconds: int) -> int:
        """Get current request count for a key within the window.

        Args:
            key: Client identifier to check.
            window_seconds: Window size to count within.

        Returns:
            Number of requests in the current window.
        """
        self._cleanup_expired(key, window_seconds)
        return len(self._windows[key])

    def reset(self, key: str | None = None) -> None:
        """Reset rate limit counters.

        Args:
            key: Specific key to reset. If None, resets all keys.
        """
        if key is None:
            self._windows.clear()
        elif key in self._windows:
            del self._windows[key]

    @property
    def active_keys(self) -> int:
        """Number of active client keys being tracked."""
        return len(self._windows)


# Global rate limiter instance
_rate_limiter: SlidingWindowCounter | None = None


def get_rate_limiter() -> SlidingWindowCounter:
    """Get the global rate limiter instance (lazily created)."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = SlidingWindowCounter()
    return _rate_limiter


def _get_client_key(request: Request, user_id: str | None = None) -> str:
    """Generate a unique client key from request info.

    Authenticated users are keyed by user ID, anonymous users by IP.
    Supports X-Forwarded-For for clients behind reverse proxies.

    Args:
        request: The FastAPI request object.
        user_id: Optional user ID for authenticated users.

    Returns:
        A string key like "user:usr_001" or "ip:192.168.1.1".
    """
    if user_id:
        return f"user:{user_id}"
    # Use X-Forwarded-For if behind a proxy, otherwise client host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"


def build_rate_limit_headers(info: dict[str, Any]) -> dict[str, str]:
    """Build standard rate limit response headers.

    Follows the IETF RateLimit header field draft standard.

    Args:
        info: Rate limit info dict from SlidingWindowCounter.

    Returns:
        Dict of header name to header value.
    """
    return {
        "X-RateLimit-Limit": str(info["rate_limit_limit"]),
        "X-RateLimit-Remaining": str(info["rate_limit_remaining"]),
        "X-RateLimit-Reset": str(info["rate_limit_reset"]),
    }


async def check_rate_limit(
    request: Request,
    tier: RateLimitTier = RateLimitTier.ANONYMOUS,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Check rate limit for a request and raise HTTPException if exceeded.

    Admin tier bypasses all rate limiting. Other tiers are checked
    against the sliding window counter.

    Args:
        request: The FastAPI request object.
        tier: The rate limit tier to apply.
        user_id: Optional user ID for authenticated users.

    Returns:
        Rate limit info dict with remaining, limit, and reset values.

    Raises:
        HTTPException: 429 Too Many Requests if rate limit exceeded.
    """
    if tier == RateLimitTier.ADMIN:
        return {
            "rate_limit_remaining": -1,
            "rate_limit_limit": -1,
            "rate_limit_reset": 0,
        }

    limiter = get_rate_limiter()
    max_requests, window_seconds = RATE_LIMIT_CONFIG[tier]
    client_key = _get_client_key(request, user_id)

    is_limited, info = limiter.is_rate_limited(client_key, max_requests, window_seconds)

    if is_limited:
        logger.warning("Rate limit exceeded for %s (tier=%s)", client_key, tier.value)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate limit exceeded",
                "retry_after_seconds": info["rate_limit_reset"],
                "limit": info["rate_limit_limit"],
            },
            headers={
                "Retry-After": str(info["rate_limit_reset"]),
                **build_rate_limit_headers(info),
            },
        )

    return info
