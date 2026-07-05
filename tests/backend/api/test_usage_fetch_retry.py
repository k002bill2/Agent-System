"""Tests for transient-failure handling in ``fetch_usage_from_anthropic``.

The Anthropic OAuth usage endpoint (``/api/oauth/usage``) is aggressively
rate-limited and occasionally flakes on transient network errors. When a fetch
fails and the local cache is already past its stale window, the dashboard shows
a hard "Failed to fetch from Anthropic API" with zero data.

These tests pin the intended policy:

* transient failures (network error / timeout / 5xx) are retried with a short
  backoff, so a single blip is absorbed;
* 4xx responses — notably ``429 rate_limit_error`` and ``401`` auth failures —
  are NOT retried (retrying a rate limit only deepens it) and return ``None``
  so the caller can fall back to cached data.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from api import usage as usage_mod

pytestmark = pytest.mark.asyncio


class _FakeResponse:
    """Minimal stand-in for ``httpx.Response``."""

    def __init__(self, status_code: int, json_data: dict[str, Any] | None = None, text: str = ""):
        self.status_code = status_code
        self._json = json_data
        self.text = text

    def json(self) -> dict[str, Any]:
        if self._json is None:
            raise ValueError("no json body")
        return self._json


class _ClientFactory:
    """Fake ``httpx.AsyncClient`` factory recording every ``.get`` call.

    ``fetch_usage_from_anthropic`` creates a fresh client per attempt, so the
    factory doubles as the async context manager and shares one call counter
    across all attempts. Each queued outcome is either a ``_FakeResponse`` to
    return or an ``Exception`` to raise.
    """

    def __init__(self, outcomes: list[Any]):
        self.outcomes = list(outcomes)
        self.calls = 0

    def __call__(self, *args: Any, **kwargs: Any) -> _ClientFactory:
        return self

    async def __aenter__(self) -> _ClientFactory:
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def get(self, *args: Any, **kwargs: Any) -> _FakeResponse:
        outcome = self.outcomes[self.calls]
        self.calls += 1
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture(autouse=True)
def _no_backoff_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    """Neutralise the retry backoff so tests stay fast."""

    async def _instant(_seconds: float) -> None:
        return None

    # Patch the real asyncio module (shared singleton) so it applies whether or
    # not usage_mod has bound ``asyncio`` yet — keeps the Red failures on the
    # assertions rather than a fixture-setup AttributeError.
    monkeypatch.setattr(asyncio, "sleep", _instant)


def _install_client(monkeypatch: pytest.MonkeyPatch, outcomes: list[Any]) -> _ClientFactory:
    factory = _ClientFactory(outcomes)
    monkeypatch.setattr(usage_mod.httpx, "AsyncClient", factory)
    return factory


async def test_success_returns_data_without_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    data = {"five_hour": {"utilization": 39.0}}
    factory = _install_client(monkeypatch, [_FakeResponse(200, json_data=data)])

    result = await usage_mod.fetch_usage_from_anthropic("tok")

    assert result == data
    assert factory.calls == 1


async def test_rate_limit_429_is_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    # Even though a 200 is queued behind it, a 429 must fail fast: retrying a
    # rate limit only makes the throttling worse.
    factory = _install_client(
        monkeypatch,
        [_FakeResponse(429, text="rate_limit_error"), _FakeResponse(200, json_data={"ok": True})],
    )

    result = await usage_mod.fetch_usage_from_anthropic("tok")

    assert result is None
    assert factory.calls == 1


async def test_timeout_then_success_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    data = {"seven_day": {"utilization": 86.0}}
    factory = _install_client(
        monkeypatch,
        [httpx.ReadTimeout("timed out"), _FakeResponse(200, json_data=data)],
    )

    result = await usage_mod.fetch_usage_from_anthropic("tok")

    assert result == data
    assert factory.calls == 2


async def test_server_error_5xx_then_success_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    data = {"seven_day": {"utilization": 50.0}}
    factory = _install_client(
        monkeypatch,
        [_FakeResponse(503, text="service unavailable"), _FakeResponse(200, json_data=data)],
    )

    result = await usage_mod.fetch_usage_from_anthropic("tok")

    assert result == data
    assert factory.calls == 2


async def test_persistent_timeout_gives_up_after_bounded_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Retries are bounded — a permanently failing endpoint must not loop forever.
    factory = _install_client(
        monkeypatch,
        [httpx.ConnectError("boom")] * 10,
    )

    result = await usage_mod.fetch_usage_from_anthropic("tok")

    assert result is None
    assert 1 < factory.calls <= 5


async def test_retry_budget_stays_under_dashboard_timeout() -> None:
    """Worst-case retry budget must finish before the dashboard aborts.

    The frontend ``apiClient`` fetches ``/api/usage`` with its default 30s
    timeout (``src/dashboard/src/services/apiClient.ts``). If the backend keeps
    retrying past that, the dashboard aborts and shows a timeout anyway while the
    server wastes work on a request nobody awaits. Keep a safety margin.
    """
    dashboard_timeout_seconds = 30.0
    worst_case = (
        usage_mod.USAGE_FETCH_MAX_ATTEMPTS * usage_mod.USAGE_FETCH_TIMEOUT_SECONDS
        + sum(usage_mod.USAGE_FETCH_BACKOFF_SECONDS)
    )
    assert len(usage_mod.USAGE_FETCH_BACKOFF_SECONDS) >= usage_mod.USAGE_FETCH_MAX_ATTEMPTS - 1
    assert worst_case <= dashboard_timeout_seconds - 5.0, (
        f"retry budget {worst_case}s leaves too little margin under "
        f"{dashboard_timeout_seconds}s dashboard timeout"
    )
