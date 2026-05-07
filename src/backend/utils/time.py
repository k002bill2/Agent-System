"""UTC datetime helpers (DB-compatible naive datetimes)."""

import os
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utcnow() -> datetime:
    """Return naive UTC now. Avoids deprecated datetime.utcnow() while staying DB-compatible.

    All DB columns use TIMESTAMP WITHOUT TIME ZONE, so we strip tzinfo.
    """
    return datetime.now(UTC).replace(tzinfo=None)


def to_utc_iso(dt: datetime | None) -> str | None:
    """Serialize a datetime as ISO 8601 with explicit UTC offset (`+00:00`).

    naive datetime은 백엔드 컨벤션상 UTC로 간주하고 offset을 부여한다.
    JS `new Date(iso)`가 timezone suffix 없는 입력을 로컬 시간으로 해석해
    9시간 어긋나는 문제를 응답 경계에서 차단하기 위함.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.isoformat()


def to_naive_utc(dt: datetime) -> datetime:
    """Normalize datetime to naive UTC for consistent comparison.

    tz-aware는 UTC로 변환 후 tzinfo 제거, naive는 그대로 반환.
    DB 컬럼이 TIMESTAMP WITHOUT TIME ZONE이고 utcnow()도 naive UTC를 쓰는
    내부 컨벤션과 일치한다. 응답 직렬화 시점에는 to_utc_iso()를 사용.
    """
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


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
