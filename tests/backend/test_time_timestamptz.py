"""#309 회귀: naive datetime 을 timestamptz 컬럼에 쓰면 프로세스 TZ 만큼 어긋난다.

`utcnow()` 는 naive UTC 를 돌려주면서 docstring 이 "All DB columns use TIMESTAMP
WITHOUT TIME ZONE" 이라고 적고 있었다. 실측은 그 반대다 — `DateTime(timezone=True)`
컬럼이 96 개, naive 컬럼은 `config_versions` 의 2 개뿐이다.

asyncpg 는 naive datetime 을 timestamptz 에 넣을 때 **프로세스 로컬 타임존**으로
해석한다. 변환은 클라이언트에서 일어나므로 서버의 `TimeZone` 설정으로는 못 고친다.

여기 테스트가 TZ 를 강제로 고정하는 것이 핵심이다. 주변 TZ 에 맡기면 UTC 로 도는
CI 에서는 오프셋이 0 이라 **영원히 초록**이고, 회귀를 잡지 못한다 (#291 이 겪은
"틀린 이유로 통과" 와 같은 함정).
"""

import os
import tempfile
import time
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from auth.token_service import TokenService
from db.models.base import Base
from db.models.session import SessionModel
from db.repository import SessionRepository
from models.config_version import ConfigVersion
from models.organization import MemberUsageRecord, OrganizationInvitation
from models.playground import PlaygroundMessage, PlaygroundSession
from models.rate_limit import RateLimitOverride
from services.session_service import SessionMetadata
from utils.time import to_aware_utc, to_utc_iso, utcnow

TEST_DATABASE_URL = os.getenv("AOS_TEST_DATABASE_URL")

# UTC 가 아닌 고정 오프셋. DST 가 없어 계산이 흔들리지 않는다.
NON_UTC_TZ = "Asia/Seoul"
OFFSET_SECONDS = 9 * 3600


def _as_aware(dt: datetime) -> datetime:
    """naive 는 백엔드 컨벤션대로 UTC 로 간주한다."""
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


# --------------------------------------------------------------------------
# DB 없이 도는 계약 — 모든 환경에서 실행된다
# --------------------------------------------------------------------------


def test_utcnow_is_timezone_aware():
    """`utcnow()` 는 aware 여야 한다 — 쓰기 대상의 절대다수가 timestamptz 다."""
    now = utcnow()
    assert now.tzinfo is not None, "utcnow() 가 naive 면 timestamptz 에서 TZ 만큼 어긋난다"
    assert now.utcoffset() == timedelta(0)


def test_session_metadata_reads_legacy_naive_strings():
    """이미 저장된 세션의 `_metadata` 는 offset 없는 naive 문자열이다.

    `utcnow()` 를 aware 로 바꾸면 그 문자열을 그대로 파싱한 naive 값과 비교하게 되어
    `is_expired()` 가 TypeError 로 죽는다. 읽는 쪽이 정규화해야 기존 세션이 산다.
    (`session_service.py` 의 except 절은 KeyError/ValueError 만 잡는다 — TypeError 는
    그대로 올라온다.)
    """
    legacy = {
        "session_id": "legacy-1",
        # offset suffix 없음 = 구버전이 남긴 형식
        "created_at": "2026-01-01T00:00:00",
        "last_activity": "2026-01-01T00:00:00",
        "expires_at": "2099-01-01T00:00:00",
    }
    metadata = SessionMetadata.from_dict(legacy)

    assert metadata.is_expired() is False
    assert metadata.is_inactive() is True
    metadata.touch()
    assert metadata.is_inactive() is False


def test_session_metadata_survives_a_write_read_roundtrip():
    """`to_dict()` 가 쓴 문자열을 `from_dict()` 가 같은 순간으로 되읽어야 한다.

    이 값들은 `state_json` 에 실려 `serialize_state`/`deserialize_state` 왕복을
    탄다. 레거시(naive) 입력만 검증하면 정작 이번에 바뀐 **새로 쓰는** 형식의
    왕복이 비어 있는 채로 남는다.
    """
    before = SessionMetadata(
        session_id="rt-1",
        created_at=utcnow(),
        last_activity=utcnow(),
        expires_at=utcnow() + timedelta(days=1),
    )
    after = SessionMetadata.from_dict(before.to_dict())

    for field in ("created_at", "last_activity", "expires_at"):
        original, restored = getattr(before, field), getattr(after, field)
        assert restored == original, f"{field} 왕복에서 순간이 바뀌었다"
        assert restored.tzinfo is not None, f"{field} 가 naive 로 돌아왔다"
    assert after.is_expired() is False


def test_to_utc_iso_always_emits_utc_offset():
    """aware 입력이 UTC 가 아니어도 `+00:00` 형식으로 나가야 한다.

    통과시키면 같은 순간이 표면마다 다른 문자열이 되어, 문자열로 값을 잇는
    소비자가 조용히 어긋난다.
    """
    kst = datetime(2026, 8, 25, 16, 28, tzinfo=ZoneInfo("Asia/Seoul"))
    emitted = to_utc_iso(kst)

    assert emitted is not None and emitted.endswith("+00:00"), emitted
    assert datetime.fromisoformat(emitted) == kst  # 같은 순간이어야 한다
    assert to_utc_iso(None) is None


def test_legacy_json_records_normalize_to_aware():
    """JSON 으로 영속화됐다 다시 읽히는 모델은 구버전 문자열을 흡수해야 한다.

    `utcnow()` 가 naive 이던 시절에 쓰인 파일은 offset 없는 문자열을 담고 있다.
    Pydantic 이 그것을 naive 로 파싱하면 aware 인 `utcnow()` 와 비교되는 순간
    TypeError 가 나고, 기존 데이터가 있는 배포에서 통계·초대 수락이 죽는다.
    """
    legacy = "2026-01-01T00:00:00"  # offset suffix 없음

    invitation = OrganizationInvitation(
        id="i", organization_id="o", email="a@b.co", invited_by="u",
        expires_at="2099-01-01T00:00:00", created_at=legacy,
    )
    assert invitation.expires_at.tzinfo is not None
    assert invitation.expires_at > utcnow()  # 비교가 TypeError 없이 성립한다

    usage = MemberUsageRecord(organization_id="o", user_id="u", timestamp=legacy)
    assert usage.timestamp.tzinfo is not None
    assert usage.timestamp < utcnow()


def test_rate_limit_override_normalizes_naive_api_input():
    """`expires_at` 은 API 쿼리 파라미터라 offset 없는 값이 들어올 수 있다."""
    override = RateLimitOverride(identifier="u", expires_at="2099-01-01T00:00:00")

    assert override.expires_at is not None and override.expires_at.tzinfo is not None
    assert override.expires_at > utcnow()


def test_config_version_stays_naive():
    """`config_versions` 는 naive 컬럼이다 — 그 모델만 aware 규칙에서 빠진다.

    aware 를 기본값으로 두면 DB 에서 읽어온 naive 행과 섞여 정렬이 죽는다.
    """
    version = ConfigVersion(id="v1", config_type="agent", config_id="a", version=1)
    assert version.created_at.tzinfo is None


def test_playground_session_sorts_legacy_and_new_together():
    """레거시 세션과 새 세션을 섞어 정렬해도 죽지 않아야 한다.

    `playground_sessions.json` 은 `utcnow()` 가 naive 이던 시절에 쓰였다. 정규화가
    없으면 파일에서 읽은 naive 와 새로 만든 aware 가 섞여 `list_sessions()` 의
    정렬이 TypeError 로 죽고 목록이 통째로 안 나온다.
    """
    legacy = PlaygroundSession(
        name="legacy", user_id="u",
        created_at="2026-02-05T00:59:49.044250",   # offset 없음 = 구버전 형식
        updated_at="2026-04-23T13:42:57.712906",
    )
    assert legacy.updated_at.tzinfo is not None

    fresh = PlaygroundSession(name="fresh", user_id="u")
    ordered = sorted([legacy, fresh], key=lambda x: x.updated_at, reverse=True)
    assert ordered[0].name == "fresh"


# JSON 파일로 영속화됐다 다시 읽히는 모델들. 그 파일에는 `utcnow()` 가 naive 이던
# 시절의 offset 없는 문자열이 남아 있으므로, 읽는 쪽이 aware 로 흡수해야 한다.
# 새로 JSON 에 영속화되는 모델을 추가하면 여기에도 넣는다.
JSON_PERSISTED_MODELS = [
    (PlaygroundSession, {"name": "n", "user_id": "u"}, "updated_at"),
    (PlaygroundMessage, {"role": "user", "content": "c"}, "timestamp"),
    (MemberUsageRecord, {"organization_id": "o", "user_id": "u"}, "timestamp"),
    (OrganizationInvitation,
     {"id": "i", "organization_id": "o", "email": "a@b.co", "invited_by": "u",
      "expires_at": "2099-01-01T00:00:00"}, "created_at"),
    (RateLimitOverride, {"identifier": "u"}, "created_at"),
]


@pytest.mark.parametrize("model, kwargs, field", JSON_PERSISTED_MODELS)
def test_json_persisted_models_absorb_naive_timestamps(model, kwargs, field):
    """offset 없는 문자열을 넣어도 aware 로 나와야 한다."""
    instance = model(**{**kwargs, field: "2026-01-01T00:00:00"})
    value = getattr(instance, field)

    assert value.tzinfo is not None, f"{model.__name__}.{field} 가 naive 로 남았다"
    assert value < utcnow()  # 비교가 TypeError 없이 성립한다


@pytest.mark.parametrize(
    "stored_expiry",
    [
        pytest.param(datetime(2099, 1, 1, tzinfo=UTC), id="timestamptz-컬럼(aware)"),
        pytest.param(datetime(2099, 1, 1), id="naive-컬럼(마이그레이션 경로)"),
    ],
)
def test_invitation_expiry_compares_under_either_schema(stored_expiry):
    """초대 만료 비교는 컬럼이 어느 쪽으로 만들어졌든 성립해야 한다.

    `project_invitations.expires_at` 은 모델상 `timestamptz` 지만 마이그레이션
    `f3a8b2c1d4e5` 는 `TIMESTAMP WITHOUT TIME ZONE` 으로 만든다. 스키마가 어떻게
    만들어졌는지에 따라 asyncpg 가 aware 를 주기도 naive 를 주기도 한다.
    (드리프트 자체는 #310 에서 따로 다룬다.)
    """
    assert to_aware_utc(stored_expiry) > utcnow()
    assert to_aware_utc(stored_expiry).tzinfo is not None


def test_file_mtime_is_read_as_utc():
    """파일 mtime 은 `tz=UTC` 로 읽어야 한다.

    `datetime.fromtimestamp(x)` 는 **로컬 시각** naive 를 준다. aware 인 `utcnow()` 와
    비교하면 TypeError 고, 설령 비교가 됐더라도 UTC 가 아닌 값끼리 재는 셈이다
    (`ProjectDiscovery.scan_project` 이 그 경로였다).
    """
    with tempfile.NamedTemporaryFile() as f:
        mtime = os.stat(f.name).st_mtime

    naive = datetime.fromtimestamp(mtime)
    aware = datetime.fromtimestamp(mtime, UTC)

    assert aware.tzinfo is not None
    assert aware < utcnow() + timedelta(seconds=5)  # 비교가 성립한다
    with pytest.raises(TypeError):
        _ = naive > utcnow()  # tz 를 빠뜨리면 이렇게 죽는다


def test_jwt_expiry_decodes_as_aware(monkeypatch):
    """JWT 의 exp/iat 는 epoch UTC 다 — `tz=UTC` 로 읽어야 TTL 계산이 산다.

    `TokenService.blacklist_token` 이 `expires_at - utcnow()` 를 하므로, naive 로
    읽으면 Redis 블랙리스트 기록 전에 TypeError 로 죽는다.
    """
    from config import get_settings

    monkeypatch.setenv("SESSION_SECRET_KEY", "x" * 48)
    get_settings.cache_clear()
    try:
        service = TokenService()
        decoded = service.verify_token(service.create_access_token("u"))

        assert decoded is not None
        assert decoded.exp.tzinfo is not None and decoded.iat.tzinfo is not None
        # blacklist_token 의 TTL 계산과 같은 식
        assert int((decoded.exp - utcnow()).total_seconds()) > 0
    finally:
        get_settings.cache_clear()


def test_api_date_filters_compare_against_aware_records():
    """offset 없는 날짜 필터가 들어와도 aware 레코드와 비교돼야 한다.

    FastAPI 는 offset 없는 ISO 를 naive 로 파싱한다. 레코드의 `created_at` 은
    `utcnow()` 가 만든 aware 라 그대로 재면 TypeError 다.
    """
    created_at = utcnow()
    naive_bound = datetime(2020, 1, 1)  # 클라이언트가 offset 없이 보낸 값

    with pytest.raises(TypeError):
        _ = created_at < naive_bound  # 정규화 없이는 이렇게 죽는다

    assert created_at > to_aware_utc(naive_bound)


# --------------------------------------------------------------------------
# 실제 timestamptz 왕복 — Postgres 가 있을 때만
# --------------------------------------------------------------------------

pg = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="AOS_TEST_DATABASE_URL 미설정 — timestamptz 왕복 테스트를 건너뛴다",
)


@pytest.fixture
def forced_non_utc_tz():
    """프로세스 TZ 를 UTC 가 아닌 값으로 고정한다.

    asyncpg 의 naive->timestamptz 변환은 인코딩 시점의 프로세스 TZ 를 쓴다.
    주변 환경에 맡기면 UTC 로 도는 CI 에서 이 테스트가 무의미해진다.
    """
    original = os.environ.get("TZ")
    os.environ["TZ"] = NON_UTC_TZ
    time.tzset()
    assert time.timezone != 0, "TZ 고정 실패 — 이 테스트는 UTC 가 아닌 TZ 를 전제한다"
    try:
        yield
    finally:
        if original is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = original
        time.tzset()


@pytest_asyncio.fixture
async def db_factory(forced_non_utc_tz):
    """전용 스키마 하나만 만들고 그것만 제거한다.

    `Base.metadata.drop_all()` 로 정리하면 변수가 실수로 개발 DB 를 가리켰을 때
    애플리케이션 테이블을 전부 지운다 — 변수 이름은 관례이지 보증이 아니다.
    """
    schema = f"aos_tz_test_{uuid.uuid4().hex[:12]}"
    admin = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))

    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": schema}},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin.dispose()


@pg
@pytest.mark.asyncio
async def test_utcnow_roundtrips_through_timestamptz(db_factory):
    """`utcnow()` 로 쓴 값이 읽을 때 같은 순간이어야 한다."""
    session_id = f"tz-{uuid.uuid4().hex[:8]}"
    written = utcnow()

    async with db_factory() as db:
        db.add(SessionModel(id=session_id, status="active", state_json={}, updated_at=written))
        await db.commit()

    async with db_factory() as db:
        stored = (
            await db.execute(select(SessionModel.updated_at).where(SessionModel.id == session_id))
        ).scalar_one()

    # 저장된 값은 aware 로 돌아온다. 같은 순간이면 차이가 0 이다.
    skew = abs((stored - _as_aware(written)).total_seconds())
    assert skew < 1, (
        f"timestamptz 왕복에서 {skew}초 어긋났다 "
        f"(프로세스 TZ 오프셋 {OFFSET_SECONDS}초와 비교하라)"
    )


@pg
@pytest.mark.asyncio
async def test_update_state_cannot_write_a_timestamp_older_than_creation(db_factory):
    """갱신이 생성보다 과거일 수는 없다.

    `created_at` 은 컬럼 기본값(aware)이, `updated_at` 은 `update_state` 의
    `utcnow()` 가 쓴다. 시계가 둘로 갈리면 UTC 가 아닌 TZ 에서 갱신 시각이
    생성 시각보다 오프셋만큼 **과거**가 되어 `ORDER BY updated_at` 이 뒤집힌다.
    """
    session_id = f"tz-{uuid.uuid4().hex[:8]}"

    async with db_factory() as db:
        db.add(SessionModel(id=session_id, status="active", state_json={}))
        await db.commit()

    async with db_factory() as db:
        repo = SessionRepository(db)
        await repo.update_state(session_id, {"touched": True})
        await db.commit()

    async with db_factory() as db:
        row = (
            await db.execute(
                select(SessionModel.created_at, SessionModel.updated_at).where(
                    SessionModel.id == session_id
                )
            )
        ).one()

    created_at, updated_at = row
    assert updated_at >= created_at, (
        f"갱신 시각이 생성 시각보다 과거다 (차이 {(created_at - updated_at).total_seconds()}초)"
    )
