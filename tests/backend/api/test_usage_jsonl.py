"""Tests for JSONL fallback aggregation in api.usage.

Covers ``aggregate_model_tokens_from_jsonl`` — the path that takes over when
``stats-cache.json`` is stale (recent Claude Code versions stopped refreshing
that cache, leaving the Model Token Breakdown chart empty).
"""

from __future__ import annotations

import json
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


def test_aggregates_tokens_per_day_per_model(isolated_jsonl_env: Path) -> None:
    """Sums input + output + cache tokens, grouped by date and model."""
    now = datetime.now(UTC).replace(microsecond=0)
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
    monkeypatch.setattr(
        usage_mod, "JSONL_TOKEN_CACHE_PATH", tmp_path / "cache.json"
    )

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
                "dailyModelTokens": [
                    {"date": old_date, "tokensByModel": {"claude-opus-4-7": 100}}
                ],
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
                "dailyModelTokens": [
                    {"date": today, "tokensByModel": {"claude-opus-4-7": 555}}
                ],
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
