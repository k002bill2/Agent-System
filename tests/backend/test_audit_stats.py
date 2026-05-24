"""Tests for audit statistics aggregation.

Backend tests run with ``USE_DATABASE=false`` (see conftest.py), so these
exercise the in-memory path. The DB path (``get_stats_async``) shares the same
``build_recent_trend`` / action-category helpers verified here.
"""

from datetime import timedelta

import pytest

from services.audit_service import (
    AuditAction,
    AuditLogEntry,
    AuditService,
    ResourceType,
    build_recent_trend,
    compute_stats_from_logs,
)
from utils.time import utcnow


@pytest.fixture(autouse=True)
def _isolate_audit_logs():
    """Reset the in-memory audit store around each test for isolation."""
    from services.audit_service import _audit_logs

    _audit_logs.clear()
    yield
    _audit_logs.clear()


# ─────────────────────────────────────────────────────────────
# build_recent_trend
# ─────────────────────────────────────────────────────────────


def test_build_recent_trend_always_returns_seven_contiguous_days():
    trend = build_recent_trend({})

    assert len(trend) == 7
    dates = [point["date"] for point in trend]
    assert dates == sorted(dates)  # ascending
    expected = [
        (utcnow().date() - timedelta(days=offset)).strftime("%Y-%m-%d")
        for offset in range(6, -1, -1)
    ]
    assert dates == expected  # contiguous, no gaps


def test_build_recent_trend_zero_fills_missing_days():
    today = utcnow().date().strftime("%Y-%m-%d")
    trend = build_recent_trend({today: 5})

    assert trend[-1] == {"date": today, "count": 5}
    # days with no activity are zero-filled, not skipped
    assert all(point["count"] == 0 for point in trend[:-1])


def test_build_recent_trend_ends_today():
    today = utcnow().date().strftime("%Y-%m-%d")
    assert build_recent_trend({})[-1]["date"] == today


# ─────────────────────────────────────────────────────────────
# compute_stats_from_logs
# ─────────────────────────────────────────────────────────────


def _entry(action: AuditAction, resource: ResourceType, status: str = "success") -> AuditLogEntry:
    return AuditLogEntry(action=action, resource_type=resource, status=status)


def test_compute_stats_counts_tools_approvals_and_errors():
    logs = [
        _entry(AuditAction.TOOL_EXECUTED, ResourceType.TOOL),
        _entry(AuditAction.TOOL_FAILED, ResourceType.TOOL, status="failed"),
        _entry(AuditAction.APPROVAL_GRANTED, ResourceType.APPROVAL),
        _entry(AuditAction.USER_LOGIN, ResourceType.USER),
    ]

    stats = compute_stats_from_logs(logs, len(logs))

    assert stats["total_actions"] == 4
    assert stats["tool_executions"] == 2  # TOOL_EXECUTED + TOOL_FAILED
    assert stats["approvals"] == 1
    assert stats["errors"] == 1  # status == "failed"
    assert stats["actions_by_type"]["user_login"] == 1
    assert len(stats["recent_trend"]) == 7


def test_compute_stats_token_refresh_is_not_a_tool_execution():
    # Explicit action sets guarantee 'token_refreshed' never counts as a tool
    # execution — the substring match "tool" in "token_refreshed" is false here,
    # but explicit membership makes it robust against future renames.
    logs = [_entry(AuditAction.TOKEN_REFRESHED, ResourceType.USER) for _ in range(5)]

    stats = compute_stats_from_logs(logs, len(logs))

    assert stats["tool_executions"] == 0
    assert stats["actions_by_type"]["token_refreshed"] == 5


def test_compute_stats_breakdown_sums_to_total():
    logs = [_entry(AuditAction.SESSION_CREATED, ResourceType.SESSION) for _ in range(3)]
    logs += [_entry(AuditAction.USER_LOGIN, ResourceType.USER) for _ in range(2)]

    stats = compute_stats_from_logs(logs, len(logs))

    assert sum(stats["actions_by_type"].values()) == stats["total_actions"] == 5


# ─────────────────────────────────────────────────────────────
# /api/audit/stats endpoint (in-memory path)
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stats_endpoint_returns_zero_filled_seven_day_trend(client):
    AuditService.log(action=AuditAction.USER_LOGIN, resource_type=ResourceType.USER)
    old = AuditService.log(
        action=AuditAction.TOOL_EXECUTED, resource_type=ResourceType.TOOL, status="failed"
    )
    old.created_at = utcnow() - timedelta(days=3)  # leaves 5 days with no activity

    resp = await client.get("/api/audit/stats")

    assert resp.status_code == 200
    data = resp.json()

    assert data["total_actions"] == 2
    assert data["tool_executions"] == 1
    assert data["errors"] == 1
    # trend is always 7 contiguous days, ascending, gaps zero-filled
    trend = data["recent_trend"]
    assert len(trend) == 7
    dates = [point["date"] for point in trend]
    assert dates == sorted(dates)
    assert sum(point["count"] for point in trend) == 2


@pytest.mark.asyncio
async def test_stats_endpoint_empty_store(client):
    resp = await client.get("/api/audit/stats")

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_actions"] == 0
    assert data["tool_executions"] == 0
    assert data["approvals"] == 0
    assert data["errors"] == 0
    assert len(data["recent_trend"]) == 7  # still a full 7-day window
