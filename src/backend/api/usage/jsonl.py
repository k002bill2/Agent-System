"""Claude 로컬 세션 JSONL 집계와 그 디스크 캐시."""

import json
import logging
import os
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .models import DailyModelTokens

logger = logging.getLogger(__name__)


STATS_CACHE_PATH = Path(
    os.getenv(
        "CLAUDE_STATS_CACHE_PATH",
        str(Path.home() / ".claude" / "stats-cache.json"),
    )
)


CLAUDE_PROJECTS_DIR = Path(
    os.getenv(
        "CLAUDE_PROJECTS_DIR",
        str(Path.home() / ".claude" / "projects"),
    )
)


JSONL_TOKEN_CACHE_PATH = Path(
    os.getenv(
        "CLAUDE_JSONL_TOKEN_CACHE_PATH",
        str(Path.home() / ".claude" / "aos-jsonl-token-cache.json"),
    )
)


JSONL_TOKEN_CACHE_TTL_SECONDS = 300  # 5 minutes


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
