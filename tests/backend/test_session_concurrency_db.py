"""세션 state 낙관적 동시성 — 실제 DB 가 있어야 검증되는 것들 (issue #292).

메모리 모드로는 이 시나리오를 만들 수 없다. `deserialize_state` 가 저장된 객체를
그대로 돌려주므로(#289 에서 확인) 저장소와 로컬 사본이 분리되지 않고, 조건부
UPDATE 가 행을 잡지 못하는 상황 자체가 재현되지 않는다.

`AOS_TEST_DATABASE_URL` 이 있을 때만 돈다 — 실수로 개발 DB 를 건드리지 않도록
전용 변수를 쓴다. CI 는 Postgres 서비스를 띄우므로 실제로 돈다.
"""

import asyncio
import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db.models.base import Base
from db.repository import STATE_VERSION_KEY, SessionRepository, StateWriteResult
from models.agent_state import create_initial_state
from services.session_service import SessionService, SessionVersionConflictError

TEST_DATABASE_URL = os.getenv("AOS_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="AOS_TEST_DATABASE_URL 미설정 — DB 모드 동시성 테스트를 건너뛴다",
)


@pytest_asyncio.fixture
async def db_factory():
    """테스트 전용 엔진 + 테이블. 끝나면 스키마를 지운다."""
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=None)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


@pytest_asyncio.fixture
async def service(db_factory, monkeypatch):
    monkeypatch.setattr("services.session_service.async_session_factory", db_factory)
    return SessionService(use_database=True)


async def _new_session(service: SessionService) -> str:
    return await service.create_session(session_id=str(uuid.uuid4()))


@pytest.mark.asyncio
async def test_read_stamps_row_version(service):
    sid = await _new_session(service)

    state = await service.get_session(sid)

    assert state is not None
    assert isinstance(state.get(STATE_VERSION_KEY), int)


@pytest.mark.asyncio
async def test_write_advances_version_on_caller_state(service):
    """쓰기 성공 후 호출자 state 의 버전이 올라야 같은 state 로 또 쓸 수 있다."""
    sid = await _new_session(service)
    state = await service.get_session(sid)
    first = state[STATE_VERSION_KEY]

    await service.update_session(sid, state)

    assert state[STATE_VERSION_KEY] == first + 1
    # 아무도 끼어들지 않았으니 같은 state 로 다시 써도 충돌하면 안 된다
    await service.update_session(sid, state)


@pytest.mark.asyncio
async def test_stale_write_conflicts(service):
    """겹친 read-modify-write 중 늦은 쪽은 통과하지 못한다."""
    sid = await _new_session(service)
    first = await service.get_session(sid)
    second = await service.get_session(sid)  # 같은 버전을 본 두 번째 독자

    first["iteration_count"] = 1
    await service.update_session(sid, first)

    second["iteration_count"] = 99
    with pytest.raises(SessionVersionConflictError):
        await service.update_session(sid, second)

    # 앞선 쓰기가 살아 있어야 한다 — 이것이 lost update 가 없다는 증거다
    reloaded = await service.get_session(sid)
    assert reloaded["iteration_count"] == 1


@pytest.mark.asyncio
async def test_unversioned_write_is_last_writer_wins(service):
    """`check_version=False` 는 낡은 스냅샷이어도 덮어쓴다 (그래프 최종 저장 경로)."""
    sid = await _new_session(service)
    stale = await service.get_session(sid)
    fresh = await service.get_session(sid)

    fresh["iteration_count"] = 1
    await service.update_session(sid, fresh)

    stale["iteration_count"] = 99
    await service.update_session(sid, stale, check_version=False)

    reloaded = await service.get_session(sid)
    assert reloaded["iteration_count"] == 99


@pytest.mark.asyncio
async def test_mutate_session_retries_until_it_wins(service):
    """`mutate_session` 은 충돌하면 다시 읽어 재시도한다 — 두 변경이 모두 남는다."""
    sid = await _new_session(service)
    interfered = {"done": False}

    async def _bump(state):
        # 첫 시도 때만 다른 writer 가 끼어든다 → 이 쓰기는 충돌해야 한다
        if not interfered["done"]:
            interfered["done"] = True
            other = await service.get_session(sid)
            other["context"] = {**other.get("context", {}), "other": True}
            await service.update_session(sid, other)
        state["iteration_count"] = state.get("iteration_count", 0) + 1
        return state

    result = await service.mutate_session(sid, _bump)

    assert result is not None
    reloaded = await service.get_session(sid)
    assert reloaded["iteration_count"] == 1
    assert reloaded["context"]["other"] is True  # 끼어든 쓰기도 살아 있다


@pytest.mark.asyncio
async def test_missing_row_is_distinguished_from_conflict(db_factory):
    """행 없음과 버전 불일치는 호출자의 대응이 달라 구분돼야 한다."""
    async with db_factory() as db:
        repo = SessionRepository(db)
        outcome, version = await repo.update_state(
            "no-such-session", create_initial_state(session_id="x"), expected_version=1
        )

    assert outcome is StateWriteResult.MISSING
    assert version is None


@pytest.mark.asyncio
async def test_concurrent_writers_only_one_wins(service):
    """동시에 출발한 두 쓰기 중 하나만 성공한다."""
    sid = await _new_session(service)
    a = await service.get_session(sid)
    b = await service.get_session(sid)

    async def _write(state, value):
        state["iteration_count"] = value
        try:
            await service.update_session(sid, state)
            return "ok"
        except SessionVersionConflictError:
            return "conflict"

    results = await asyncio.gather(_write(a, 1), _write(b, 2))

    assert sorted(results) == ["conflict", "ok"]
