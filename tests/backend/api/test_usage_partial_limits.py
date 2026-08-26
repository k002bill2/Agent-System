"""Tests for partial ``planLimits`` responses from the Anthropic usage endpoint.

``parse_usage_data`` builds the dashboard's plan-limit cards by looking each
mapped key up in the upstream payload. When a key is absent the limit is simply
skipped — which is correct for the plan-dependent Sonnet/Opus buckets, but for
``five_hour``/``seven_day`` it silently deletes a card the user expects to see.

Observed 2026-08-26: during a session-window rollover the upstream returned
``five_hour`` only, and the "Claude Weekly" card vanished from the dashboard
with no log line, no error and no UI signal — the outage read as a frontend
bug. These tests pin the intended policy: the always-expected pair is logged
when missing, the optional buckets stay quiet.
"""

from __future__ import annotations

import logging
from typing import Any

from api.usage.routes import parse_usage_data

_FIVE_HOUR: dict[str, Any] = {
    "utilization": 34,
    "resets_at": "2026-08-25T17:59:59.208161+00:00",
}
_SEVEN_DAY: dict[str, Any] = {
    "utilization": 30,
    "resets_at": "2026-08-31T00:59:59.208183+00:00",
}

_LOGGER_NAME = "api.usage.routes"


def _warnings(caplog: Any) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING]


def test_missing_seven_day_is_logged(caplog: Any) -> None:
    """A missing always-expected bucket must leave a trace."""
    with caplog.at_level(logging.WARNING, logger=_LOGGER_NAME):
        limits = parse_usage_data({"five_hour": _FIVE_HOUR})

    assert [limit.name for limit in limits] == ["fiveHour"]

    messages = _warnings(caplog)
    assert len(messages) == 1
    assert "seven_day" in messages[0]
    # The keys that *were* present must be reported, so the next occurrence
    # says what upstream actually sent instead of only what it omitted.
    assert "five_hour" in messages[0]


def test_missing_five_hour_is_logged(caplog: Any) -> None:
    """The other half of the always-expected pair is treated the same."""
    with caplog.at_level(logging.WARNING, logger=_LOGGER_NAME):
        limits = parse_usage_data({"seven_day": _SEVEN_DAY})

    assert [limit.name for limit in limits] == ["sevenDay"]
    messages = _warnings(caplog)
    assert len(messages) == 1
    assert "five_hour" in messages[0]


def test_complete_core_pair_is_quiet(caplog: Any) -> None:
    """Absent Sonnet/Opus buckets are normal and must not warn.

    Those two are plan-dependent — warning on them would fire on every poll for
    every account that does not have them.
    """
    with caplog.at_level(logging.WARNING, logger=_LOGGER_NAME):
        limits = parse_usage_data({"five_hour": _FIVE_HOUR, "seven_day": _SEVEN_DAY})

    assert [limit.name for limit in limits] == ["fiveHour", "sevenDay"]
    assert _warnings(caplog) == []


def test_null_valued_core_limit_is_logged(caplog: Any) -> None:
    """A present-but-null bucket drops the card too, so it counts as missing."""
    with caplog.at_level(logging.WARNING, logger=_LOGGER_NAME):
        limits = parse_usage_data({"five_hour": _FIVE_HOUR, "seven_day": None})

    assert [limit.name for limit in limits] == ["fiveHour"]
    messages = _warnings(caplog)
    assert len(messages) == 1
    assert "seven_day" in messages[0]
