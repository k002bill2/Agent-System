"""HITL 승인 소비의 **크로스 프로세스** at-most-once (issue #292).

기존 `test_hitl_approval_atomicity.py` 는 엔진 하나에 `asyncio.gather` 로 요청을
겹친다 — 그건 같은 프로세스 안의 경합이라 `APPROVAL_STATE_LOCK`(in-process
asyncio 락) 이 직렬화해 준다. 다중 레플리카에서 깨지는 것은 그 락이 **없는**
경우이고, 이 코드에게 "프로세스 둘" 은 각자의 `_session_metadata` ·
`_memory_sessions` · 엔진 캐시를 가진 **서비스 인스턴스 둘이 하나의 DB 를 보는**
상태를 뜻한다.

여기서 검증하는 명제: 두 인스턴스가 같은 승인을 동시에 소비하려 하면 **정확히
하나만** 성공하고, 진 쪽은 도구를 실행하지 않는다.

`AOS_TEST_DATABASE_URL` 이 있을 때만 돈다 (`test_session_concurrency_db.py` 와
같은 이유 — 실수로 개발 DB 를 건드리지 않도록 전용 변수를 쓴다).
"""

import asyncio
import os
import uuid
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from db.models.base import Base
from models.agent_state import AgentState
from models.hitl import APPROVAL_STATE_LOCK, ApprovalStatus
from orchestrator.nodes.executor import ExecutorNode
from services.session_service import SessionService, SessionVersionConflictError
from utils.time import utcnow

TEST_DATABASE_URL = os.getenv("AOS_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="AOS_TEST_DATABASE_URL 미설정 — 크로스 프로세스 승인 테스트를 건너뛴다",
)


@pytest_asyncio.fixture
async def db_factory():
    """전용 스키마 하나만 만들고 그것만 제거한다.

    `Base.metadata.drop_all()` 로 정리하면 변수가 실수로 개발 DB 를 가리켰을 때
    애플리케이션 테이블을 전부 지운다 — 변수 이름은 관례이지 보증이 아니다.
    """
    schema = f"aos_hitl_xproc_{uuid.uuid4().hex[:12]}"
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


@pytest.fixture
def no_shared_lock(monkeypatch):
    """`APPROVAL_STATE_LOCK` 의 상호배제를 없앤다 — **이 테스트의 핵심 장치**.

    `LoopBoundLockPool` 은 `asyncio.get_running_loop()` 로 **루프마다** 락을 하나씩
    내준다. 서비스 인스턴스를 둘 만들어도 한 테스트 루프 안에서 돌면 둘은 같은
    락을 받아 직렬화되고, 그 결과는 "크로스 프로세스 안전" 이 아니라 **in-process
    락이 막아준 것**이다. 그대로 두면 통과가 아무것도 증명하지 못한다.

    프로세스가 둘이면 공유 락은 존재하지 않는다. 매 호출마다 새 락을 내주어
    그 조건을 만든다 — 남는 방어선은 저장소(조건부 UPDATE) 하나뿐이고, 이 파일이
    검증하려는 것이 바로 그 방어선이다.
    """
    monkeypatch.setattr(APPROVAL_STATE_LOCK, "lock", lambda: asyncio.Lock())


@pytest_asyncio.fixture
async def services(db_factory, no_shared_lock, monkeypatch):
    """서비스 인스턴스 **둘**. 각자 캐시를 따로 들고 같은 DB 를 본다 = 프로세스 둘."""
    monkeypatch.setattr("services.session_service.async_session_factory", db_factory)
    return SessionService(use_database=True), SessionService(use_database=True)


APPROVAL_ID = "apr-292"


def _approval_record() -> dict[str, Any]:
    return {
        "id": APPROVAL_ID,
        "task_id": "t-292",
        "tool_name": "execute_bash",
        "tool_args": {"command": "echo aos-292"},
        "risk_level": "high",
        "status": ApprovalStatus.APPROVED.value,
        "requested_at": utcnow().isoformat(),
    }


async def _seed_approved_session(service: SessionService) -> str:
    """`approved` 승인 하나를 들고 있는 세션을 만든다."""
    sid = str(uuid.uuid4())
    await service.create_session(session_id=sid)
    state = await service.get_session(sid)
    assert state is not None
    state["pending_approvals"] = {APPROVAL_ID: _approval_record()}
    await service.update_session(sid, state)
    return sid


async def _read(service: SessionService, session_id: str) -> AgentState:
    state = await service.get_session(session_id)
    assert state is not None
    return state


async def _consume_read_state(service: SessionService, state: AgentState) -> bool:
    """이미 읽어 둔 state 로 소비를 시도한다. 소비에 성공했을 때만 True.

    읽기를 분리하는 이유: `gather` 로 "읽기+쓰기" 를 통째로 띄우면 한쪽이 완주한
    뒤에 다른 쪽이 읽어버릴 수 있고, 그러면 두 번째는 저장소에서 `consumed` 를
    보고 정상 거부한다 — 그건 경합이 아니라 순차 실행이라 아무것도 검증하지
    못한다. 진짜 창은 **둘 다 쓰기 전에 둘 다 읽은** 상태다.

    `_consume_approval` 은 저장 실패를 예외로 올린다 — 도구 실행 **전**이므로
    호출자가 task 실패로 처리한다. 여기서는 "실행하지 않았다" 로 접는다.
    """
    node = ExecutorNode(llm=None, tools=[], session_service=service)
    pending = state.get("pending_approvals", {})
    approval = pending[APPROVAL_ID]
    try:
        return await node._consume_approval(state, pending, approval)
    except SessionVersionConflictError:
        return False


async def _try_consume(service: SessionService, session_id: str) -> bool:
    """읽기부터 소비까지 한 번에 (순차 시나리오용)."""
    return await _consume_read_state(service, await _read(service, session_id))


@pytest.mark.asyncio
async def test_two_instances_consume_same_approval_only_one_wins(services):
    """두 인스턴스가 같은 승인을 동시에 소비 → 정확히 하나만 성공."""
    a, b = services
    sid = await _seed_approved_session(a)

    # **둘 다 쓰기 전에 둘 다 읽는다** — 이것이 두 프로세스가 각자 `approved` 를
    # 손에 쥔 그 창이다. 읽기를 소비와 함께 띄우면 한쪽이 완주해 버려 창이 닫힌다.
    state_a = await _read(a, sid)
    state_b = await _read(b, sid)

    results = await asyncio.gather(
        _consume_read_state(a, state_a),
        _consume_read_state(b, state_b),
        return_exceptions=True,
    )

    for r in results:
        assert not isinstance(r, BaseException), f"예상치 못한 예외: {r!r}"

    winners = [r for r in results if r is True]
    assert len(winners) == 1, (
        f"정확히 하나만 소비해야 한다 (실제 성공 {len(winners)} 건) — "
        "둘 다 성공하면 비가역 도구가 두 번 실행된다"
    )


@pytest.mark.asyncio
async def test_storage_holds_consumed_after_race(services):
    """경합이 끝난 뒤 저장소의 승인은 `consumed` 하나뿐이어야 한다."""
    a, b = services
    sid = await _seed_approved_session(a)

    state_a = await _read(a, sid)
    state_b = await _read(b, sid)
    await asyncio.gather(
        _consume_read_state(a, state_a),
        _consume_read_state(b, state_b),
        return_exceptions=True,
    )

    fresh = SessionService(use_database=True)
    stored: AgentState | None = await fresh.get_session(sid)
    assert stored is not None
    approval = stored["pending_approvals"][APPROVAL_ID]
    assert approval["status"] == ApprovalStatus.CONSUMED.value


@pytest.mark.asyncio
async def test_sequential_second_consume_is_refused(services):
    """앞선 인스턴스가 소비를 끝낸 뒤라면, 다음 인스턴스는 거부당한다."""
    a, b = services
    sid = await _seed_approved_session(a)

    assert await _try_consume(a, sid) is True
    assert await _try_consume(b, sid) is False


@pytest.mark.asyncio
async def test_unconditional_final_save_does_not_revive_consumed_approval(services):
    """그래프 최종 저장(`check_version=False`)이 소비를 되살리면 안 된다.

    `engine.run`·`engine.stream` 의 마지막 저장은 **의도적으로** 버전 검사를 끈다
    (`orchestrator/engine.py:399,558`) — 완료된 그래프의 산물이라 충돌 시 재시도가
    도구 재실행을 뜻하기 때문이다. 그 대가로 그 쓰기는 낡은 스냅샷을 통째로 덮는다.

    시나리오: 인스턴스 A 가 승인을 소비해 저장소를 `consumed` 로 만든 뒤, 인스턴스
    B 가 **소비 이전에 읽어 둔** 스냅샷(승인이 아직 `approved`)으로 그래프를 끝내고
    무조건 저장한다. 저장소가 `approved` 로 되돌아가면 그 승인은 다음 실행에서 다시
    쓰일 수 있다 — 시간을 가로지르는 at-most-once 위반이다.
    """
    a, b = services
    sid = await _seed_approved_session(a)

    stale_for_b = await _read(b, sid)  # B 는 소비 이전 상태를 손에 쥔다
    assert await _try_consume(a, sid) is True  # A 가 먼저 소비 (저장소 = consumed)

    # B 의 그래프가 끝나고 최종 state 를 무조건 저장한다.
    await b.update_session(sid, stale_for_b, check_version=False)

    fresh = SessionService(use_database=True)
    stored = await fresh.get_session(sid)
    assert stored is not None
    assert stored["pending_approvals"][APPROVAL_ID]["status"] == ApprovalStatus.CONSUMED.value, (
        "무조건 저장이 소비된 승인을 되살렸다 — 같은 승인으로 도구가 다시 실행될 수 있다"
    )
