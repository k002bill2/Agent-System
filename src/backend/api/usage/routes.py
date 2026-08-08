"""Usage API 라우트 7개.

원본 선언 순서를 한 모듈에 그대로 유지한다 — `include_router` 조립을
피해 라우트 등록 순서가 완전히 보존된다.

`_codex_plan_cache` 와 `_cached_codex_plan_response` 가 여기 있는 것은
설계다. 테스트가 그 dict 를 통째로 갈아끼우므로(재바인딩), 읽는 쪽이
`get_codex_plan_usage` 와 갈리면 한쪽이 옛 dict 를 계속 본다.
"""

import logging
import os
import sqlite3
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from services.claude_config_service import get_claude_config, update_claude_config

from .anthropic import (
    _get_cache_age_minutes,
    _is_cache_usable,
    _is_cache_valid,
    _load_usage_cache,
    _save_usage_cache,
    calculate_weekly_tokens,
    fetch_usage_from_anthropic,
    get_oauth_token,
    parse_reset_time,
)
from .codex import (
    CODEX_STATE_DB_PATH,
    _codex_usage_by_model,
    _codex_usage_by_source,
    _codex_usage_totals,
    _parse_codex_rate_limits_response,
    _read_codex_app_server_rate_limits,
)
from .jsonl import aggregate_model_tokens_from_jsonl, load_stats_cache
from .models import (
    ClaudeConfigUpdate,
    CodexCliUsageResponse,
    CodexPlanUsageResponse,
    DailyActivity,
    DailyModelTokens,
    ModelUsage,
    PlanLimitInfo,
    UsageResponse,
)

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/usage", tags=["Usage"])


CODEX_PLAN_CACHE_TTL_SECONDS = int(os.getenv("CODEX_PLAN_CACHE_TTL_SECONDS", "5"))


_codex_plan_cache: dict[str, Any] = {
    "response": None,
    "timestamp": None,
}


def _cached_codex_plan_response() -> CodexPlanUsageResponse | None:
    """Return a fresh cached Codex plan response if available."""
    response = _codex_plan_cache.get("response")
    timestamp = _codex_plan_cache.get("timestamp")
    if not isinstance(response, CodexPlanUsageResponse) or not isinstance(timestamp, datetime):
        return None

    age_seconds = int((datetime.now(UTC) - timestamp).total_seconds())
    if age_seconds > CODEX_PLAN_CACHE_TTL_SECONDS:
        return None

    return response.model_copy(update={"isCached": True, "cacheAgeSeconds": max(age_seconds, 0)})


@router.get("", response_model=UsageResponse)
async def get_usage(
    refresh: Annotated[
        bool,
        Query(
            description="Bypass the short-lived server cache and fetch fresh limits from Anthropic.",
        ),
    ] = False,
) -> UsageResponse:
    """
    Get Claude Code usage statistics.

    Fetches real plan limits from Anthropic OAuth API (requires macOS Keychain).
    Falls back to local stats-cache.json for token usage history.
    """
    stats = load_stats_cache()

    if not stats:
        raise HTTPException(
            status_code=404,
            detail="Stats cache not found. Make sure Claude Code is installed and has been used.",
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
    weekly_model_tokens_source = "stats-cache" if weekly_model_tokens else "empty"

    # stats-cache.json is a Claude Code internal cache that recent CLI versions
    # have stopped refreshing. Fall back to scanning the live session JSONL
    # files so the chart keeps working when the cache goes stale.
    if not weekly_model_tokens:
        weekly_model_tokens = aggregate_model_tokens_from_jsonl(days=7)
        if weekly_model_tokens:
            weekly_model_tokens_source = "jsonl-fallback"
            weekly_total, weekly_sonnet, weekly_opus = calculate_weekly_tokens(
                [entry.model_dump() for entry in weekly_model_tokens]
            )

    # Compute how many days behind today the stats-cache reports — useful for
    # surfacing "the upstream cache stopped updating" to the UI.
    stats_cache_age_days: int | None = None
    last_computed_raw = stats.get("lastComputedDate")
    if last_computed_raw:
        try:
            last_computed = datetime.strptime(last_computed_raw, "%Y-%m-%d").date()
            stats_cache_age_days = max((today - last_computed).days, 0)
        except ValueError:
            stats_cache_age_days = None

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

                limits.append(
                    PlanLimitInfo(
                        name=name,
                        displayName=display_name,
                        utilization=limit_data.get("utilization", 0),
                        resetsAt=resets_at,
                        resetsInHours=hours,
                        resetsInMinutes=minutes,
                    )
                )
        return limits

    token = get_oauth_token()
    if token:
        # Serve the short-lived cache (5 min TTL) without hitting Anthropic's
        # OAuth usage endpoint. That endpoint is aggressively rate-limited
        # (429 rate_limit_error) when polled on every request, which forced a
        # stale-cache fallback and made the dashboard look "not real-time".
        # Fresh cache is treated as live (isCached stays False - no warning).
        cached_fresh = None
        if not refresh and _is_cache_valid():
            cache = _load_usage_cache()
            if cache and cache.get("data"):
                cached_fresh = cache["data"]

        if cached_fresh is not None:
            oauth_available = True
            plan_limits = parse_usage_data(cached_fresh)
        else:
            # Cache expired (or manual refresh) - fetch fresh data from Anthropic
            usage_data = await fetch_usage_from_anthropic(token)

            if usage_data:
                # Success - save to cache and use fresh data
                oauth_available = True
                plan_limits = parse_usage_data(usage_data)
                _save_usage_cache(usage_data)
            # API failed - try to use cached data as fallback
            elif _is_cache_usable():
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
        weeklyModelTokensSource=weekly_model_tokens_source,
        statsCacheAgeDays=stats_cache_age_days,
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


@router.get("/codex-cli", response_model=CodexCliUsageResponse)
def get_codex_cli_usage() -> CodexCliUsageResponse:
    """Get local Codex CLI/Desktop token usage from Codex thread state."""
    db_path = CODEX_STATE_DB_PATH.expanduser().resolve()
    if not db_path.exists():
        return CodexCliUsageResponse(
            available=False,
            source="codex-state-db",
            message="Codex state DB not found. Run Codex CLI/Desktop with ChatGPT login first.",
        )

    now_ts = int(datetime.now(UTC).timestamp())
    five_hour_cutoff = now_ts - (5 * 60 * 60)
    weekly_cutoff = now_ts - (7 * 24 * 60 * 60)

    try:
        with sqlite3.connect(f"{db_path.as_uri()}?mode=ro", uri=True) as conn:
            five_hour_threads, five_hour_tokens, _ = _codex_usage_totals(conn, five_hour_cutoff)
            weekly_threads, weekly_tokens, _ = _codex_usage_totals(conn, weekly_cutoff)
            total_threads, total_tokens, latest_updated_at = _codex_usage_totals(conn)
            updated_at = (
                datetime.fromtimestamp(latest_updated_at, UTC).isoformat()
                if latest_updated_at
                else None
            )

            return CodexCliUsageResponse(
                available=True,
                fiveHourTokens=five_hour_tokens,
                fiveHourThreads=five_hour_threads,
                weeklyTokens=weekly_tokens,
                weeklyThreads=weekly_threads,
                totalTokens=total_tokens,
                totalThreads=total_threads,
                byModel=_codex_usage_by_model(conn),
                bySource=_codex_usage_by_source(conn),
                updatedAt=updated_at,
            )
    except sqlite3.Error as exc:
        logger.warning("Failed to read Codex state DB", exc_info=True)
        return CodexCliUsageResponse(
            available=False,
            source="codex-state-db",
            message=f"Codex state DB could not be read ({exc.__class__.__name__}).",
        )


@router.get("/codex-plan", response_model=CodexPlanUsageResponse)
def get_codex_plan_usage(
    refresh: Annotated[
        bool,
        Query(
            description="Bypass the short-lived app-server cache and read fresh limits.",
        ),
    ] = False,
) -> CodexPlanUsageResponse:
    """Get ChatGPT subscription Codex remaining plan limits from Codex app-server."""
    if not refresh:
        cached = _cached_codex_plan_response()
        if cached:
            return cached

    try:
        raw_response = _read_codex_app_server_rate_limits()
        response = _parse_codex_rate_limits_response(raw_response)
        if response.available:
            _codex_plan_cache["response"] = response
            _codex_plan_cache["timestamp"] = datetime.now(UTC)
        return response
    except FileNotFoundError:
        return CodexPlanUsageResponse(
            available=False,
            message="Codex CLI binary was not found. Install Codex and sign in with ChatGPT.",
        )
    except subprocess.TimeoutExpired:
        stale_response = _codex_plan_cache.get("response")
        if isinstance(stale_response, CodexPlanUsageResponse):
            return stale_response.model_copy(
                update={
                    "isCached": True,
                    "message": "Using cached Codex plan data after app-server timeout.",
                }
            )
        return CodexPlanUsageResponse(
            available=False,
            message="Codex app-server timed out while reading ChatGPT plan limits.",
        )
    except Exception as exc:
        logger.warning("Failed to read Codex app-server rate limits", exc_info=True)
        stale_response = _codex_plan_cache.get("response")
        if isinstance(stale_response, CodexPlanUsageResponse):
            return stale_response.model_copy(
                update={
                    "isCached": True,
                    "message": "Using cached Codex plan data after app-server error.",
                }
            )
        return CodexPlanUsageResponse(
            available=False,
            message=f"Codex plan limits unavailable ({exc.__class__.__name__}).",
        )


@router.get("/raw")
async def get_raw_stats() -> dict[str, Any]:
    """
    Get raw Claude Code stats cache.

    Returns the complete stats-cache.json content for debugging.
    """
    stats = load_stats_cache()

    if not stats:
        raise HTTPException(status_code=404, detail="Stats cache not found.")

    return stats


@router.get("/oauth-test")
async def test_oauth() -> dict[str, Any]:
    """
    Test OAuth token extraction and API access.

    Returns diagnostic information about OAuth status.
    """
    result: dict[str, Any] = {
        "platform": sys.platform,
        "tokenFound": False,
        "tokenPrefix": None,
        "tokenSource": None,
        "apiResponse": None,
        "error": None,
    }

    token = get_oauth_token()
    if not token:
        result["error"] = "Token not found (check config, env, or Keychain)"
        return result

    config = get_claude_config()
    result["tokenFound"] = True
    result["tokenPrefix"] = token[:20] + "..." if len(token) > 20 else token
    result["tokenSource"] = config.get("token_source", "unknown")

    usage_data = await fetch_usage_from_anthropic(token)
    if usage_data:
        result["apiResponse"] = usage_data
    else:
        result["error"] = "API call failed"

    return result


@router.get("/claude-config")
async def get_config() -> dict[str, Any]:
    """Get current Claude Code configuration (tokens masked)."""
    return get_claude_config()


@router.put("/claude-config")
async def put_config(body: ClaudeConfigUpdate) -> dict[str, Any]:
    """Update Claude Code configuration."""
    return update_claude_config(
        oauth_token=body.oauth_token,
        stats_cache_path=body.stats_cache_path,
        usage_cache_path=body.usage_cache_path,
    )
