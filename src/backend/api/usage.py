"""Claude Code usage API routes.

Fetches real usage data from Anthropic OAuth API using macOS Keychain credentials.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/usage", tags=["Usage"])

# Claude Code stats cache file path (configurable via env)
STATS_CACHE_PATH = Path(os.getenv(
    "CLAUDE_STATS_CACHE_PATH",
    str(Path.home() / ".claude" / "stats-cache.json"),
))

# Anthropic OAuth Usage API
ANTHROPIC_USAGE_API = "https://api.anthropic.com/api/oauth/usage"

# Cache for Anthropic API response (in-memory with file backup)
USAGE_CACHE_PATH = Path(os.getenv(
    "CLAUDE_USAGE_CACHE_PATH",
    str(Path.home() / ".claude" / "aos-usage-cache.json"),
))
_usage_cache: dict[str, Any] = {
    "data": None,
    "timestamp": None,
    "expires_at": None,
}
CACHE_TTL_SECONDS = 300  # 5 minutes - cache is valid for this long
CACHE_STALE_SECONDS = 3600  # 1 hour - stale cache can still be used as fallback


def _load_usage_cache() -> dict[str, Any] | None:
    """Load usage cache from file."""
    global _usage_cache

    # Try memory cache first
    if _usage_cache["data"] is not None:
        return _usage_cache

    # Try file cache
    if USAGE_CACHE_PATH.exists():
        try:
            with open(USAGE_CACHE_PATH, "r") as f:
                _usage_cache = json.load(f)
                return _usage_cache
        except (json.JSONDecodeError, IOError):
            pass
    return None


def _save_usage_cache(data: dict[str, Any]) -> None:
    """Save usage data to cache."""
    global _usage_cache
    now = datetime.now(timezone.utc).isoformat()
    _usage_cache = {
        "data": data,
        "timestamp": now,
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=CACHE_TTL_SECONDS)).isoformat(),
    }
    # Save to file for persistence across restarts
    try:
        with open(USAGE_CACHE_PATH, "w") as f:
            json.dump(_usage_cache, f)
    except IOError:
        pass


def _is_cache_valid() -> bool:
    """Check if cache is still valid (not expired)."""
    cache = _load_usage_cache()
    if not cache or not cache.get("expires_at"):
        return False
    try:
        expires_at = datetime.fromisoformat(cache["expires_at"].replace("Z", "+00:00"))
        return datetime.now(timezone.utc) < expires_at
    except (ValueError, TypeError):
        return False


def _is_cache_usable() -> bool:
    """Check if cache can be used as fallback (within stale period)."""
    cache = _load_usage_cache()
    if not cache or not cache.get("timestamp"):
        return False
    try:
        timestamp = datetime.fromisoformat(cache["timestamp"].replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - timestamp).total_seconds()
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
        age = (datetime.now(timezone.utc) - timestamp).total_seconds()
        return int(age / 60)
    except (ValueError, TypeError):
        return None


class DailyActivity(BaseModel):
    """Daily activity data."""
    date: str
    messageCount: int
    sessionCount: int
    toolCallCount: int


class DailyModelTokens(BaseModel):
    """Daily token usage by model."""
    date: str
    tokensByModel: dict[str, int]


class ModelUsage(BaseModel):
    """Model usage statistics."""
    inputTokens: int = 0
    outputTokens: int = 0
    cacheReadInputTokens: int = 0
    cacheCreationInputTokens: int = 0
    webSearchRequests: int = 0
    costUSD: float = 0


class PlanLimitInfo(BaseModel):
    """Plan limit information from Anthropic OAuth API."""
    name: str
    displayName: str
    utilization: float  # Percentage 0-100
    resetsAt: str | None = None
    resetsInHours: float | None = None
    resetsInMinutes: float | None = None


class UsageResponse(BaseModel):
    """Claude Code usage response."""
    # Raw stats
    lastComputedDate: str
    totalSessions: int
    totalMessages: int
    firstSessionDate: str | None = None

    # Weekly usage
    weeklyActivity: list[DailyActivity] = Field(default_factory=list)
    weeklyModelTokens: list[DailyModelTokens] = Field(default_factory=list)

    # Model usage totals
    modelUsage: dict[str, ModelUsage] = Field(default_factory=dict)

    # Plan limits from Anthropic API (real data)
    planLimits: list[PlanLimitInfo] = Field(default_factory=list)

    # OAuth status
    oauthAvailable: bool = False
    oauthError: str | None = None
    isCached: bool = False  # True if using cached data
    cacheAgeMinutes: int | None = None  # How old the cached data is

    # Computed stats (from local cache)
    weeklyTotalTokens: int = 0
    weeklySonnetTokens: int = 0
    weeklyOpusTokens: int = 0


def load_stats_cache() -> dict[str, Any] | None:
    """Load the Claude Code stats cache file."""
    if not STATS_CACHE_PATH.exists():
        return None

    try:
        with open(STATS_CACHE_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading stats cache: {e}")
        return None


def get_oauth_token() -> str | None:
    """
    Extract OAuth access token.

    Priority:
    1. CLAUDE_OAUTH_TOKEN env var (for deployment / non-macOS)
    2. macOS Keychain (local development)
    """
    # 1. Environment variable (works on any platform)
    env_token = os.getenv("CLAUDE_OAUTH_TOKEN")
    if env_token:
        return env_token

    # 2. macOS Keychain fallback (local dev only)
    if sys.platform != "darwin":
        return None

    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0:
            return None

        # Parse JSON credentials
        creds_json = result.stdout.strip()
        if not creds_json:
            return None

        creds = json.loads(creds_json)

        # Get access token from claudeAiOauth
        claude_oauth = creds.get("claudeAiOauth", {})
        return claude_oauth.get("accessToken")

    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
        print(f"Error extracting OAuth token: {e}")
        return None


async def fetch_usage_from_anthropic(token: str) -> dict[str, Any] | None:
    """
    Fetch usage data from Anthropic OAuth Usage API.

    Returns API response or None if failed.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                ANTHROPIC_USAGE_API,
                headers={
                    "Authorization": f"Bearer {token}",
                    "anthropic-beta": "oauth-2025-04-20",
                    "User-Agent": "claude-code/2.0.31",
                },
            )

            if response.status_code == 200:
                return response.json()
            else:
                print(f"Anthropic API error: {response.status_code} - {response.text}")
                return None

    except Exception as e:
        print(f"Error fetching from Anthropic API: {e}")
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
        now = datetime.now(timezone.utc)

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


@router.get("", response_model=UsageResponse)
async def get_usage() -> UsageResponse:
    """
    Get Claude Code usage statistics.

    Fetches real plan limits from Anthropic OAuth API (requires macOS Keychain).
    Falls back to local stats-cache.json for token usage history.
    """
    stats = load_stats_cache()

    if not stats:
        raise HTTPException(
            status_code=404,
            detail="Stats cache not found. Make sure Claude Code is installed and has been used."
        )

    # Get raw data from local cache
    daily_activity = stats.get("dailyActivity", [])
    daily_model_tokens = stats.get("dailyModelTokens", [])
    model_usage = stats.get("modelUsage", {})

    # Calculate weekly tokens
    weekly_total, weekly_sonnet, weekly_opus = calculate_weekly_tokens(daily_model_tokens)

    # Get last 7 days of activity
    today = datetime.now().date()
    week_ago = today - timedelta(days=7)

    weekly_activity = [
        DailyActivity(**entry)
        for entry in daily_activity
        if datetime.strptime(entry["date"], "%Y-%m-%d").date() >= week_ago
    ]

    weekly_model_tokens = [
        DailyModelTokens(**entry)
        for entry in daily_model_tokens
        if datetime.strptime(entry["date"], "%Y-%m-%d").date() >= week_ago
    ]

    # Build model usage response
    model_usage_response = {
        model: ModelUsage(
            inputTokens=data.get("inputTokens", 0),
            outputTokens=data.get("outputTokens", 0),
            cacheReadInputTokens=data.get("cacheReadInputTokens", 0),
            cacheCreationInputTokens=data.get("cacheCreationInputTokens", 0),
            webSearchRequests=data.get("webSearchRequests", 0),
            costUSD=data.get("costUSD", 0),
        )
        for model, data in model_usage.items()
    }

    # Fetch real plan limits from Anthropic OAuth API (with caching)
    plan_limits: list[PlanLimitInfo] = []
    oauth_available = False
    oauth_error: str | None = None
    is_cached = False
    cache_age_minutes: int | None = None

    def parse_usage_data(usage_data: dict[str, Any]) -> list[PlanLimitInfo]:
        """Parse Anthropic API response into plan limits."""
        limits = []
        limit_mapping = {
            "five_hour": ("fiveHour", "Current session"),
            "seven_day": ("sevenDay", "All models"),
            "seven_day_sonnet": ("sevenDaySonnet", "Sonnet only"),
            "seven_day_opus": ("sevenDayOpus", "Opus only"),
        }

        for api_key, (name, display_name) in limit_mapping.items():
            if api_key in usage_data:
                limit_data = usage_data[api_key]
                if limit_data is None:
                    continue

                resets_at = limit_data.get("resets_at")
                hours, minutes = parse_reset_time(resets_at)

                limits.append(PlanLimitInfo(
                    name=name,
                    displayName=display_name,
                    utilization=limit_data.get("utilization", 0),
                    resetsAt=resets_at,
                    resetsInHours=hours,
                    resetsInMinutes=minutes,
                ))
        return limits

    token = get_oauth_token()
    if token:
        # Try to fetch fresh data from Anthropic API
        usage_data = await fetch_usage_from_anthropic(token)

        if usage_data:
            # Success - save to cache and use fresh data
            oauth_available = True
            plan_limits = parse_usage_data(usage_data)
            _save_usage_cache(usage_data)
        else:
            # API failed - try to use cached data as fallback
            if _is_cache_usable():
                cache = _load_usage_cache()
                if cache and cache.get("data"):
                    oauth_available = True
                    is_cached = True
                    cache_age_minutes = _get_cache_age_minutes()
                    plan_limits = parse_usage_data(cache["data"])
                    oauth_error = f"Using cached data ({cache_age_minutes}m ago)"
            else:
                oauth_error = "Failed to fetch from Anthropic API"
    else:
        if os.getenv("CLAUDE_OAUTH_TOKEN"):
            oauth_error = "OAuth token from env var is invalid"
        elif sys.platform != "darwin":
            oauth_error = "Set CLAUDE_OAUTH_TOKEN env var for non-macOS"
        else:
            oauth_error = "OAuth token not found in Keychain"

    return UsageResponse(
        lastComputedDate=stats.get("lastComputedDate", ""),
        totalSessions=stats.get("totalSessions", 0),
        totalMessages=stats.get("totalMessages", 0),
        firstSessionDate=stats.get("firstSessionDate"),
        weeklyActivity=weekly_activity,
        weeklyModelTokens=weekly_model_tokens,
        modelUsage=model_usage_response,
        planLimits=plan_limits,
        oauthAvailable=oauth_available,
        oauthError=oauth_error,
        isCached=is_cached,
        cacheAgeMinutes=cache_age_minutes,
        weeklyTotalTokens=weekly_total,
        weeklySonnetTokens=weekly_sonnet,
        weeklyOpusTokens=weekly_opus,
    )


@router.get("/raw")
async def get_raw_stats() -> dict[str, Any]:
    """
    Get raw Claude Code stats cache.

    Returns the complete stats-cache.json content for debugging.
    """
    stats = load_stats_cache()

    if not stats:
        raise HTTPException(
            status_code=404,
            detail="Stats cache not found."
        )

    return stats


@router.get("/oauth-test")
async def test_oauth() -> dict[str, Any]:
    """
    Test OAuth token extraction and API access.

    Returns diagnostic information about OAuth status.
    """
    result = {
        "platform": sys.platform,
        "tokenFound": False,
        "tokenPrefix": None,
        "apiResponse": None,
        "error": None,
    }

    if sys.platform != "darwin":
        result["error"] = "OAuth only available on macOS"
        return result

    token = get_oauth_token()
    if not token:
        result["error"] = "Token not found in Keychain"
        return result

    result["tokenFound"] = True
    result["tokenPrefix"] = token[:20] + "..." if len(token) > 20 else token

    usage_data = await fetch_usage_from_anthropic(token)
    if usage_data:
        result["apiResponse"] = usage_data
    else:
        result["error"] = "API call failed"

    return result
