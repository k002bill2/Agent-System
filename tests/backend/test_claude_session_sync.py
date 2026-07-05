"""Tests for the Claude snapshot refresh used by External Usage /sync."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = pytest.mark.asyncio


async def test_scan_and_sync_claude_snapshots_discovers_and_upserts() -> None:
    """Refresh must scan sessions from the monitor and upsert them, returning the count.

    This is what lets External Usage /sync pick up host Claude sessions without a
    prior visit to the Claude Sessions page (freshness follow-up).
    """
    from api import claude_sessions

    fake_sessions = [MagicMock(), MagicMock(), MagicMock()]
    monitor = MagicMock()
    monitor.discover_sessions = MagicMock(return_value=fake_sessions)

    with (
        patch.object(claude_sessions, "get_monitor", return_value=monitor),
        patch.object(claude_sessions, "_sync_sessions_to_db", AsyncMock()) as sync_mock,
    ):
        count = await claude_sessions.scan_and_sync_claude_snapshots()

    monitor.discover_sessions.assert_called_once()
    sync_mock.assert_awaited_once_with(fake_sessions)
    assert count == 3


async def test_scan_and_sync_claude_snapshots_empty() -> None:
    """No discovered sessions → sync still runs with [] and count is 0."""
    from api import claude_sessions

    monitor = MagicMock()
    monitor.discover_sessions = MagicMock(return_value=[])

    with (
        patch.object(claude_sessions, "get_monitor", return_value=monitor),
        patch.object(claude_sessions, "_sync_sessions_to_db", AsyncMock()) as sync_mock,
    ):
        count = await claude_sessions.scan_and_sync_claude_snapshots()

    sync_mock.assert_awaited_once_with([])
    assert count == 0
