"""세션 만료 sweep 이 저장소를 보고 판정한다 (issue #291).

`cleanup_expired_sessions` 는 프로세스 로컬 `_session_metadata` 만 보고 삭제를
판정했다. 결함은 두 겹이다.

1. **낡은 판정** — 다른 인스턴스가 `refresh_session` 으로 연장한 세션을 이 프로세스의
   낡은 사본만 보고 지운다. #289 가 `get_session` 에 대해 고친 것과 같은 결함이다.
2. **누락** — 이 프로세스가 만진 적 없는 세션은 `_session_metadata` 에 없으므로
   애초에 sweep 대상이 아니다. 다중 인스턴스에서는 **어느 인스턴스도 정리하지
   않는 세션**이 생긴다.

메모리 모드는 단일 프로세스라 둘 다 성립하지 않는다 — 그래서 기존
`test_session_service.py` 의 cleanup 테스트 4 건으로는 이 결함이 드러나지 않는다.
여기서는 DB 모드에서 서비스 인스턴스 둘이 하나의 저장소를 본다.

`AOS_TEST_DATABASE_URL` 이 있을 때만 돈다 (`test_session_concurrency_db.py` 와
같은 이유 — 실수로 개발 DB 를 건드리지 않도록 전용 변수를 쓴다).
"""

import os
import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from db.models.base import Base
from db.repository import STATE_VERSION_KEY, SessionRepository
from services.session_service import SessionMetadata, SessionService
from utils.time import utcnow

TEST_DATABASE_URL = os.getenv("AOS_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="AOS_TEST_DATABASE_URL 미설정 — DB 모드 sweep 테스트를 건너뛴다",
)


@pytest_asyncio.fixture
async def db_factory():
    """전용 스키마 하나만 만들고 그것만 제거한다.

    `Base.metadata.drop_all()` 로 정리하면 변수가 실수로 개발 DB 를 가리켰을 때
    애플리케이션 테이블을 전부 지운다 — 변수 이름은 관례이지 보증이 아니다.
    """
    schema = f"aos_sweep_test_{uuid.uuid4().hex[:12]}"
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


@pytest_asyncio.fixture
async def services(db_factory, monkeypatch):
    """서비스 인스턴스 **둘**. 각자 캐시를 따로 들고 같은 DB 를 본다 = 프로세스 둘."""
    monkeypatch.setattr("services.session_service.async_session_factory", db_factory)
    return SessionService(use_database=True), SessionService(use_database=True)


async def _expire_in_storage(service: SessionService, session_id: str) -> None:
    """저장소의 `_metadata` 를 만료 상태로 바꾼다 (로컬 사본이 아니라)."""
    state = await service.get_session(session_id, update_activity=False)
    assert state is not None
    metadata = SessionMetadata.from_dict(state["_metadata"])
    metadata.expires_at = utcnow() - timedelta(days=1)
    state["_metadata"] = metadata.to_dict()
    await service.update_session(session_id, state)


async def _exists(service: SessionService, session_id: str) -> bool:
    return await service.get_session(session_id, update_activity=False) is not None


@pytest.mark.asyncio
async def test_sweep_finds_session_this_instance_never_cached(services):
    """이 인스턴스가 만진 적 없는 만료 세션도 정리한다.

    `_session_metadata` 키만 도는 구조에서는 A 가 만든 세션을 B 가 영영 보지 못한다 —
    다중 인스턴스에서 "어느 인스턴스도 정리하지 않는 세션" 이 그렇게 생긴다.
    """
    a, b = services
    sid = await a.create_session()
    await _expire_in_storage(a, sid)

    # B 는 이 세션을 캐시에 들고 있지 않다 — 저장소를 봐야만 찾을 수 있다.
    assert sid not in b._session_metadata

    cleaned = await b.cleanup_expired_sessions()

    assert cleaned >= 1, "저장소를 보지 않으면 이 세션은 아무도 정리하지 않는다"
    assert not await _exists(b, sid)


@pytest.mark.asyncio
async def test_sweep_ignores_stale_local_expiry(services):
    """로컬 사본이 만료라 해도 저장소가 유효하면 지우지 않는다.

    다른 인스턴스가 `refresh_session` 으로 연장하면 저장소만 갱신된다 — 이 프로세스의
    사본은 낡은 채로 남는다. 그 사본으로 판정하면 살아 있는 세션을 지운다.
    (`expires_at` 은 리스이므로 저장소가 이긴다 — #289 에서 정한 규칙이다.)
    """
    a, _ = services
    sid = await a.create_session()
    await a.get_session(sid, update_activity=False)  # A 캐시를 채운다 (아직 유효)

    # A 의 **로컬 사본만** 만료시킨다 — 저장소는 그대로다.
    a._session_metadata[sid].expires_at = utcnow() - timedelta(days=1)
    assert a._session_metadata[sid].is_expired()

    cleaned = await a.cleanup_expired_sessions()

    assert await _exists(a, sid), "낡은 로컬 사본만 보고 살아 있는 세션을 지웠다"
    assert cleaned == 0


@pytest.mark.asyncio
async def test_sweep_delete_is_conditional_on_row_version(db_factory, services):
    """판정 시점의 행 버전이 바뀌었으면 삭제하지 않는다.

    sweep 은 "훑어서 판정 → 삭제" 라 그 사이가 TOCTOU 창이다. 만료로 판정한 직후
    다른 인스턴스가 `refresh_session` 으로 연장하면, 무조건 DELETE 는 그 연장을
    지워 버린다. 조건을 건 한 문장으로 접어야 한다 (issue #292 와 같은 처방).
    """
    a, b = services
    sid = await a.create_session()
    state = await a.get_session(sid, update_activity=False)
    assert state is not None
    seen_version = state[STATE_VERSION_KEY]

    # 판정과 삭제 **사이에** 다른 인스턴스가 연장한다 → 행 버전이 올라간다.
    assert await b.refresh_session(sid) is True

    async with db_factory() as db:
        repo = SessionRepository(db)
        deleted = await repo.delete_if_version(sid, seen_version)
        await db.commit()

    assert deleted is False, "연장된 세션을 낡은 버전 기준으로 지웠다"
    assert await _exists(a, sid)


@pytest.mark.asyncio
async def test_sweep_keeps_active_sessions(services):
    """살아 있는 세션은 건드리지 않는다."""
    a, _ = services
    sid = await a.create_session()

    cleaned = await a.cleanup_expired_sessions()

    assert cleaned == 0
    assert await _exists(a, sid)


@pytest.mark.asyncio
async def test_sweep_does_not_reap_on_stored_inactivity(services):
    """DB 모드 sweep 은 `last_activity` 로 지우지 않는다 — 만료만 본다.

    `touch()` 는 **한 번도 영속화되지 않는다**(`get_session` 이 로컬 사본만 고친다).
    그래서 저장소의 `last_activity` 는 아무도 갱신하지 않는 값이고, 그것으로 비활성을
    판정하면 활발히 **읽히지만 쓰이지는 않는** 세션이 24 시간 뒤 삭제된다. 로컬
    사본을 high-water mark 로 얹는 것도 답이 아니다 — 다른 인스턴스만 관측한 활동은
    여전히 보이지 않는다. `expires_at`(리스, 실제로 영속화됨)만 권위를 가진다.
    """
    a, _ = services
    sid = await a.create_session()

    # 저장소의 활동 기록만 한참 오래된 것으로 만든다. TTL 은 그대로(유효).
    state = await a.get_session(sid, update_activity=False)
    assert state is not None
    stored_meta = SessionMetadata.from_dict(state["_metadata"])
    stored_meta.last_activity = utcnow() - timedelta(hours=72)
    state["_metadata"] = stored_meta.to_dict()
    await a.update_session(sid, state)

    cleaned = await a.cleanup_expired_sessions()

    assert await _exists(a, sid), "영속화되지 않는 활동 기록으로 살아 있는 세션을 지웠다"
    assert cleaned == 0


@pytest.mark.asyncio
async def test_sweep_reaches_beyond_the_first_page(db_factory, services):
    """앞 페이지가 전부 살아 있어도 뒤쪽의 만료 세션에 도달한다.

    `LIMIT` 한 장만 보고 끝내면, 앞을 차지한 살아 있는 세션들이 **영원히** 창 앞에
    남고 그 뒤의 만료 세션은 어느 sweep 에서도 닿지 못한다.

    커서는 기본키(`id`)이고 세션 id 는 uuid4 라 정렬 순서가 생성 순과 무관하다.
    만료 세션이 실제로 **뒤쪽 페이지**에 놓여야 이 테스트가 의미를 가지므로, 순서를
    저장소에서 읽어 마지막 것을 만료시킨다 — 전제를 가정하면 "우연히" 통과해
    아무것도 검증하지 못한다.
    """
    a, _ = services
    sids = [await a.create_session() for _ in range(4)]

    async with db_factory() as db:
        page = await SessionRepository(db).list_metadata_for_sweep(limit=10)
    order = [c.session_id for c in page]
    assert sorted(order) == sorted(sids)
    doomed = order[-1]
    alive = [s for s in sids if s != doomed]
    await _expire_in_storage(a, doomed)

    # 페이지 크기를 1 로 줄여 "앞 페이지가 전부 살아 있는" 상황을 만든다.
    cleaned = await a.cleanup_expired_sessions(limit=1)

    assert cleaned == 1, "앞 페이지가 살아 있으면 뒤쪽 만료 세션에 닿지 못한다"
    assert not await _exists(a, doomed)
    for sid in alive:
        assert await _exists(a, sid)


@pytest.mark.asyncio
async def test_sweep_survives_null_timestamps(db_factory, services):
    """시각 컬럼이 NULL 인 행이 있어도 페이지 순회가 멈추지 않는다.

    `sessions.created_at`·`updated_at` 은 **nullable** 이다(실제 스키마에서 확인).
    시각 컬럼을 커서로 쓰면 NULL 이 커서에 들어가는 순간 이후 비교가 unknown 이 되어
    다음 페이지가 통째로 비고, 그 뒤 세션은 **영영 정리되지 않는다**. 커서를 기본키로
    두는 이유다 — `id` 는 NOT NULL 이라 이 경로 자체가 없다.
    """
    a, _ = services
    sids = [await a.create_session() for _ in range(4)]

    # 앞쪽 행들의 시각을 NULL 로 만든다 — 옛 데이터·수동 백필의 모습이다.
    async with db_factory() as db:
        await db.execute(
            text("UPDATE sessions SET created_at = NULL, updated_at = NULL WHERE id = ANY(:ids)"),
            {"ids": sids[:3]},
        )
        await db.commit()
        page = await SessionRepository(db).list_metadata_for_sweep(limit=10)

    doomed = [c.session_id for c in page][-1]
    await _expire_in_storage(a, doomed)

    cleaned = await a.cleanup_expired_sessions(limit=1)

    assert cleaned == 1, "NULL 시각 행에서 페이지 순회가 멈췄다"
    assert not await _exists(a, doomed)


@pytest.mark.asyncio
async def test_sweep_tolerates_malformed_metadata(services):
    """손상된 `_metadata` 는 건너뛴다 — sweep 전체가 터지면 안 된다.

    판정을 SQL 로 내리면(`::timestamptz` 캐스팅) 손상된 값 하나가 문장 전체를
    실패시켜 정리가 영영 멈춘다. 그래서 판정은 Python 에서 하고 삭제만 조건부로 건다.
    """
    a, _ = services
    good = await a.create_session()
    bad = await a.create_session()
    await _expire_in_storage(a, good)

    state = await a.get_session(bad, update_activity=False)
    assert state is not None
    state["_metadata"] = {"session_id": bad, "expires_at": "not-a-timestamp"}
    await a.update_session(bad, state)

    cleaned = await a.cleanup_expired_sessions()

    assert cleaned >= 1, "손상된 세션 하나가 sweep 전체를 막았다"
    assert not await _exists(a, good)
    assert await _exists(a, bad), "판정 불가한 세션은 지우지 않는다"
