"""승인 후 재개 라우팅 회귀 테스트 (issue #282).

승인 API 는 `engine.run` 으로 그래프를 재개하지만, 그래프 진입점은 항상
`OrchestratorNode` 이고 그 노드는 `TaskStatus.PENDING` 인 task 만 실행 대상으로
골랐다. 승인 대기 task 는 `WAITING`(executor.py 가 유일한 writer)이므로
승인해도 executor 로 돌아가지 못하고 그래프가 그대로 끝났다.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from models.agent_state import TaskNode, TaskStatus, create_initial_state
from models.hitl import ApprovalStatus
from orchestrator.graph import compile_graph, create_orchestrator_graph
from orchestrator.nodes.executor import ExecutorNode
from orchestrator.nodes.orchestrator import OrchestratorNode
from orchestrator.parallel_executor import ParallelExecutorNode

RISKY_CALL = {"name": "execute_bash", "args": {"command": "rm -rf /tmp/scratch"}, "id": "call-1"}


def _response(content: str, tool_calls: list[dict[str, Any]]) -> MagicMock:
    response = MagicMock()
    response.content = content
    response.usage_metadata = {"input_tokens": 1, "output_tokens": 1}
    response.tool_calls = tool_calls
    return response


def _state_with_waiting_task(approval_status: str | None) -> dict[str, Any]:
    """승인 대기 상태에서 재진입한 state 를 만든다.

    `approval_status` 가 None 이면 승인 레코드 자체가 없는(dangling) 경우다.
    """
    state = create_initial_state(session_id="s-resume")
    state["tasks"]["root"] = TaskNode(
        id="root", title="root", status=TaskStatus.IN_PROGRESS, children=["t1"]
    )
    state["root_task_id"] = "root"

    task = TaskNode(id="t1", parent_id="root", title="risky", status=TaskStatus.WAITING)
    task.pending_approval_id = "approval-1"
    state["tasks"]["t1"] = task

    if approval_status is not None:
        state["pending_approvals"] = {
            "approval-1": {
                "id": "approval-1",
                "task_id": "t1",
                "tool_name": "execute_bash",
                "tool_args": RISKY_CALL["args"],
                "status": approval_status,
            }
        }
    state["waiting_for_approval"] = False  # approve_operation 이 해제한 상태
    return state


class TestOrchestratorResumeSelection:
    """승인된 WAITING task 를 다시 실행 대상으로 고르는지."""

    @pytest.mark.asyncio
    async def test_approved_waiting_task_is_routed_to_executor(self):
        state = _state_with_waiting_task(ApprovalStatus.APPROVED.value)

        out = await OrchestratorNode(llm=None).run(state)

        assert out["next_action"] == "execute"
        assert out["current_task_id"] == "t1"

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status",
        [
            ApprovalStatus.PENDING.value,
            ApprovalStatus.DENIED.value,
            ApprovalStatus.EXPIRED.value,
            None,  # 승인 레코드 없음(dangling id)
        ],
    )
    async def test_unapproved_waiting_task_is_not_routed(self, status):
        """APPROVED 가 아니면 실행 대상이 아니다 — 'PENDING 이 아님' 이 아니라 'APPROVED 임'."""
        state = _state_with_waiting_task(status)

        out = await OrchestratorNode(llm=None).run(state)

        assert out["next_action"] is None
        assert out.get("current_task_id") is None

    @pytest.mark.asyncio
    async def test_waiting_task_without_approval_id_is_not_routed(self):
        """pending_approval_id 가 없는 WAITING task 는 선택되지 않는다."""
        state = _state_with_waiting_task(ApprovalStatus.APPROVED.value)
        state["tasks"]["t1"].pending_approval_id = None

        out = await OrchestratorNode(llm=None).run(state)

        assert out["next_action"] is None


class TestParallelExecutorResumeSelection:
    """병렬 경로도 같은 조건을 따라야 한다."""

    @pytest.mark.asyncio
    async def test_approved_waiting_task_is_included_in_batch(self, monkeypatch):
        state = _state_with_waiting_task(ApprovalStatus.APPROVED.value)
        state["batch_task_ids"] = ["t1"]

        node = ParallelExecutorNode(llm=None, tools=[])
        executed = AsyncMock(return_value={"task_id": "t1", "result": {}})
        monkeypatch.setattr(ParallelExecutorNode, "_execute_with_semaphore", executed)

        await node.run(state)

        executed.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_denied_waiting_task_is_excluded_from_batch(self, monkeypatch):
        state = _state_with_waiting_task(ApprovalStatus.DENIED.value)
        state["batch_task_ids"] = ["t1"]

        node = ParallelExecutorNode(llm=None, tools=[])
        executed = AsyncMock(return_value={"task_id": "t1", "result": {}})
        monkeypatch.setattr(ParallelExecutorNode, "_execute_with_semaphore", executed)

        await node.run(state)

        executed.assert_not_awaited()


@pytest.fixture
def graph_env(monkeypatch):
    """그래프를 부작용 없이 돌리기 위한 공통 패치."""
    monkeypatch.setattr("orchestrator.nodes.base.record_usage_best_effort", AsyncMock())
    monkeypatch.setattr("orchestrator.nodes.executor.AuditService.log", MagicMock())
    monkeypatch.setattr("orchestrator.nodes.executor.audit_task_status_change", MagicMock())
    monkeypatch.setattr("orchestrator.nodes.executor.audit_tool_executed", MagicMock())


def _build_graph(monkeypatch, responses: list[MagicMock]):
    """실제 orchestrator·executor 를 쓰고 planner/reviewer 는 대역으로 채운 그래프."""
    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(side_effect=responses)

    executor = ExecutorNode(llm=fake_llm, tools=[])
    monkeypatch.setattr(
        ExecutorNode,
        "_resolved_llm_for_state",
        lambda self, state, **kwargs: (fake_llm, "claude-sonnet-5", None),
    )
    execute_tool = AsyncMock(return_value="tool ok")
    monkeypatch.setattr(ExecutorNode, "_execute_tool", execute_tool)

    async def _reviewer_run(state):
        """리뷰는 범위 밖 — root 를 완료 처리해 그래프를 끝낸다."""
        root = state["tasks"][state["root_task_id"]]
        root.status = TaskStatus.COMPLETED
        return {"tasks": {root.id: root}}

    planner = MagicMock()
    planner.run = AsyncMock(return_value={})
    reviewer = MagicMock()
    reviewer.run = _reviewer_run

    graph = create_orchestrator_graph(
        orchestrator_node=OrchestratorNode(llm=None),
        planner_node=planner,
        executor_node=executor,
        reviewer_node=reviewer,
    )
    return compile_graph(graph), execute_tool


class TestApprovalResumeEndToEnd:
    """compiled graph 를 실제로 통과하는 승인 왕복."""

    @pytest.mark.asyncio
    async def test_approved_tool_runs_exactly_once_and_task_completes(
        self, monkeypatch, graph_env
    ):
        """승인 생성 → 승인 → 도구가 정확히 한 번 실행 → task COMPLETED."""
        compiled, execute_tool = _build_graph(
            monkeypatch,
            [
                _response("", [RISKY_CALL]),  # 1차: 승인 요청하고 멈춤
                _response("", [RISKY_CALL]),  # 재개: 같은 호출 → 승인 대조 통과
                _response("done", []),  # 도구 실행 후 마무리
            ],
        )

        state = create_initial_state(session_id="s-e2e")
        state["tasks"]["root"] = TaskNode(
            id="root", title="root", status=TaskStatus.IN_PROGRESS, children=["t1"]
        )
        state["root_task_id"] = "root"
        state["tasks"]["t1"] = TaskNode(id="t1", parent_id="root", title="risky")

        paused = await compiled.ainvoke(state)

        assert paused["waiting_for_approval"] is True
        assert paused["tasks"]["t1"].status == TaskStatus.WAITING
        execute_tool.assert_not_awaited()

        # api/hitl.py 의 approve_operation 이 state 에 가하는 변경
        approval_id = next(iter(paused["pending_approvals"]))
        paused["pending_approvals"][approval_id]["status"] = ApprovalStatus.APPROVED.value
        paused["waiting_for_approval"] = False

        resumed = await compiled.ainvoke(paused)

        execute_tool.assert_awaited_once()
        assert resumed["tasks"]["t1"].status == TaskStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_second_risky_call_requires_its_own_approval(self, monkeypatch, graph_env):
        """승인 소비 후 두 번째 위험 호출은 새 승인을 받아야 한다.

        PR #279 의 1회용 소비(`task.pending_approval_id = None`)와 이 변경이
        맞물리는 지점이다 — 재개 조건이 소비된 승인으로 다시 열리면 안 된다.
        """
        second_call = {
            "name": "execute_bash",
            "args": {"command": "chmod 777 /tmp/x"},
            "id": "call-2",
        }
        compiled, execute_tool = _build_graph(
            monkeypatch,
            [
                _response("", [RISKY_CALL]),  # 1차: 승인 요청
                _response("", [RISKY_CALL]),  # 재개: 승인 대조 통과 → 실행
                _response("", [second_call]),  # 같은 루프에서 두 번째 위험 호출
            ],
        )

        state = create_initial_state(session_id="s-e2e-2")
        state["tasks"]["root"] = TaskNode(
            id="root", title="root", status=TaskStatus.IN_PROGRESS, children=["t1"]
        )
        state["root_task_id"] = "root"
        state["tasks"]["t1"] = TaskNode(id="t1", parent_id="root", title="risky")

        paused = await compiled.ainvoke(state)
        approval_id = next(iter(paused["pending_approvals"]))
        paused["pending_approvals"][approval_id]["status"] = ApprovalStatus.APPROVED.value
        paused["waiting_for_approval"] = False

        resumed = await compiled.ainvoke(paused)

        assert execute_tool.await_count == 1, "승인받은 호출만 실행돼야 한다"
        assert resumed["waiting_for_approval"] is True
        assert resumed["tasks"]["t1"].status == TaskStatus.WAITING
