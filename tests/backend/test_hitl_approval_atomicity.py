"""승인 전이·소비의 원자성·내구성 회귀 테스트 (issue #283).

세 가지를 고정한다.

1. **원자성** — 승인 전이(`pending → approved`)는 세션당 직렬화된다.
   경합 창은 검사↔변경 사이가 아니라 그 위의 `engine.get_session` 에 있다:
   캐시 미스 경로가 `await` 를 포함하고(engine.py:253-261) DB 경로는 호출마다
   **새 dict** 를 돌려주므로(`repo.get_state` 가 JSONB 를 매번 디코딩),
   재시작 직후 동시 요청 두 건이 각자 사본에서 PENDING 을 보고 둘 다 통과한다.
2. **내구성** — 전이는 `engine.run` 이 그래프를 끝내기 전에 영속화된다.
   기존 코드는 `engine.run` 이 실패하면 승인이 통째로 사라졌고, deny 는
   아예 아무것도 저장하지 않았다.
3. **1회 소비(at-most-once)** — executor 는 승인을 `consumed` 로 전이해
   **도구 실행 전에** 영속화한다. 실행 도중 프로세스가 죽어도 같은 승인으로
   다시 실행되지 않는다.
"""

import asyncio
import copy
import pathlib
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

import api.websocket
from api.hitl import approve_operation, deny_operation
from models.agent_state import TaskNode, TaskStatus, create_initial_state
from models.hitl import ApprovalStatus
from orchestrator.nodes.executor import ExecutorNode
from orchestrator.nodes.orchestrator import OrchestratorNode

RISKY_ARGS = {"command": "rm -rf /tmp/scratch"}
RISKY_CALL = {"name": "execute_bash", "args": RISKY_ARGS, "id": "call-1"}
TEST_ADMIN = SimpleNamespace(id="test-admin", role="admin", is_admin=True)


# ─────────────────────────────────────────────────────────────
# Fixtures / doubles
# ─────────────────────────────────────────────────────────────


class StubEngine:
    """`OrchestrationEngine` 의 캐시·영속화 계약만 모사한다.

    핵심은 `get_session` 의 **캐시 미스 경로가 await 를 포함**하고 저장소가
    호출마다 새 사본을 돌려준다는 점이다 — 실제 엔진(engine.py:253-261)이
    DB 모드에서 갖는 성질이며, 여기가 승인 경합의 창이다.
    """

    def __init__(self, stored: dict[str, Any]):
        self._stored = stored
        self._sessions: dict[str, Any] = {}
        self.events: list[str] = []
        self.run_calls = 0
        self.run_error: Exception | None = None
        self.save_error: Exception | None = None

    async def get_session(self, session_id: str):
        if session_id in self._sessions:
            return self._sessions[session_id]
        await asyncio.sleep(0)  # DB 왕복 — 이벤트 루프가 여기서 양보한다
        state = copy.deepcopy(self._stored)
        self._sessions[session_id] = state
        return state

    async def save_session(self, session_id: str, state) -> bool:
        self.events.append("persist")
        self._sessions[session_id] = state
        if self.save_error:
            raise self.save_error
        self._stored = copy.deepcopy(state)
        return True

    async def run(self, session_id: str, user_message: str):
        self.events.append("run")
        self.run_calls += 1
        if self.run_error:
            raise self.run_error
        return self._sessions[session_id]

    # 검증 헬퍼 — 영속화된(=재시작 후에 보이는) 값만 본다
    def stored_approval(self, approval_id: str) -> dict[str, Any]:
        return self._stored["pending_approvals"][approval_id]

    def stored_task(self, task_id: str) -> TaskNode:
        return self._stored["tasks"][task_id]

    def cached_approval(self, session_id: str, approval_id: str) -> dict[str, Any]:
        return self._sessions[session_id]["pending_approvals"][approval_id]


def _waiting_state() -> dict[str, Any]:
    """승인 대기 중인 세션 state."""
    state = create_initial_state(session_id="s-283")
    task = TaskNode(id="t1", parent_id="root", title="risky", status=TaskStatus.WAITING)
    task.pending_approval_id = "a1"
    state["tasks"]["root"] = TaskNode(
        id="root", title="root", status=TaskStatus.IN_PROGRESS, children=["t1"]
    )
    state["tasks"]["t1"] = task
    state["root_task_id"] = "root"
    state["pending_approvals"] = {
        "a1": {
            "id": "a1",
            "session_id": "s-283",
            "task_id": "t1",
            "tool_name": "execute_bash",
            "tool_args": RISKY_ARGS,
            "risk_level": "high",
            "risk_description": "shell",
            "status": ApprovalStatus.PENDING.value,
            "created_at": "2026-08-19T00:00:00+00:00",
        }
    }
    state["waiting_for_approval"] = True
    return state


# ─────────────────────────────────────────────────────────────
# 1. 원자성 — 동시 승인은 한 번만 통과한다
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_concurrent_approve_resolves_once():
    """캐시가 빈 상태(재시작 직후)에서 동시 승인 두 건 → 1건만 성공한다.

    락이 없으면 둘 다 자기 사본에서 PENDING 을 보고 통과해 `engine.run` 이
    두 번 돌아간다 — 같은 승인으로 위험한 도구가 두 번 실행되는 경로다.
    """
    engine = StubEngine(_waiting_state())

    results = await asyncio.gather(
        approve_operation("s-283", "a1", None, engine, TEST_ADMIN),
        approve_operation("s-283", "a1", None, engine, TEST_ADMIN),
        return_exceptions=True,
    )

    successes = [r for r in results if not isinstance(r, Exception)]
    rejections = [r for r in results if isinstance(r, HTTPException)]

    assert len(successes) == 1, f"승인이 두 번 통과했다: {results}"
    assert len(rejections) == 1
    assert rejections[0].status_code == 400
    assert engine.run_calls == 1


@pytest.mark.asyncio
async def test_concurrent_approve_and_deny_resolves_once():
    """approve 와 deny 가 동시에 들어와도 한쪽만 이긴다."""
    engine = StubEngine(_waiting_state())

    results = await asyncio.gather(
        approve_operation("s-283", "a1", None, engine, TEST_ADMIN),
        deny_operation("s-283", "a1", None, engine, TEST_ADMIN),
        return_exceptions=True,
    )

    successes = [r for r in results if not isinstance(r, Exception)]
    rejections = [r for r in results if isinstance(r, HTTPException)]

    assert len(successes) == 1, f"두 전이가 모두 통과했다: {results}"
    # 진 쪽이 **400 으로** 거부됐는지까지 본다. 여기서 종류를 안 보면 락이
    # 다른 루프에 묶여 터진 RuntimeError 도 "거부됨"으로 통과한다.
    assert len(rejections) == 1, f"거부가 HTTPException 이 아니다: {results}"
    assert rejections[0].status_code == 400
    assert engine.stored_approval("a1")["status"] in (
        ApprovalStatus.APPROVED.value,
        ApprovalStatus.DENIED.value,
    )


# ─────────────────────────────────────────────────────────────
# 2. 내구성 — 전이는 그래프 실행 전에 저장된다
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_approval_persisted_before_graph_run():
    """승인은 `engine.run` **이전에** 영속화된다.

    그래프가 끝난 뒤에 저장하면, 도구가 부수효과를 낸 뒤 프로세스가 죽었을 때
    재시작 후 승인이 다시 PENDING 으로 보인다.
    """
    engine = StubEngine(_waiting_state())

    await approve_operation("s-283", "a1", None, engine, TEST_ADMIN)

    assert engine.events[:2] == ["persist", "run"], engine.events
    assert engine.stored_approval("a1")["status"] == ApprovalStatus.APPROVED.value
    assert engine.stored_approval("a1")["resolved_at"]


@pytest.mark.asyncio
async def test_approval_survives_failed_graph_run():
    """`engine.run` 이 실패해도 승인 전이는 남는다."""
    engine = StubEngine(_waiting_state())
    engine.run_error = RuntimeError("graph exploded")

    result = await approve_operation("s-283", "a1", None, engine, TEST_ADMIN)

    assert result["error"] == "graph exploded"
    assert engine.stored_approval("a1")["status"] == ApprovalStatus.APPROVED.value


@pytest.mark.asyncio
async def test_denial_is_persisted():
    """거부는 상태 전이와 task 실패를 함께 영속화한다.

    기존 구현은 deny 경로에서 아무것도 저장하지 않아, 재시작하면 거부한 작업이
    다시 승인 대기로 나타났다.
    """
    engine = StubEngine(_waiting_state())

    await deny_operation("s-283", "a1", None, engine, TEST_ADMIN)

    assert engine.events == ["persist"]
    assert engine.stored_approval("a1")["status"] == ApprovalStatus.DENIED.value
    assert engine.stored_task("t1").status == TaskStatus.FAILED


@pytest.mark.asyncio
async def test_consumed_approval_cannot_be_reopened():
    """소비된 승인은 다시 `approved` 로 되돌릴 수 없다.

    중복 응답(더블클릭·WebSocket 재전송)이 `consumed` 를 `approved` 로 덮으면
    executor 의 대조(`status == APPROVED`)가 다시 통과해 같은 도구가 재실행된다.
    """
    state = _waiting_state()
    state["pending_approvals"]["a1"]["status"] = ApprovalStatus.CONSUMED.value
    engine = StubEngine(state)

    with pytest.raises(HTTPException) as excinfo:
        await approve_operation("s-283", "a1", None, engine, TEST_ADMIN)

    assert excinfo.value.status_code == 400
    assert engine.run_calls == 0


def test_websocket_does_not_bypass_the_transition_gateway():
    """WebSocket 경로가 승인 레코드를 직접 쓰지 않는다.

    REST 와 WebSocket 이 전이를 각자 구현하면 검사·직렬화·영속화가 한쪽에만
    걸린다. 실제로 WebSocket 핸들러에는 PENDING 검사가 없어 소비된 승인을 다시
    열 수 있었다 — 재발하면 여기서 잡는다.
    """
    source = (pathlib.Path(api.websocket.__file__)).read_text()

    assert "resolve_approval" in source, "WebSocket 이 전이 관문을 거치지 않는다"
    assert 'approval["status"]' not in source, "WebSocket 이 승인 상태를 직접 쓴다"
    assert "get_current_user_websocket" in source, "WebSocket 인증 dependency가 없다"
    assert "await websocket_endpoint(websocket, session_id, current_user)" in source, (
        "등록된 WebSocket route가 인증된 사용자를 내부 handler에 전달하지 않는다"
    )
    assert "engine.create_session(session_id=session_id)" not in source, (
        "WebSocket이 존재하지 않는 session을 임의 생성한다"
    )


# ─────────────────────────────────────────────────────────────
# 3. 1회 소비 — 도구 실행 전에 consumed 를 영속화한다
# ─────────────────────────────────────────────────────────────


class RecordingSessionService:
    """`update_session` 호출 시점의 승인 상태를 기록한다."""

    # `SessionService` 대역이므로 그 계약을 따른다. 이 파일의 double 들은 전부
    # **in-process** 저장소를 흉내내므로 DB 모드가 아니다 — executor 의 소비
    # 경로는 DB 모드에서만 행 버전을 요구한다 (issue #292).
    use_database = False

    def __init__(self, events: list[tuple[str, Any]]):
        self.events = events

    async def get_session(self, session_id: str, update_activity: bool = True):
        return None  # 저장소에 없는 세션 — 재검증은 건너뛴다

    async def update_session(self, session_id: str, state) -> bool:
        approvals = {aid: a.get("status") for aid, a in state.get("pending_approvals", {}).items()}
        self.events.append(("persist", approvals))
        return True


@pytest.fixture
def executor_env(monkeypatch):
    monkeypatch.setattr("orchestrator.nodes.base.record_usage_best_effort", AsyncMock())
    monkeypatch.setattr("orchestrator.nodes.executor.AuditService.log", MagicMock())
    monkeypatch.setattr("orchestrator.nodes.executor.audit_task_status_change", MagicMock())
    monkeypatch.setattr("orchestrator.nodes.executor.audit_tool_executed", MagicMock())


def _executor_state() -> dict[str, Any]:
    state = create_initial_state(session_id="s-283-exec")
    task = TaskNode(id="t1", title="risky", description="do risky work")
    task.pending_approval_id = "a1"
    state["tasks"]["t1"] = task
    state["current_task_id"] = "t1"
    state["pending_approvals"] = {
        "a1": {
            "id": "a1",
            "session_id": "s-283-exec",
            "task_id": "t1",
            "tool_name": "execute_bash",
            "tool_args": RISKY_ARGS,
            "risk_level": "high",
            "risk_description": "shell",
            "status": ApprovalStatus.APPROVED.value,
            "created_at": "2026-08-19T00:00:00+00:00",
        }
    }
    state["waiting_for_approval"] = False
    return state


def _llm_response(content: str, tool_calls: list[dict[str, Any]]) -> MagicMock:
    response = MagicMock()
    response.content = content
    response.usage_metadata = {"input_tokens": 1, "output_tokens": 1}
    response.tool_calls = tool_calls
    return response


@pytest.mark.asyncio
async def test_consumption_persisted_before_tool_execution(monkeypatch, executor_env):
    """`consumed` 전이가 도구 실행보다 먼저 저장된다.

    순서가 뒤집히면 "도구는 실행됐는데 소비 기록은 없는" 창이 생기고,
    그 사이에 죽으면 재시작 후 같은 승인으로 다시 실행된다.
    """
    events: list[tuple[str, Any]] = []
    monkeypatch.setattr(
        "orchestrator.nodes.executor.get_session_service",
        lambda: RecordingSessionService(events),
    )

    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(
        side_effect=[_llm_response("", [RISKY_CALL]), _llm_response("done", [])]
    )
    node = ExecutorNode(llm=fake_llm, tools=[])
    monkeypatch.setattr(
        ExecutorNode,
        "_resolved_llm_for_state",
        lambda self, state, **kwargs: (fake_llm, "claude-sonnet-5", None),
    )

    async def _record_tool(self, tool_name, tool_args, usage_context=None):
        events.append(("tool", tool_name))
        return "ok"

    monkeypatch.setattr(ExecutorNode, "_execute_tool", _record_tool)

    result = await node.run(_executor_state())

    assert ("tool", "execute_bash") in events, f"도구가 실행되지 않았다: {events}"
    persist_index = next(i for i, (kind, _) in enumerate(events) if kind == "persist")
    tool_index = next(i for i, (kind, _) in enumerate(events) if kind == "tool")
    assert persist_index < tool_index, f"소비 기록이 실행보다 늦다: {events}"
    assert events[persist_index][1] == {"a1": ApprovalStatus.CONSUMED.value}
    assert result["pending_approvals"]["a1"]["status"] == ApprovalStatus.CONSUMED.value


@pytest.mark.asyncio
async def test_tool_not_executed_when_consumption_persist_fails(monkeypatch, executor_env):
    """소비를 기록하지 못하면 도구를 실행하지 않는다 (at-most-once)."""

    class FailingService:
        use_database = False  # in-process double (issue #292)

        async def get_session(self, session_id: str, update_activity: bool = True):
            return None

        async def update_session(self, session_id: str, state) -> bool:
            raise RuntimeError("db down")

    monkeypatch.setattr("orchestrator.nodes.executor.get_session_service", FailingService)

    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(side_effect=[_llm_response("", [RISKY_CALL])])
    node = ExecutorNode(llm=fake_llm, tools=[])
    monkeypatch.setattr(
        ExecutorNode,
        "_resolved_llm_for_state",
        lambda self, state, **kwargs: (fake_llm, "claude-sonnet-5", None),
    )
    execute_tool = AsyncMock(return_value="ok")
    monkeypatch.setattr(ExecutorNode, "_execute_tool", execute_tool)

    result = await node.run(_executor_state())

    execute_tool.assert_not_awaited()
    assert result["tasks"]["t1"].status == TaskStatus.FAILED
    # 소비는 실행 **전에** 기록하므로, 저장이 실패한 시점에는 도구가 아직 안 돌았다.
    # 전이를 되돌려야 나중에 정당하게 재시도할 수 있다.
    assert result["pending_approvals"]["a1"]["status"] == ApprovalStatus.APPROVED.value
    assert "consumed_at" not in result["pending_approvals"]["a1"]


@pytest.mark.asyncio
async def test_consumed_approval_does_not_re_authorize(monkeypatch, executor_env):
    """소비된 승인은 같은 호출을 다시 통과시키지 않는다."""
    monkeypatch.setattr(
        "orchestrator.nodes.executor.get_session_service",
        lambda: RecordingSessionService([]),
    )
    state = _executor_state()
    state["pending_approvals"]["a1"]["status"] = ApprovalStatus.CONSUMED.value

    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(side_effect=[_llm_response("", [RISKY_CALL])])
    node = ExecutorNode(llm=fake_llm, tools=[])
    monkeypatch.setattr(
        ExecutorNode,
        "_resolved_llm_for_state",
        lambda self, state, **kwargs: (fake_llm, "claude-sonnet-5", None),
    )
    execute_tool = AsyncMock(return_value="ok")
    monkeypatch.setattr(ExecutorNode, "_execute_tool", execute_tool)

    result = await node.run(state)

    execute_tool.assert_not_awaited()
    assert result["waiting_for_approval"] is True


class JitteryRecordingService:
    """쓰기 지연이 들쭉날쭉한 저장소 double.

    실제 저장은 state 를 직렬화해 세션 JSON **전체**를 덮어쓴다. 직렬화 시점과
    커밋 시점 사이에는 실제 지연이 있고 그 지연은 호출마다 다르다 — 먼저 시작한
    쓰기가 **나중에** 커밋될 수 있다. 첫 호출만 느리게 만들어 그 순서를 고정한다.
    직렬화가 없으면 늦게 커밋된 낡은 스냅샷이 다른 소비를 되돌린다.
    """

    use_database = False  # in-process double (issue #292)
    FIRST_WRITE_DELAY = 0.02

    def __init__(self) -> None:
        self.writes: list[dict[str, str]] = []
        self._calls = 0

    async def get_session(self, session_id: str, update_activity: bool = True):
        return None  # 저장소 재검증은 이 테스트의 관심사가 아니다

    async def update_session(self, session_id: str, state) -> bool:
        snapshot = {aid: a.get("status") for aid, a in state.get("pending_approvals", {}).items()}
        delay = self.FIRST_WRITE_DELAY if self._calls == 0 else 0.0
        self._calls += 1
        await asyncio.sleep(delay)
        self.writes.append(snapshot)
        return True


def _two_approved_tasks_state() -> dict[str, Any]:
    state = create_initial_state(session_id="s-283-parallel")
    for idx, (task_id, approval_id, command) in enumerate(
        (("t1", "a1", "rm -rf /tmp/one"), ("t2", "a2", "rm -rf /tmp/two")), start=1
    ):
        task = TaskNode(id=task_id, title=f"risky {idx}", description="do risky work")
        task.pending_approval_id = approval_id
        state["tasks"][task_id] = task
        state["pending_approvals"][approval_id] = {
            "id": approval_id,
            "session_id": "s-283-parallel",
            "task_id": task_id,
            "tool_name": "execute_bash",
            "tool_args": {"command": command},
            "risk_level": "high",
            "risk_description": "shell",
            "status": ApprovalStatus.APPROVED.value,
            "created_at": "2026-08-19T00:00:00+00:00",
        }
    state["waiting_for_approval"] = False
    return state


@pytest.mark.asyncio
async def test_parallel_consumption_writes_are_serialized(monkeypatch, executor_env):
    """병렬 배치에서 소비 기록이 서로를 되돌리지 않는다.

    `execute_batch` 는 executor 여럿을 같은 세션 state 위에서 동시에 돌린다.
    `update_session` 이 세션 JSON 전체를 덮으므로, 직렬화하지 않으면 늦게 도착한
    낡은 스냅샷이 다른 소비를 `approved` 로 되돌린다 — 그 직후 프로세스가 죽으면
    되살아난 승인으로 도구가 다시 실행된다.
    """
    service = JitteryRecordingService()
    monkeypatch.setattr("orchestrator.nodes.executor.get_session_service", lambda: service)
    monkeypatch.setattr(ExecutorNode, "_execute_tool", AsyncMock(return_value="ok"))

    shared = _two_approved_tasks_state()

    def _node_for(command: str) -> ExecutorNode:
        call = {"name": "execute_bash", "args": {"command": command}, "id": f"call-{command}"}
        fake_llm = MagicMock()
        fake_llm.ainvoke = AsyncMock(
            side_effect=[_llm_response("", [call]), _llm_response("done", [])]
        )
        node = ExecutorNode(llm=fake_llm, tools=[])
        # 인스턴스에 직접 건다 — 클래스에 걸면 두 노드가 같은 LLM 을 공유해
        # 응답 순서가 섞이고, 테스트가 검증하려는 병렬성이 사라진다.
        node._resolved_llm_for_state = (  # type: ignore[method-assign]
            lambda state, **kwargs: (fake_llm, "claude-sonnet-5", None)
        )
        return node

    # `ParallelExecutorNode._execute_with_semaphore` 와 같은 형태: state 는 얕은 복사라
    # `pending_approvals` 와 그 레코드들이 두 실행 사이에 공유된다.
    await asyncio.gather(
        _node_for("rm -rf /tmp/one").run({**shared, "current_task_id": "t1"}),
        _node_for("rm -rf /tmp/two").run({**shared, "current_task_id": "t2"}),
    )

    assert service.writes, "소비가 저장되지 않았다"
    assert service.writes[-1] == {
        "a1": ApprovalStatus.CONSUMED.value,
        "a2": ApprovalStatus.CONSUMED.value,
    }, f"낡은 스냅샷이 다른 소비를 되돌렸다: {service.writes}"


class StoreBackedService:
    """저장소를 흉내내는 double — 읽을 때마다 **새 사본**을 준다.

    DB 모드의 `SessionService` 가 그렇다(`repo.get_state` 가 JSONB 를 매번 디코딩).
    따라서 캐시가 비어 있으면 동시에 시작한 두 실행이 서로 독립된 state 를 든다.
    """

    use_database = False  # in-process double (issue #292)

    def __init__(self, state: dict[str, Any]):
        self.stored = state

    async def get_session(self, session_id: str, update_activity: bool = True):
        await asyncio.sleep(0)
        return copy.deepcopy(self.stored)

    async def update_session(self, session_id: str, state) -> bool:
        await asyncio.sleep(0)
        self.stored = copy.deepcopy(state)
        return True


@pytest.mark.asyncio
async def test_concurrent_runs_execute_approved_tool_once(monkeypatch, executor_env):
    """독립된 state 사본을 든 두 실행이 겹쳐도 도구는 한 번만 돈다.

    캐시가 빈 상태(재시작 직후)에서 같은 세션에 그래프 실행이 둘 겹치면 각자
    `approved` 사본을 들고 온다. 로컬 사본만 보는 검사는 둘 다 통과시키므로,
    소비 직전에 **저장소**의 승인 상태를 다시 확인해야 한다.
    """
    base = _executor_state()
    service = StoreBackedService(copy.deepcopy(base))
    monkeypatch.setattr("orchestrator.nodes.executor.get_session_service", lambda: service)
    execute_tool = AsyncMock(return_value="ok")
    monkeypatch.setattr(ExecutorNode, "_execute_tool", execute_tool)

    def _node() -> ExecutorNode:
        fake_llm = MagicMock()
        fake_llm.ainvoke = AsyncMock(
            side_effect=[_llm_response("", [RISKY_CALL]), _llm_response("done", [])]
        )
        node = ExecutorNode(llm=fake_llm, tools=[])
        node._resolved_llm_for_state = (  # type: ignore[method-assign]
            lambda state, **kwargs: (fake_llm, "claude-sonnet-5", None)
        )
        return node

    await asyncio.gather(
        _node().run(copy.deepcopy(base)),
        _node().run(copy.deepcopy(base)),
    )

    assert execute_tool.await_count == 1, "같은 승인으로 도구가 두 번 실행됐다"


@pytest.mark.asyncio
async def test_consumption_fails_closed_when_storage_lost_the_approval(monkeypatch, executor_env):
    """저장소에 세션은 있는데 그 승인이 없으면 실행하지 않는다.

    "영속 저장소가 없다"가 아니라 "이 승인은 더 이상 유효하지 않다"는 뜻이다.
    그대로 진행하면 뒤이은 전체 state 저장이 없어진 승인을 되살린 뒤 도구까지 돌린다.
    """
    stored = _executor_state()
    stored["pending_approvals"] = {}  # 저장소에는 이 승인이 없다
    monkeypatch.setattr(
        "orchestrator.nodes.executor.get_session_service",
        lambda: StoreBackedService(stored),
    )
    execute_tool = AsyncMock(return_value="ok")
    monkeypatch.setattr(ExecutorNode, "_execute_tool", execute_tool)

    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(side_effect=[_llm_response("", [RISKY_CALL])])
    node = ExecutorNode(llm=fake_llm, tools=[])
    node._resolved_llm_for_state = (  # type: ignore[method-assign]
        lambda state, **kwargs: (fake_llm, "claude-sonnet-5", None)
    )

    result = await node.run(_executor_state())

    execute_tool.assert_not_awaited()
    assert result["waiting_for_approval"] is True


@pytest.mark.asyncio
async def test_transition_rolled_back_when_persistence_fails():
    """영속화가 실패하면 전이를 되돌린다.

    되돌리지 않으면 캐시는 `approved`, 저장소는 `pending` 으로 갈라져 이후
    재시도가 400 을 받는다 — 그 승인은 영영 해소할 수 없게 된다.
    """
    engine = StubEngine(_waiting_state())
    engine.save_error = RuntimeError("db down")

    with pytest.raises(RuntimeError):
        await approve_operation("s-283", "a1", None, engine, TEST_ADMIN)

    cached = engine.cached_approval("s-283", "a1")
    assert cached["status"] == ApprovalStatus.PENDING.value
    assert engine.run_calls == 0


# ─────────────────────────────────────────────────────────────
# 4. 크래시 잔재 — 소비된 승인에 매달린 task 는 실패로 정리한다
# ─────────────────────────────────────────────────────────────


def _orphan_state(task_status: TaskStatus) -> dict[str, Any]:
    """도구 실행 도중 죽은 뒤 재시작한 state.

    소비는 영속화됐고(consumed) task 는 실행 중 상태로 남아 있다.
    """
    state = create_initial_state(session_id="s-283-orphan")
    state["tasks"]["root"] = TaskNode(
        id="root", title="root", status=TaskStatus.IN_PROGRESS, children=["t1"]
    )
    state["root_task_id"] = "root"
    task = TaskNode(id="t1", parent_id="root", title="risky", status=task_status)
    task.pending_approval_id = "a1"
    state["tasks"]["t1"] = task
    state["pending_approvals"] = {
        "a1": {
            "id": "a1",
            "task_id": "t1",
            "tool_name": "execute_bash",
            "tool_args": RISKY_ARGS,
            "status": ApprovalStatus.CONSUMED.value,
        }
    }
    return state


@pytest.mark.parametrize("task_status", [TaskStatus.IN_PROGRESS, TaskStatus.WAITING])
@pytest.mark.asyncio
async def test_orphaned_task_after_consumed_approval_fails_explicitly(task_status):
    """소비된 승인에 매달린 task 는 조용히 멈추지 않고 실패로 드러난다.

    실행 여부를 알 수 없으므로 자동 재실행은 금지다 — 대신 재승인이
    필요하다는 사실을 오류로 남긴다.
    """
    node = OrchestratorNode()

    result = await node.run(_orphan_state(task_status))

    assert result["tasks"]["t1"].status == TaskStatus.FAILED
    assert "재승인" in (result["tasks"]["t1"].error or "")
    assert result["next_action"] is None


@pytest.mark.asyncio
async def test_approved_waiting_task_still_resumes():
    """승인만 된(미소비) WAITING task 의 재개는 그대로다 (#282 회귀 방지)."""
    state = _orphan_state(TaskStatus.WAITING)
    state["pending_approvals"]["a1"]["status"] = ApprovalStatus.APPROVED.value

    result = await OrchestratorNode().run(state)

    assert result["next_action"] == "execute"
    assert result["current_task_id"] == "t1"
