"""start/schedule_session_cleanup — 만료 세션 sweep 을 주기적으로 부르는 lifespan 태스크."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.session_service import schedule_session_cleanup, start_session_cleanup


def _service(side_effect):
    service = MagicMock()
    service.cleanup_expired_sessions = AsyncMock(side_effect=side_effect)
    return service


def _sleep_then_cancel_after(n: int):
    """n 번째 sleep 에서 CancelledError — lifespan 의 task.cancel() 을 흉내 낸다."""
    calls: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        calls.append(seconds)
        if len(calls) >= n:
            raise asyncio.CancelledError

    return fake_sleep, calls


@pytest.mark.asyncio
async def test_sweeps_immediately_then_sleeps_interval():
    service = _service([3])
    fake_sleep, sleeps = _sleep_then_cancel_after(1)

    with (
        patch("services.session_service.get_session_service", return_value=service),
        patch("services.session_service.asyncio.sleep", fake_sleep),
        pytest.raises(asyncio.CancelledError),
    ):
        await schedule_session_cleanup(interval_seconds=42)

    service.cleanup_expired_sessions.assert_awaited_once()
    assert sleeps == [42]


@pytest.mark.asyncio
async def test_sweep_failure_does_not_stop_next_iteration():
    service = _service([RuntimeError("db down"), 0])
    fake_sleep, sleeps = _sleep_then_cancel_after(2)

    with (
        patch("services.session_service.get_session_service", return_value=service),
        patch("services.session_service.asyncio.sleep", fake_sleep),
        pytest.raises(asyncio.CancelledError),
    ):
        await schedule_session_cleanup(interval_seconds=1)

    assert service.cleanup_expired_sessions.await_count == 2
    assert sleeps == [1, 1]


@pytest.mark.asyncio
async def test_cancellation_during_sweep_propagates():
    service = _service(asyncio.CancelledError)

    with (
        patch("services.session_service.get_session_service", return_value=service),
        pytest.raises(asyncio.CancelledError),
    ):
        await schedule_session_cleanup(interval_seconds=1)


@pytest.mark.asyncio
@pytest.mark.parametrize("raw", ["0", "-1", "daily"])
async def test_start_rejects_bad_interval_without_starting_task(monkeypatch, raw):
    """0 이하면 sleep 이 즉시 반환돼 전체 DB sweep 이 쉬지 않고 돈다 — 기동 시점에 실패."""
    monkeypatch.setenv("SESSION_SWEEP_INTERVAL_SECONDS", raw)

    with (
        patch("services.session_service.asyncio.create_task") as create_task,
        pytest.raises(ValueError, match="SESSION_SWEEP_INTERVAL_SECONDS must be a positive"),
    ):
        start_session_cleanup()

    create_task.assert_not_called()


@pytest.mark.asyncio
async def test_start_uses_env_interval(monkeypatch):
    monkeypatch.setenv("SESSION_SWEEP_INTERVAL_SECONDS", "42")

    with (
        patch("services.session_service.schedule_session_cleanup", MagicMock()) as schedule,
        patch("services.session_service.asyncio.create_task") as create_task,
    ):
        task = start_session_cleanup()

    schedule.assert_called_once_with(42)
    create_task.assert_called_once_with(schedule.return_value)
    assert task is create_task.return_value


def test_bad_interval_does_not_break_import():
    """메모리 모드는 이 설정을 안 쓴다 — 잘못된 값이 import(=기동)를 막으면 안 된다."""
    import os
    import subprocess
    import sys

    backend = os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend")
    result = subprocess.run(
        [sys.executable, "-c", "import services.session_service"],
        cwd=backend,
        env={**os.environ, "PYTHONPATH": backend, "SESSION_SWEEP_INTERVAL_SECONDS": "0"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
