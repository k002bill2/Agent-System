"""Anthropic OAuth usage API 연동과 응답 캐시.

`_usage_cache` 는 `global` 로 재바인딩되므로 `_load_usage_cache` ·
`_save_usage_cache` 와 반드시 같은 모듈에 있어야 한다 — 가르면 캐시
사본이 분열된다(ruff·mypy·테스트를 모두 통과한 채로).
"""

import asyncio
import json
import logging
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from services.claude_config_service import get_oauth_token as config_get_oauth_token

logger = logging.getLogger(__name__)


ANTHROPIC_USAGE_API = "https://api.anthropic.com/api/oauth/usage"


USAGE_CACHE_PATH = Path(
    os.getenv(
        "CLAUDE_USAGE_CACHE_PATH",
        str(Path.home() / ".claude" / "aos-usage-cache.json"),
    )
)


_usage_cache: dict[str, Any] = {
    "data": None,
    "timestamp": None,
    "expires_at": None,
}


CACHE_TTL_SECONDS = 300  # 5 minutes - cache is valid for this long


CACHE_STALE_SECONDS = 3600  # 1 hour - stale cache can still be used as fallback


USAGE_FETCH_MAX_ATTEMPTS = 3


USAGE_FETCH_TIMEOUT_SECONDS = 6.0  # per-attempt HTTP timeout


USAGE_FETCH_BACKOFF_SECONDS = (0.5, 1.0)  # backoff before retry #1, #2


def _load_usage_cache() -> dict[str, Any] | None:
    """Load usage cache from file."""
    global _usage_cache

    # Try memory cache first
    if _usage_cache["data"] is not None:
        return _usage_cache

    # Try file cache
    if USAGE_CACHE_PATH.exists():
        try:
            with open(USAGE_CACHE_PATH) as f:
                _usage_cache = json.load(f)
                return _usage_cache
        except (OSError, json.JSONDecodeError):
            pass
    return None


def _save_usage_cache(data: dict[str, Any]) -> None:
    """Save usage data to cache."""
    global _usage_cache
    now = datetime.now(UTC).isoformat()
    _usage_cache = {
        "data": data,
        "timestamp": now,
        "expires_at": (datetime.now(UTC) + timedelta(seconds=CACHE_TTL_SECONDS)).isoformat(),
    }
    # Save to file for persistence across restarts
    try:
        with open(USAGE_CACHE_PATH, "w") as f:
            json.dump(_usage_cache, f)
    except OSError:
        pass


def _is_cache_valid() -> bool:
    """Check if cache is still valid (not expired)."""
    cache = _load_usage_cache()
    if not cache or not cache.get("expires_at"):
        return False
    try:
        expires_at = datetime.fromisoformat(cache["expires_at"].replace("Z", "+00:00"))
        return datetime.now(UTC) < expires_at
    except (ValueError, TypeError):
        return False


def _is_cache_usable() -> bool:
    """Check if cache can be used as fallback (within stale period)."""
    cache = _load_usage_cache()
    if not cache or not cache.get("timestamp"):
        return False
    try:
        timestamp = datetime.fromisoformat(cache["timestamp"].replace("Z", "+00:00"))
        age = (datetime.now(UTC) - timestamp).total_seconds()
        return age < CACHE_STALE_SECONDS
    except (ValueError, TypeError):
        return False


def _get_cache_age_minutes() -> int | None:
    """Get cache age in minutes."""
    cache = _load_usage_cache()
    if not cache or not cache.get("timestamp"):
        return None
    try:
        timestamp = datetime.fromisoformat(cache["timestamp"].replace("Z", "+00:00"))
        age = (datetime.now(UTC) - timestamp).total_seconds()
        return int(age / 60)
    except (ValueError, TypeError):
        return None


def get_oauth_token() -> str | None:
    """
    Extract OAuth access token.

    Priority:
    1. aos-claude-config.json (dashboard-managed)
    2. CLAUDE_OAUTH_TOKEN env var (for deployment / non-macOS)
    3. macOS Keychain (local development)
    """
    return config_get_oauth_token()


async def fetch_usage_from_anthropic(token: str) -> dict[str, Any] | None:
    """
    Fetch usage data from Anthropic OAuth Usage API.

    Transient failures (network errors, timeouts, 5xx) are retried a bounded
    number of times with a short backoff so a single blip degrades to the
    cached fallback instead of a hard error. 4xx responses — notably
    ``429 rate_limit_error`` and ``401`` auth failures — are NOT retried and
    return ``None`` immediately so the caller can fall back to cached data.

    Returns API response or None if failed.
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "claude-code/2.0.31",
    }
    last_error = "unknown error"

    for attempt in range(USAGE_FETCH_MAX_ATTEMPTS):
        try:
            async with httpx.AsyncClient(timeout=USAGE_FETCH_TIMEOUT_SECONDS) as client:
                response = await client.get(ANTHROPIC_USAGE_API, headers=headers)
        except httpx.HTTPError as exc:
            # Network error / timeout — transient, worth retrying.
            last_error = f"{type(exc).__name__}: {exc}"
        else:
            if response.status_code == 200:
                try:
                    return response.json()
                except ValueError as exc:
                    logger.error("Anthropic usage API returned invalid JSON: %s", exc)
                    return None
            if response.status_code < 500:
                # 4xx (429 rate limit, 401 auth, ...) — retrying won't help.
                logger.warning(
                    "Anthropic usage API returned %s (not retrying): %s",
                    response.status_code,
                    response.text[:200],
                )
                return None
            # 5xx — transient server error, worth retrying.
            last_error = f"HTTP {response.status_code}: {response.text[:200]}"

        if attempt < USAGE_FETCH_MAX_ATTEMPTS - 1:
            await asyncio.sleep(USAGE_FETCH_BACKOFF_SECONDS[attempt])

    logger.error(
        "Anthropic usage API failed after %d attempts: %s",
        USAGE_FETCH_MAX_ATTEMPTS,
        last_error,
    )
    return None


def parse_reset_time(resets_at: str | None) -> tuple[float, float]:
    """
    Parse ISO timestamp to hours and minutes until reset.

    Returns (hours, minutes) tuple.
    """
    if not resets_at:
        return (0, 0)

    try:
        # Parse ISO timestamp (e.g., "2025-11-04T04:59:59Z")
        reset_time = datetime.fromisoformat(resets_at.replace("Z", "+00:00"))
        now = datetime.now(UTC)

        delta = reset_time - now
        if delta.total_seconds() <= 0:
            return (0, 0)

        total_seconds = delta.total_seconds()
        hours = total_seconds / 3600
        minutes = (total_seconds % 3600) / 60

        return (hours, minutes)

    except Exception:
        return (0, 0)


def calculate_weekly_tokens(daily_tokens: list[dict]) -> tuple[int, int, int]:
    """Calculate weekly token usage.

    Returns:
        Tuple of (total_tokens, sonnet_tokens, opus_tokens)
    """
    today = datetime.now().date()
    week_ago = today - timedelta(days=7)

    total = 0
    sonnet = 0
    opus = 0

    for entry in daily_tokens:
        entry_date = datetime.strptime(entry["date"], "%Y-%m-%d").date()
        if entry_date >= week_ago:
            tokens_by_model = entry.get("tokensByModel", {})
            for model, tokens in tokens_by_model.items():
                total += tokens
                if "sonnet" in model.lower():
                    sonnet += tokens
                elif "opus" in model.lower():
                    opus += tokens

    return total, sonnet, opus
