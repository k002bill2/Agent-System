"""UTC datetime helpers.

**기본형은 aware 다.** 이 코드베이스의 시각 컬럼은 거의 전부
`DateTime(timezone=True)`(= Postgres `timestamptz`) 이고, naive 컬럼은
`config_versions` 의 두 개뿐이다.

asyncpg 는 naive datetime 을 timestamptz 에 넣을 때 **프로세스 로컬 타임존**으로
해석한다. 변환이 클라이언트에서 일어나므로 서버의 `TimeZone` 설정으로는 못 고치고,
UTC 가 아닌 머신에서 도는 프로세스는 오프셋만큼 어긋난 값을 쓴다 (issue #309).
그래서 naive 를 돌려주는 것은 기본값이 될 수 없다.

naive 가 필요한 자리에는 `utcnow_naive()` 를 **명시적으로** 쓴다.
"""

import os
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utcnow() -> datetime:
    """Return timezone-aware UTC now.

    시각 컬럼의 절대다수가 `timestamptz` 라 aware 가 기본이다. naive 를 쓰면
    asyncpg 가 프로세스 로컬 TZ 로 해석해 오프셋만큼 어긋난다 (issue #309).
    """
    return datetime.now(UTC)


def utcnow_naive() -> datetime:
    """Return naive UTC now — `TIMESTAMP WITHOUT TIME ZONE` 컬럼 전용.

    이 코드베이스에서 대상은 `config_versions.created_at` / `.rolled_back_at`
    둘뿐이다. 그 밖에는 `utcnow()` 를 쓴다.
    """
    return datetime.now(UTC).replace(tzinfo=None)


def to_aware_utc(dt: datetime) -> datetime:
    """Normalize a datetime to tz-aware UTC.

    naive 입력은 백엔드 컨벤션대로 UTC 로 간주해 tzinfo 를 붙인다. 저장된
    문자열을 `fromisoformat` 으로 파싱한 값처럼 offset 유무가 입력에 좌우되는
    자리에서, `utcnow()` 와 비교하기 전에 통과시킨다 — 그러지 않으면 naive 와
    aware 가 만나 TypeError 가 난다.
    """
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


def to_utc_iso(dt: datetime | None) -> str | None:
    """Serialize a datetime as ISO 8601 with explicit UTC offset (`+00:00`).

    naive datetime은 백엔드 컨벤션상 UTC로 간주하고 offset을 부여한다.
    JS `new Date(iso)`가 timezone suffix 없는 입력을 로컬 시간으로 해석해
    9시간 어긋나는 문제를 응답 경계에서 차단하기 위함.

    aware 입력은 UTC로 **변환**한다. 그냥 통과시키면 `+09:00` 을 단 문자열이 나가는데,
    순간으로는 옳아도 이 함수가 약속한 `+00:00` 형식이 아니다. 같은 순간이 표면마다
    다른 문자열로 직렬화되면 문자열 비교로 값을 잇는 소비자가 조용히 어긋난다.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC).isoformat()
    return dt.astimezone(UTC).isoformat()


def to_naive_utc(dt: datetime) -> datetime:
    """Normalize datetime to naive UTC for consistent comparison.

    tz-aware는 UTC로 변환 후 tzinfo 제거, naive는 그대로 반환.
    `TIMESTAMP WITHOUT TIME ZONE` 컬럼에 쓰거나, 이미 naive 로 모인 값끼리
    비교할 때만 쓴다. 응답 직렬화 시점에는 to_utc_iso()를 사용.
    """
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def normalize_aware_utc(value: object) -> object:
    """Pydantic 밸리데이터용 — datetime 이면 aware UTC 로, 나머지는 그대로.

    JSON 으로 영속화된 뒤 다시 읽히는 모델을 위한 것이다. `utcnow()` 가 naive 이던
    시절에 쓰인 파일은 offset 없는 문자열을 담고 있어 Pydantic 이 naive 로 파싱하는데,
    그 값을 aware 인 `utcnow()` 와 비교하면 TypeError 가 난다. 기존 배포의 데이터가
    그대로 남아 있으므로 읽는 쪽에서 흡수해야 한다.
    """
    return to_aware_utc(value) if isinstance(value, datetime) else value


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
