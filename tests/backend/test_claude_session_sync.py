"""Tests for the Claude snapshot refresh used by External Usage /sync.

**패치 대상은 `api.claude_sessions` 패키지가 아니라 구현 모듈이다.**
`scan_and_sync_claude_snapshots` 는 `get_monitor` 와 `_sync_sessions_to_db` 를
자기 모듈 네임스페이스에 바인딩하므로, 패키지 `__init__` 의 재노출 속성을
패치해도 실제 호출은 원본을 탄다. 호출은 공개 경로(`claude_sessions.…`)로
그대로 두어 재노출 계약까지 함께 검증한다.

분할 진행에 따라 이 대상은 이동한다: `api/claude_sessions.py`(원본) →
`_legacy`(패키지 승격) → `sync`(도메인 추출). 대상을 패키지로 되돌리지 마라.
"""

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
    from api.claude_sessions import _legacy as impl

    fake_sessions = [MagicMock(), MagicMock(), MagicMock()]
    monitor = MagicMock()
    monitor.discover_sessions = MagicMock(return_value=fake_sessions)

    with (
        patch.object(impl, "get_monitor", return_value=monitor),
        patch.object(impl, "_sync_sessions_to_db", AsyncMock()) as sync_mock,
    ):
        count = await claude_sessions.scan_and_sync_claude_snapshots()

    monitor.discover_sessions.assert_called_once()
    sync_mock.assert_awaited_once_with(fake_sessions)
    assert count == 3


async def test_scan_and_sync_claude_snapshots_empty() -> None:
    """No discovered sessions → sync still runs with [] and count is 0."""
    from api import claude_sessions
    from api.claude_sessions import _legacy as impl

    monitor = MagicMock()
    monitor.discover_sessions = MagicMock(return_value=[])

    with (
        patch.object(impl, "get_monitor", return_value=monitor),
        patch.object(impl, "_sync_sessions_to_db", AsyncMock()) as sync_mock,
    ):
        count = await claude_sessions.scan_and_sync_claude_snapshots()

    sync_mock.assert_awaited_once_with([])
    assert count == 0
