"""Claude Code usage API routes.

Fetches real usage data from Anthropic OAuth API using macOS Keychain credentials.
"""

import json
import logging
import os
import select
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.claude_config_service import (
    get_claude_config,
    update_claude_config,
)
from services.claude_config_service import (
    get_oauth_token as config_get_oauth_token,
)

router = APIRouter(prefix="/usage", tags=["Usage"])

logger = logging.getLogger(__name__)

# Claude Code stats cache file path (configurable via env)
STATS_CACHE_PATH = Path(
    os.getenv(
        "CLAUDE_STATS_CACHE_PATH",
        str(Path.home() / ".claude" / "stats-cache.json"),
    )
)

# Claude Code session JSONL directory — fallback source when stats-cache is stale.
CLAUDE_PROJECTS_DIR = Path(
    os.getenv(
        "CLAUDE_PROJECTS_DIR",
        str(Path.home() / ".claude" / "projects"),
    )
)

# Aggregated JSONL token cache (avoids re-scanning hundreds of MB on every request)
JSONL_TOKEN_CACHE_PATH = Path(
    os.getenv(
        "CLAUDE_JSONL_TOKEN_CACHE_PATH",
        str(Path.home() / ".claude" / "aos-jsonl-token-cache.json"),
    )
)
JSONL_TOKEN_CACHE_TTL_SECONDS = 300  # 5 minutes

# Codex desktop/CLI local thread state. This stores local token accounting, not
# the ChatGPT account plan-limit percentages shown in the Codex app menu.
CODEX_STATE_DB_PATH = Path(
    os.getenv(
        "CODEX_STATE_DB_PATH",
        str(Path.home() / ".codex" / "state_5.sqlite"),
    )
)

# Codex app-server exposes the ChatGPT account plan-limit snapshot used by the
# Codex desktop menu. This is different from the local state DB token counters.
CODEX_APP_SERVER_BIN = os.getenv("CODEX_APP_SERVER_BIN", "codex")
CODEX_APP_SERVER_TIMEOUT_SECONDS = float(os.getenv("CODEX_APP_SERVER_TIMEOUT_SECONDS", "8"))
CODEX_PLAN_CACHE_TTL_SECONDS = int(os.getenv("CODEX_PLAN_CACHE_TTL_SECONDS", "5"))
_codex_plan_cache: dict[str, Any] = {
    "response": None,
    "timestamp": None,
}

# Anthropic OAuth Usage API
ANTHROPIC_USAGE_API = "https://api.anthropic.com/api/oauth/usage"

# Cache for Anthropic API response (in-memory with file backup)
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
    # "stats-cache" when filled from Claude Code's internal cache,
    # "jsonl-fallback" when reconstructed from session JSONL files,
    # "empty" when no data was found anywhere.
    weeklyModelTokensSource: str = "stats-cache"
    # How many days old the underlying stats-cache.json data is, if any.
    statsCacheAgeDays: int | None = None

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


class CodexUsageBreakdown(BaseModel):
    """Codex local usage grouped by a label."""

    name: str
    tokens: int = 0
    threads: int = 0


class CodexCliUsageResponse(BaseModel):
    """Local Codex CLI usage reconstructed from Codex state DB."""

    available: bool
    source: str = "codex-state-db"
    fiveHourTokens: int = 0
    fiveHourThreads: int = 0
    weeklyTokens: int = 0
    weeklyThreads: int = 0
    totalTokens: int = 0
    totalThreads: int = 0
    byModel: list[CodexUsageBreakdown] = Field(default_factory=list)
    bySource: list[CodexUsageBreakdown] = Field(default_factory=list)
    updatedAt: str | None = None
    limitStatus: str = "not_exposed"
    message: str | None = (
        "Codex CLI exposes local token usage here; account remaining plan "
        "percentages are not present in the local state DB."
    )


class CodexPlanWindow(BaseModel):
    """A Codex ChatGPT subscription rate-limit window."""

    usedPercent: float = 0
    remainingPercent: float = 100
    windowDurationMins: int | None = None
    resetsAt: int | None = None
    resetsAtIso: str | None = None
    resetsInMinutes: float | None = None


class CodexPlanLimitSnapshot(BaseModel):
    """Codex ChatGPT subscription limit snapshot."""

    limitId: str | None = None
    limitName: str | None = None
    primary: CodexPlanWindow | None = None
    secondary: CodexPlanWindow | None = None
    credits: dict[str, Any] | None = None
    individualLimit: dict[str, Any] | None = None
    planType: str | None = None
    rateLimitReachedType: str | None = None


class CodexPlanUsageResponse(BaseModel):
    """ChatGPT subscription Codex plan usage from Codex app-server."""

    available: bool
    source: str = "codex-app-server"
    codexLimit: CodexPlanLimitSnapshot | None = None
    limitsById: dict[str, CodexPlanLimitSnapshot] = Field(default_factory=dict)
    rateLimitResetCredits: dict[str, Any] | None = None
    updatedAt: str | None = None
    isCached: bool = False
    cacheAgeSeconds: int | None = None
    message: str | None = None


def load_stats_cache() -> dict[str, Any] | None:
    """Load the Claude Code stats cache file."""
    if not STATS_CACHE_PATH.exists():
        return None

    try:
        with open(STATS_CACHE_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"Error reading stats cache: {e}")
        return None


def _read_jsonl_token_cache(days: int) -> list[dict[str, Any]] | None:
    """Return cached aggregation if fresh and matches `days` window, else None."""
    if not JSONL_TOKEN_CACHE_PATH.exists():
        return None
    try:
        with open(JSONL_TOKEN_CACHE_PATH) as f:
            cache = json.load(f)
        if cache.get("days") != days:
            return None
        cached_at = datetime.fromisoformat(cache["cachedAt"])
        if (datetime.now(UTC) - cached_at).total_seconds() < JSONL_TOKEN_CACHE_TTL_SECONDS:
            return cache.get("data", [])
    except (OSError, ValueError, KeyError, json.JSONDecodeError):
        return None
    return None


def _write_jsonl_token_cache(days: int, data: list[dict[str, Any]]) -> None:
    """Persist aggregation alongside its window size and a fresh timestamp."""
    try:
        JSONL_TOKEN_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(JSONL_TOKEN_CACHE_PATH, "w") as f:
            json.dump(
                {
                    "cachedAt": datetime.now(UTC).isoformat(),
                    "days": days,
                    "data": data,
                },
                f,
            )
    except OSError:
        logger.warning("Failed to write JSONL token cache", exc_info=True)


def aggregate_model_tokens_from_jsonl(days: int = 7) -> list["DailyModelTokens"]:
    """Aggregate per-day token usage by model from Claude Code session JSONL files.

    Used as a fallback when ``stats-cache.json`` is stale or empty. Walks
    ``~/.claude/projects/**/*.jsonl`` (including ``subagents/`` subfolders),
    counts only ``type == "assistant"`` entries within the window, and sums
    input + output + cache tokens per (date, model).
    """
    cached = _read_jsonl_token_cache(days)
    if cached is not None:
        return [DailyModelTokens(**item) for item in cached]

    if not CLAUDE_PROJECTS_DIR.exists():
        return []

    cutoff_dt = datetime.now(UTC) - timedelta(days=days)
    cutoff_ts = cutoff_dt.timestamp()
    aggregated: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for jsonl_path in CLAUDE_PROJECTS_DIR.rglob("*.jsonl"):
        try:
            if jsonl_path.stat().st_mtime < cutoff_ts:
                continue
        except OSError:
            continue
        try:
            with open(jsonl_path) as f:
                for line in f:
                    # Cheap string prefilter avoids JSON-parsing every line in
                    # a multi-hundred-MB file.
                    if '"type":"assistant"' not in line and '"type": "assistant"' not in line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if obj.get("type") != "assistant":
                        continue
                    ts_raw = obj.get("timestamp")
                    if not ts_raw:
                        continue
                    try:
                        ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                    except ValueError:
                        continue
                    if ts < cutoff_dt:
                        continue
                    msg = obj.get("message") or {}
                    model = msg.get("model")
                    usage = msg.get("usage") or {}
                    if not model or not usage:
                        continue
                    tokens = (
                        int(usage.get("input_tokens", 0) or 0)
                        + int(usage.get("output_tokens", 0) or 0)
                        + int(usage.get("cache_creation_input_tokens", 0) or 0)
                        + int(usage.get("cache_read_input_tokens", 0) or 0)
                    )
                    if tokens <= 0:
                        continue
                    aggregated[ts.date().isoformat()][model] += tokens
        except OSError:
            continue

    result = [
        DailyModelTokens(date=d, tokensByModel=dict(models))
        for d, models in sorted(aggregated.items())
    ]

    _write_jsonl_token_cache(days, [item.model_dump() for item in result])
    return result


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


def _codex_source_name(source: str | None) -> str:
    """Convert Codex thread source values into dashboard-friendly labels."""
    if not source:
        return "unknown"
    trimmed = source.strip()
    if not trimmed:
        return "unknown"
    try:
        parsed = json.loads(trimmed)
    except json.JSONDecodeError:
        return trimmed
    if isinstance(parsed, dict) and "subagent" in parsed:
        return "subagent"
    return trimmed


def _codex_usage_totals(
    conn: sqlite3.Connection, cutoff_ts: int | None = None
) -> tuple[int, int, int | None]:
    """Return (threads, tokens, latest_updated_at) for Codex/OpenAI threads."""
    where = "WHERE lower(coalesce(model_provider, '')) = 'openai'"
    params: tuple[int, ...] = ()
    if cutoff_ts is not None:
        where += " AND updated_at >= ?"
        params = (cutoff_ts,)

    row = conn.execute(
        f"""
        SELECT
            COUNT(*) AS threads,
            COALESCE(SUM(COALESCE(tokens_used, 0)), 0) AS tokens,
            MAX(updated_at) AS updated_at
        FROM threads
        {where}
        """,
        params,
    ).fetchone()
    if not row:
        return (0, 0, None)
    return (int(row[0] or 0), int(row[1] or 0), int(row[2]) if row[2] else None)


def _codex_usage_by_model(conn: sqlite3.Connection) -> list[CodexUsageBreakdown]:
    rows = conn.execute(
        """
        SELECT
            COALESCE(NULLIF(TRIM(model), ''), 'unspecified model') AS model_name,
            COUNT(*) AS threads,
            COALESCE(SUM(COALESCE(tokens_used, 0)), 0) AS tokens
        FROM threads
        WHERE lower(coalesce(model_provider, '')) = 'openai'
        GROUP BY model_name
        ORDER BY tokens DESC, threads DESC
        LIMIT 10
        """
    ).fetchall()
    return [
        CodexUsageBreakdown(name=str(row[0]), threads=int(row[1] or 0), tokens=int(row[2] or 0))
        for row in rows
    ]


def _codex_usage_by_source(conn: sqlite3.Connection) -> list[CodexUsageBreakdown]:
    rows = conn.execute(
        """
        SELECT
            source,
            COUNT(*) AS threads,
            COALESCE(SUM(COALESCE(tokens_used, 0)), 0) AS tokens
        FROM threads
        WHERE lower(coalesce(model_provider, '')) = 'openai'
        GROUP BY source
        ORDER BY tokens DESC, threads DESC
        """
    ).fetchall()

    grouped: dict[str, CodexUsageBreakdown] = {}
    for row in rows:
        name = _codex_source_name(row[0])
        item = grouped.setdefault(name, CodexUsageBreakdown(name=name))
        item.threads += int(row[1] or 0)
        item.tokens += int(row[2] or 0)

    return sorted(grouped.values(), key=lambda item: (-item.tokens, -item.threads))[:10]


def _coerce_percent(value: Any, default: float = 0) -> float:
    """Return a percent clamped to [0, 100]."""
    try:
        percent = float(value)
    except (TypeError, ValueError):
        percent = default
    return max(0, min(100, percent))


def _parse_codex_rate_limit_window(raw: Any) -> CodexPlanWindow | None:
    """Normalize a Codex app-server RateLimitWindow object."""
    if not isinstance(raw, dict):
        return None

    used_percent = _coerce_percent(raw.get("usedPercent"))
    remaining_percent = max(0, 100 - used_percent)

    resets_at_raw = raw.get("resetsAt")
    resets_at: int | None = None
    resets_at_iso: str | None = None
    resets_in_minutes: float | None = None
    if resets_at_raw is not None:
        try:
            resets_at = int(resets_at_raw)
            resets_at_dt = datetime.fromtimestamp(resets_at, UTC)
            resets_at_iso = resets_at_dt.isoformat()
            resets_in_minutes = max(
                0,
                (resets_at_dt - datetime.now(UTC)).total_seconds() / 60,
            )
        except (TypeError, ValueError, OSError):
            resets_at = None

    window_duration_raw = raw.get("windowDurationMins")
    try:
        window_duration = int(window_duration_raw) if window_duration_raw is not None else None
    except (TypeError, ValueError):
        window_duration = None

    return CodexPlanWindow(
        usedPercent=used_percent,
        remainingPercent=remaining_percent,
        windowDurationMins=window_duration,
        resetsAt=resets_at,
        resetsAtIso=resets_at_iso,
        resetsInMinutes=resets_in_minutes,
    )


def _parse_codex_limit_snapshot(raw: Any) -> CodexPlanLimitSnapshot | None:
    """Normalize a Codex app-server RateLimitSnapshot object."""
    if not isinstance(raw, dict):
        return None

    return CodexPlanLimitSnapshot(
        limitId=raw.get("limitId"),
        limitName=raw.get("limitName"),
        primary=_parse_codex_rate_limit_window(raw.get("primary")),
        secondary=_parse_codex_rate_limit_window(raw.get("secondary")),
        credits=raw.get("credits") if isinstance(raw.get("credits"), dict) else None,
        individualLimit=(
            raw.get("individualLimit") if isinstance(raw.get("individualLimit"), dict) else None
        ),
        planType=raw.get("planType"),
        rateLimitReachedType=raw.get("rateLimitReachedType"),
    )


def _select_codex_limit_snapshot(
    default_limit: CodexPlanLimitSnapshot | None,
    limits_by_id: dict[str, CodexPlanLimitSnapshot],
) -> CodexPlanLimitSnapshot | None:
    """Pick the Codex bucket from a multi-bucket response."""
    if "codex" in limits_by_id:
        return limits_by_id["codex"]

    for limit in limits_by_id.values():
        if (limit.limitId or "").lower() == "codex":
            return limit

    return default_limit


def _parse_codex_rate_limits_response(raw: dict[str, Any]) -> CodexPlanUsageResponse:
    """Convert `account/rateLimits/read` into the dashboard API shape."""
    default_limit = _parse_codex_limit_snapshot(raw.get("rateLimits"))
    raw_limits_by_id = raw.get("rateLimitsByLimitId") or {}
    limits_by_id: dict[str, CodexPlanLimitSnapshot] = {}

    if isinstance(raw_limits_by_id, dict):
        for key, value in raw_limits_by_id.items():
            parsed = _parse_codex_limit_snapshot(value)
            if parsed:
                limits_by_id[str(key)] = parsed

    codex_limit = _select_codex_limit_snapshot(default_limit, limits_by_id)

    return CodexPlanUsageResponse(
        available=codex_limit is not None,
        codexLimit=codex_limit,
        limitsById=limits_by_id,
        rateLimitResetCredits=(
            raw.get("rateLimitResetCredits")
            if isinstance(raw.get("rateLimitResetCredits"), dict)
            else None
        ),
        updatedAt=datetime.now(UTC).isoformat(),
        message=None if codex_limit else "Codex rate-limit bucket was not present.",
    )


def _read_codex_app_server_rate_limits() -> dict[str, Any]:
    """Read ChatGPT Codex rate limits from the local Codex app-server."""
    payload_messages = [
        {
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": {"name": "aos-dashboard", "version": "0.1.0"},
                "capabilities": {
                    "experimentalApi": True,
                    "requestAttestation": False,
                },
            },
        },
        {"method": "initialized"},
        {"id": 2, "method": "account/rateLimits/read"},
    ]

    process = subprocess.Popen(
        [CODEX_APP_SERVER_BIN, "app-server", "--listen", "stdio://"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.PIPE,
    )
    stdout_buffer = ""
    stderr_buffer = b""
    try:
        if process.stdin is None or process.stdout is None or process.stderr is None:
            raise RuntimeError("Codex app-server pipes were not available")

        for message in payload_messages:
            process.stdin.write((json.dumps(message) + "\n").encode())
            process.stdin.flush()

        deadline = time.monotonic() + CODEX_APP_SERVER_TIMEOUT_SECONDS
        streams = [process.stdout, process.stderr]
        while time.monotonic() < deadline:
            timeout = max(0, min(0.2, deadline - time.monotonic()))
            readable, _, _ = select.select(streams, [], [], timeout)
            if not readable and process.poll() is not None:
                break

            for stream in readable:
                chunk = os.read(stream.fileno(), 65536)
                if not chunk:
                    continue
                if stream is process.stderr:
                    stderr_buffer += chunk
                    continue

                stdout_buffer += chunk.decode(errors="replace")
                while "\n" in stdout_buffer:
                    line, stdout_buffer = stdout_buffer.split("\n", 1)
                    response = _extract_codex_rate_limit_response_line(line)
                    if response is not None:
                        return response

        if stdout_buffer.strip():
            response = _extract_codex_rate_limit_response_line(stdout_buffer)
            if response is not None:
                return response

        if process.poll() not in (None, 0):
            raise RuntimeError(f"Codex app-server exited with {process.returncode}")
        raise subprocess.TimeoutExpired(
            [CODEX_APP_SERVER_BIN, "app-server", "--listen", "stdio://"],
            CODEX_APP_SERVER_TIMEOUT_SECONDS,
            output=stdout_buffer,
            stderr=stderr_buffer,
        )
    finally:
        try:
            if process.stdin:
                process.stdin.close()
        except OSError:
            pass
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()


def _extract_codex_rate_limit_response_line(line: str) -> dict[str, Any] | None:
    """Return the id=2 rate-limit result from one app-server JSON line."""
    if not line.strip():
        return None
    try:
        message = json.loads(line)
    except json.JSONDecodeError:
        return None
    if message.get("id") != 2:
        return None
    if "error" in message:
        error = message.get("error") or {}
        raise RuntimeError(str(error.get("message") or "Codex app-server returned an error"))
    response = message.get("result")
    if not isinstance(response, dict):
        raise RuntimeError("Codex app-server returned an invalid rate-limit response")
    return response


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


class ClaudeConfigUpdate(BaseModel):
    """Claude Code config update request."""

    oauth_token: str | None = None
    stats_cache_path: str | None = None
    usage_cache_path: str | None = None


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
