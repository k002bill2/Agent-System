"""Tests for JSONL fallback aggregation in api.usage.

Covers ``aggregate_model_tokens_from_jsonl`` — the path that takes over when
``stats-cache.json`` is stale (recent Claude Code versions stopped refreshing
that cache, leaving the Model Token Breakdown chart empty).
"""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from api import usage as usage_mod


@pytest.fixture
def isolated_jsonl_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the aggregator at a temp projects dir + cache file."""
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    cache_path = tmp_path / "aos-jsonl-token-cache.json"

    monkeypatch.setattr(usage_mod, "CLAUDE_PROJECTS_DIR", projects_dir)
    monkeypatch.setattr(usage_mod, "JSONL_TOKEN_CACHE_PATH", cache_path)
    return projects_dir


def _write_jsonl(path: Path, entries: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")


def _assistant_entry(*, ts: datetime, model: str, **usage_kwargs: int) -> dict:
    return {
        "type": "assistant",
        "timestamp": ts.isoformat().replace("+00:00", "Z"),
        "message": {
            "model": model,
            "usage": {
                "input_tokens": usage_kwargs.get("input_tokens", 0),
                "output_tokens": usage_kwargs.get("output_tokens", 0),
                "cache_creation_input_tokens": usage_kwargs.get("cache_creation_input_tokens", 0),
                "cache_read_input_tokens": usage_kwargs.get("cache_read_input_tokens", 0),
            },
        },
    }


def _write_codex_state_db(path: Path, rows: list[dict]) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE threads (
                model_provider TEXT,
                model TEXT,
                source TEXT,
                tokens_used INTEGER,
                updated_at INTEGER
            )
            """
        )
        conn.executemany(
            """
            INSERT INTO threads (
                model_provider,
                model,
                source,
                tokens_used,
                updated_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    row.get("model_provider"),
                    row.get("model"),
                    row.get("source"),
                    row.get("tokens_used"),
                    row.get("updated_at"),
                )
                for row in rows
            ],
        )


def test_aggregates_tokens_per_day_per_model(isolated_jsonl_env: Path) -> None:
    """Sums input + output + cache tokens, grouped by date and model."""
    now = datetime.now(UTC).replace(hour=12, minute=0, second=0, microsecond=0)
    today = now.date()

    _write_jsonl(
        isolated_jsonl_env / "session-a.jsonl",
        [
            _assistant_entry(
                ts=now - timedelta(hours=1),
                model="claude-opus-4-7",
                input_tokens=100,
                output_tokens=50,
                cache_read_input_tokens=10,
                cache_creation_input_tokens=5,
            ),
            _assistant_entry(
                ts=now - timedelta(hours=2),
                model="claude-opus-4-7",
                input_tokens=20,
                output_tokens=10,
            ),
            _assistant_entry(
                ts=now - timedelta(hours=3),
                model="claude-haiku-4-5",
                output_tokens=5,
            ),
        ],
    )

    result = usage_mod.aggregate_model_tokens_from_jsonl(days=7)
    by_date = {r.date: r.tokensByModel for r in result}

    assert today.isoformat() in by_date
    today_models = by_date[today.isoformat()]
    # 100+50+10+5 + 20+10 = 195
    assert today_models["claude-opus-4-7"] == 195
    assert today_models["claude-haiku-4-5"] == 5


def test_excludes_entries_outside_window(isolated_jsonl_env: Path) -> None:
    """Entries older than `days` are dropped, even if file mtime is fresh."""
    now = datetime.now(UTC)
    _write_jsonl(
        isolated_jsonl_env / "session.jsonl",
        [
            _assistant_entry(
                ts=now - timedelta(days=30),
                model="claude-opus-4-7",
                input_tokens=999_999,
            ),
            _assistant_entry(
                ts=now - timedelta(hours=1),
                model="claude-opus-4-7",
                input_tokens=42,
            ),
        ],
    )

    result = usage_mod.aggregate_model_tokens_from_jsonl(days=7)
    total_opus = sum(r.tokensByModel.get("claude-opus-4-7", 0) for r in result)
    assert total_opus == 42


def test_ignores_non_assistant_entries(isolated_jsonl_env: Path) -> None:
    """user / progress / system entries must not contribute tokens."""
    now = datetime.now(UTC)
    _write_jsonl(
        isolated_jsonl_env / "session.jsonl",
        [
            {
                "type": "user",
                "timestamp": now.isoformat().replace("+00:00", "Z"),
                "message": {
                    "model": "claude-opus-4-7",
                    "usage": {"input_tokens": 1_000_000},
                },
            },
            {
                "type": "progress",
                "timestamp": now.isoformat().replace("+00:00", "Z"),
                "message": {
                    "model": "claude-opus-4-7",
                    "usage": {"output_tokens": 1_000_000},
                },
            },
            _assistant_entry(ts=now, model="claude-opus-4-7", input_tokens=7),
        ],
    )

    result = usage_mod.aggregate_model_tokens_from_jsonl(days=7)
    total = sum(r.tokensByModel.get("claude-opus-4-7", 0) for r in result)
    assert total == 7


def test_walks_subagent_subdirectories(isolated_jsonl_env: Path) -> None:
    """Subagent JSONLs live in nested ``subagents/`` folders and must be counted."""
    now = datetime.now(UTC)
    _write_jsonl(
        isolated_jsonl_env / "main.jsonl",
        [_assistant_entry(ts=now, model="claude-opus-4-7", input_tokens=10)],
    )
    _write_jsonl(
        isolated_jsonl_env / "session-x" / "subagents" / "agent-abc.jsonl",
        [_assistant_entry(ts=now, model="claude-opus-4-7", output_tokens=20)],
    )

    result = usage_mod.aggregate_model_tokens_from_jsonl(days=7)
    total = sum(r.tokensByModel.get("claude-opus-4-7", 0) for r in result)
    assert total == 30


def test_cache_hit_avoids_rescanning(isolated_jsonl_env: Path) -> None:
    """A second call within the TTL returns cached data, not a re-scan."""
    now = datetime.now(UTC)
    jsonl = isolated_jsonl_env / "session.jsonl"
    _write_jsonl(
        jsonl,
        [_assistant_entry(ts=now, model="claude-opus-4-7", input_tokens=5)],
    )

    first = usage_mod.aggregate_model_tokens_from_jsonl(days=7)
    assert sum(r.tokensByModel.get("claude-opus-4-7", 0) for r in first) == 5

    # Mutate the file. Cached call must NOT see the new entry.
    _write_jsonl(
        jsonl,
        [_assistant_entry(ts=now, model="claude-opus-4-7", input_tokens=999)],
    )
    second = usage_mod.aggregate_model_tokens_from_jsonl(days=7)
    assert sum(r.tokensByModel.get("claude-opus-4-7", 0) for r in second) == 5


def test_returns_empty_when_projects_dir_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Non-existent projects dir is handled without raising."""
    missing = tmp_path / "does-not-exist"
    monkeypatch.setattr(usage_mod, "CLAUDE_PROJECTS_DIR", missing)
    monkeypatch.setattr(usage_mod, "JSONL_TOKEN_CACHE_PATH", tmp_path / "cache.json")

    result = usage_mod.aggregate_model_tokens_from_jsonl(days=7)
    assert result == []


def test_skips_zero_token_entries(isolated_jsonl_env: Path) -> None:
    """Entries that sum to 0 tokens are skipped to keep the chart clean."""
    now = datetime.now(UTC)
    _write_jsonl(
        isolated_jsonl_env / "session.jsonl",
        [
            _assistant_entry(ts=now, model="claude-opus-4-7"),  # all zeros
            _assistant_entry(ts=now, model="claude-opus-4-7", output_tokens=1),
        ],
    )

    result = usage_mod.aggregate_model_tokens_from_jsonl(days=7)
    assert sum(r.tokensByModel.get("claude-opus-4-7", 0) for r in result) == 1


# ── /api/usage response: source + staleness fields ──


@pytest.fixture
def stale_stats_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point STATS_CACHE_PATH at a temp file that callers can populate."""
    cache_file = tmp_path / "stats-cache.json"
    monkeypatch.setattr(usage_mod, "STATS_CACHE_PATH", cache_file)
    return cache_file


@pytest.mark.anyio
async def test_response_marks_jsonl_fallback_when_stats_cache_empty(
    isolated_jsonl_env: Path,
    stale_stats_cache: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When stats-cache has no recent entries, source must be 'jsonl-fallback'."""
    # stats-cache: lastComputedDate is 30 days ago, no recent dailyModelTokens
    old_date = (datetime.now().date() - timedelta(days=30)).isoformat()
    stale_stats_cache.write_text(
        json.dumps(
            {
                "lastComputedDate": old_date,
                "dailyActivity": [],
                "dailyModelTokens": [{"date": old_date, "tokensByModel": {"claude-opus-4-7": 100}}],
                "modelUsage": {},
                "totalSessions": 1,
                "totalMessages": 1,
            }
        )
    )

    # JSONL has fresh data
    now = datetime.now(UTC)
    _write_jsonl(
        isolated_jsonl_env / "session.jsonl",
        [_assistant_entry(ts=now, model="claude-opus-4-7", input_tokens=42)],
    )

    # Bypass the OAuth network path
    async def _no_oauth(_token: str) -> None:
        return None

    monkeypatch.setattr(usage_mod, "fetch_usage_from_anthropic", _no_oauth)
    monkeypatch.setattr(usage_mod, "get_oauth_token", lambda: None)

    response = await usage_mod.get_usage()
    assert response.weeklyModelTokensSource == "jsonl-fallback"
    assert response.statsCacheAgeDays == 30
    assert any(r.tokensByModel.get("claude-opus-4-7", 0) == 42 for r in response.weeklyModelTokens)
    assert response.weeklyTotalTokens == 42
    assert response.weeklyOpusTokens == 42
    assert response.weeklySonnetTokens == 0


@pytest.mark.anyio
async def test_response_marks_stats_cache_when_data_is_fresh(
    isolated_jsonl_env: Path,
    stale_stats_cache: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A fresh stats-cache.json wins over the JSONL fallback."""
    today = datetime.now().date().isoformat()
    stale_stats_cache.write_text(
        json.dumps(
            {
                "lastComputedDate": today,
                "dailyActivity": [],
                "dailyModelTokens": [{"date": today, "tokensByModel": {"claude-opus-4-7": 555}}],
                "modelUsage": {},
                "totalSessions": 1,
                "totalMessages": 1,
            }
        )
    )

    async def _no_oauth(_token: str) -> None:
        return None

    monkeypatch.setattr(usage_mod, "fetch_usage_from_anthropic", _no_oauth)
    monkeypatch.setattr(usage_mod, "get_oauth_token", lambda: None)

    response = await usage_mod.get_usage()
    assert response.weeklyModelTokensSource == "stats-cache"
    assert response.statsCacheAgeDays == 0


def test_codex_cli_usage_reads_local_state_db(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Codex local token usage is read from the Codex state DB."""
    now_ts = int(datetime.now(UTC).timestamp())
    db_path = tmp_path / "state_5.sqlite"
    _write_codex_state_db(
        db_path,
        [
            {
                "model_provider": "openai",
                "model": "gpt-5.5",
                "source": "vscode",
                "tokens_used": 100,
                "updated_at": now_ts - 60,
            },
            {
                "model_provider": "openai",
                "model": "codex-auto-review",
                "source": json.dumps({"subagent": {"other": "guardian"}}),
                "tokens_used": 50,
                "updated_at": now_ts - (2 * 24 * 60 * 60),
            },
            {
                "model_provider": "openai",
                "model": "gpt-5.5",
                "source": "exec",
                "tokens_used": 25,
                "updated_at": now_ts - (10 * 24 * 60 * 60),
            },
            {
                "model_provider": "anthropic",
                "model": "claude-opus-4-8",
                "source": "claude",
                "tokens_used": 999,
                "updated_at": now_ts,
            },
        ],
    )
    monkeypatch.setattr(usage_mod, "CODEX_STATE_DB_PATH", db_path)

    response = usage_mod.get_codex_cli_usage()

    assert response.available is True
    assert response.fiveHourTokens == 100
    assert response.fiveHourThreads == 1
    assert response.weeklyTokens == 150
    assert response.weeklyThreads == 2
    assert response.totalTokens == 175
    assert response.totalThreads == 3
    assert response.byModel[0].name == "gpt-5.5"
    assert response.byModel[0].tokens == 125
    assert {source.name for source in response.bySource} >= {"vscode", "subagent", "exec"}
    assert response.limitStatus == "not_exposed"


def test_codex_cli_usage_handles_missing_state_db(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Missing Codex DB returns an unavailable payload instead of raising."""
    monkeypatch.setattr(usage_mod, "CODEX_STATE_DB_PATH", tmp_path / "missing.sqlite")

    response = usage_mod.get_codex_cli_usage()

    assert response.available is False
    assert response.weeklyTokens == 0
    assert "not found" in (response.message or "")


def test_codex_plan_usage_reads_chatgpt_subscription_limits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Codex plan usage comes from app-server rate limits, not the local token DB."""
    monkeypatch.setattr(
        usage_mod,
        "_codex_plan_cache",
        {"response": None, "timestamp": None},
    )

    def _fake_read_rate_limits() -> dict:
        return {
            "rateLimits": {
                "limitId": "codex",
                "limitName": None,
                "primary": {
                    "usedPercent": 56,
                    "windowDurationMins": 300,
                    "resetsAt": 1783174155,
                },
                "secondary": {
                    "usedPercent": 40,
                    "windowDurationMins": 10080,
                    "resetsAt": 1783706099,
                },
                "credits": {"hasCredits": False, "balance": "0"},
                "individualLimit": None,
                "planType": "plus",
                "rateLimitReachedType": None,
            },
            "rateLimitsByLimitId": {
                "codex": {
                    "limitId": "codex",
                    "primary": {
                        "usedPercent": 56,
                        "windowDurationMins": 300,
                        "resetsAt": 1783174155,
                    },
                    "secondary": {
                        "usedPercent": 40,
                        "windowDurationMins": 10080,
                        "resetsAt": 1783706099,
                    },
                    "credits": {"hasCredits": False, "balance": "0"},
                    "individualLimit": None,
                    "planType": "plus",
                    "rateLimitReachedType": None,
                }
            },
            "rateLimitResetCredits": {"availableCount": 1},
        }

    monkeypatch.setattr(usage_mod, "_read_codex_app_server_rate_limits", _fake_read_rate_limits)

    response = usage_mod.get_codex_plan_usage()

    assert response.available is True
    assert response.source == "codex-app-server"
    assert response.codexLimit is not None
    assert response.codexLimit.planType == "plus"
    assert response.codexLimit.primary is not None
    assert response.codexLimit.primary.usedPercent == 56
    assert response.codexLimit.primary.remainingPercent == 44
    assert response.codexLimit.secondary is not None
    assert response.codexLimit.secondary.remainingPercent == 60
    assert response.rateLimitResetCredits == {"availableCount": 1}


def test_codex_plan_usage_handles_missing_cli(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing Codex binary returns an unavailable payload."""
    monkeypatch.setattr(
        usage_mod,
        "_codex_plan_cache",
        {"response": None, "timestamp": None},
    )

    def _missing_read() -> dict:
        raise FileNotFoundError

    monkeypatch.setattr(usage_mod, "_read_codex_app_server_rate_limits", _missing_read)

    response = usage_mod.get_codex_plan_usage()

    assert response.available is False
    assert "not found" in (response.message or "")


def test_codex_plan_refresh_bypasses_cached_limit_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Manual refresh must not keep showing a stale 0% remaining Codex window."""
    monkeypatch.setattr(
        usage_mod,
        "_codex_plan_cache",
        {"response": None, "timestamp": None},
    )

    snapshots = [
        {
            "rateLimits": {
                "limitId": "codex",
                "primary": {"usedPercent": 100, "windowDurationMins": 300},
                "secondary": {"usedPercent": 47, "windowDurationMins": 10080},
                "planType": "plus",
            },
            "rateLimitsByLimitId": None,
            "rateLimitResetCredits": {"availableCount": 1},
        },
        {
            "rateLimits": {
                "limitId": "codex",
                "primary": {"usedPercent": 73, "windowDurationMins": 300},
                "secondary": {"usedPercent": 43, "windowDurationMins": 10080},
                "planType": "plus",
            },
            "rateLimitsByLimitId": None,
            "rateLimitResetCredits": {"availableCount": 1},
        },
    ]
    calls = {"count": 0}

    def _read_rate_limits() -> dict:
        index = min(calls["count"], len(snapshots) - 1)
        calls["count"] += 1
        return snapshots[index]

    monkeypatch.setattr(usage_mod, "_read_codex_app_server_rate_limits", _read_rate_limits)

    first = usage_mod.get_codex_plan_usage()
    cached = usage_mod.get_codex_plan_usage()
    refreshed = usage_mod.get_codex_plan_usage(refresh=True)

    assert first.codexLimit is not None
    assert first.codexLimit.primary is not None
    assert first.codexLimit.primary.remainingPercent == 0
    assert cached.codexLimit is not None
    assert cached.codexLimit.primary is not None
    assert cached.codexLimit.primary.remainingPercent == 0
    assert cached.isCached is True
    assert refreshed.codexLimit is not None
    assert refreshed.codexLimit.primary is not None
    assert refreshed.codexLimit.primary.remainingPercent == 27
    assert refreshed.codexLimit.secondary is not None
    assert refreshed.codexLimit.secondary.remainingPercent == 57
    assert calls["count"] == 2


# ── /api/usage: honour the short-lived cache to avoid Anthropic 429s ──


def _fresh_usage_cache(monkeypatch: pytest.MonkeyPatch, utilization: float) -> None:
    """Prime a valid (unexpired) in-memory usage cache with one plan limit."""
    now = datetime.now(UTC)
    monkeypatch.setattr(
        usage_mod,
        "_usage_cache",
        {
            "data": {"five_hour": {"utilization": utilization, "resets_at": None}},
            "timestamp": now.isoformat(),
            "expires_at": (now + timedelta(seconds=200)).isoformat(),
        },
    )


@pytest.mark.anyio
async def test_get_usage_serves_fresh_cache_without_calling_anthropic(
    stale_stats_cache: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A valid server cache must be served without hitting the rate-limited API."""
    today = datetime.now().date().isoformat()
    stale_stats_cache.write_text(
        json.dumps(
            {
                "lastComputedDate": today,
                "dailyActivity": [],
                "dailyModelTokens": [],
                "modelUsage": {},
                "totalSessions": 1,
                "totalMessages": 1,
            }
        )
    )
    _fresh_usage_cache(monkeypatch, utilization=42.0)

    calls = {"count": 0}

    async def _spy(_token: str) -> dict:
        calls["count"] += 1
        return {"five_hour": {"utilization": 99.0, "resets_at": None}}

    monkeypatch.setattr(usage_mod, "fetch_usage_from_anthropic", _spy)
    monkeypatch.setattr(usage_mod, "get_oauth_token", lambda: "tok")

    response = await usage_mod.get_usage()

    assert calls["count"] == 0  # fresh cache served, no Anthropic call
    assert response.oauthAvailable is True
    assert response.isCached is False  # fresh cache is "live enough", no warning banner
    assert any(
        limit.name == "fiveHour" and limit.utilization == 42.0 for limit in response.planLimits
    )


@pytest.mark.anyio
async def test_get_usage_refresh_bypasses_fresh_cache(
    stale_stats_cache: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """refresh=True must skip the cache and fetch live data from Anthropic."""
    today = datetime.now().date().isoformat()
    stale_stats_cache.write_text(
        json.dumps(
            {
                "lastComputedDate": today,
                "dailyActivity": [],
                "dailyModelTokens": [],
                "modelUsage": {},
                "totalSessions": 1,
                "totalMessages": 1,
            }
        )
    )
    _fresh_usage_cache(monkeypatch, utilization=42.0)

    calls = {"count": 0}

    async def _spy(_token: str) -> dict:
        calls["count"] += 1
        return {"five_hour": {"utilization": 99.0, "resets_at": None}}

    monkeypatch.setattr(usage_mod, "fetch_usage_from_anthropic", _spy)
    monkeypatch.setattr(usage_mod, "get_oauth_token", lambda: "tok")

    response = await usage_mod.get_usage(refresh=True)

    assert calls["count"] == 1  # refresh bypasses cache and hits the API
    assert any(
        limit.name == "fiveHour" and limit.utilization == 99.0 for limit in response.planLimits
    )
