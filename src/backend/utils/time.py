"""UTC datetime helpers (DB-compatible naive datetimes)."""

import os
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utcnow() -> datetime:
    """Return naive UTC now. Avoids deprecated datetime.utcnow() while staying DB-compatible.

    All DB columns use TIMESTAMP WITHOUT TIME ZONE, so we strip tzinfo.
    """
    return datetime.now(UTC).replace(tzinfo=None)


_DEFAULT_DISPLAY_TZ = "Asia/Seoul"


def display_tz() -> ZoneInfo:
    """Resolve the user-facing display timezone (env HEATMAP_DISPLAY_TZ, default KST)."""
    name = os.getenv("HEATMAP_DISPLAY_TZ", _DEFAULT_DISPLAY_TZ).strip() or _DEFAULT_DISPLAY_TZ
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(_DEFAULT_DISPLAY_TZ)


def to_display_tz(dt: datetime) -> datetime:
    """Convert a (naive UTC or aware) datetime to the configured display timezone.

    Heatmap weekday/hour 좌표 산출 전용. naive 입력은 UTC로 간주한다.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(display_tz())
