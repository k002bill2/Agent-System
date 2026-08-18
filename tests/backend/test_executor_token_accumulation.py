"""ExecutorNode 멀티 iteration 토큰 누적 회귀 테스트 (issue #275).

`_extract_and_update_tokens` 는 넘겨받은 state 의 누계 위에 이번 회차를 더해
새 dict 를 돌려주는 함수형 갱신자다. 루프가 매 회차 같은 state 를 넘기면
반환값은 항상 "원래 누계 + 이번 회차"라서, 마지막 회차만 반환 state 에 남는다.

원장(ledger) 기록은 회차 델타(`_last_token_update`)를 읽으므로 영향받지 않는다 —
이 테스트는 state 누계와 ledger 기록을 함께 검증해 그 경계를 고정한다.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from models.agent_state import TaskNode, create_initial_state
from orchestrator.nodes.executor import ExecutorNode

# 회차별 토큰 사용량 — 합계가 회차 값과 구분되도록 서로 다른 수를 쓴다.
FIRST_USAGE = {"input_tokens": 10, "output_tokens": 20}
SECOND_USAGE = {"input_tokens": 5, "output_tokens": 7}
RESOLVED_MODEL = "claude-sonnet-5"


def _response(content: str, usage: dict[str, int], tool_calls: list[dict[str, Any]]) -> MagicMock:
    response = MagicMock()
    response.content = content
    response.usage_metadata = usage
    response.tool_calls = tool_calls
    return response


@pytest.fixture
def executor_state():
    state = create_initial_state(session_id="session-token-accumulation")
    state["tasks"]["task-1"] = TaskNode(id="task-1", title="Task 1", description="do work")
    state["current_task_id"] = "task-1"
    return state


@pytest.fixture
def usage_recorder(monkeypatch):
    """ledger 기록을 가로채 회차별 인자를 캡처한다."""
    recorder = AsyncMock()
    monkeypatch.setattr("orchestrator.nodes.base.record_usage_best_effort", recorder)
    monkeypatch.setattr("orchestrator.nodes.executor.AuditService.log", MagicMock())
    monkeypatch.setattr("orchestrator.nodes.executor.audit_task_status_change", MagicMock())
    monkeypatch.setattr("orchestrator.nodes.executor.audit_tool_executed", MagicMock())
    return recorder


def _build_node(monkeypatch, responses: list[MagicMock]) -> ExecutorNode:
    """두 회차를 돌도록 구성한 ExecutorNode 를 만든다.

    `safe_tool` 은 TOOL_RISK_CONFIG 에 없어 DEFAULT_RISK(승인 불필요)로 떨어진다 —
    승인 게이트에 막혀 루프가 1회차에서 조기 반환되지 않도록 하기 위함이다.
    """
    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(side_effect=responses)

    node = ExecutorNode(llm=fake_llm, tools=[])
    monkeypatch.setattr(
        ExecutorNode,
        "_resolved_llm_for_state",
        lambda self, state, **kwargs: (fake_llm, RESOLVED_MODEL, None),
    )
    monkeypatch.setattr(ExecutorNode, "_execute_tool", AsyncMock(return_value="tool ok"))
    return node


@pytest.mark.asyncio
async def test_executor_accumulates_token_usage_across_iterations(
    monkeypatch, executor_state, usage_recorder
):
    """반환 state 의 token_usage 는 모든 iteration 의 합이어야 한다."""
    node = _build_node(
        monkeypatch,
        [
            _response("", FIRST_USAGE, [{"name": "safe_tool", "args": {}, "id": "call-1"}]),
            _response("done", SECOND_USAGE, []),
        ],
    )

    result = await node.run(executor_state)

    usage = result["token_usage"]["Executor"]
    assert usage["call_count"] == 2
    assert usage["total_input_tokens"] == 15  # 10 + 5
    assert usage["total_output_tokens"] == 27  # 20 + 7
    assert usage["total_tokens"] == 42  # 30 + 12


@pytest.mark.asyncio
async def test_executor_total_cost_matches_ledger_sum(
    monkeypatch, executor_state, usage_recorder
):
    """state 의 total_cost 는 원장에 기록된 회차별 비용의 합과 일치해야 한다."""
    node = _build_node(
        monkeypatch,
        [
            _response("", FIRST_USAGE, [{"name": "safe_tool", "args": {}, "id": "call-1"}]),
            _response("done", SECOND_USAGE, []),
        ],
    )

    result = await node.run(executor_state)

    ledger_costs = [call.args[0].estimated_cost_usd for call in usage_recorder.await_args_list]
    assert len(ledger_costs) == 2
    assert all(cost > 0 for cost in ledger_costs)
    assert result["total_cost"] == pytest.approx(sum(ledger_costs))


@pytest.mark.asyncio
async def test_executor_ledger_records_per_iteration_deltas(
    monkeypatch, executor_state, usage_recorder
):
    """원장은 누계가 아니라 회차별 델타를 기록해야 한다(누적 수정의 비회귀 경계)."""
    node = _build_node(
        monkeypatch,
        [
            _response("", FIRST_USAGE, [{"name": "safe_tool", "args": {}, "id": "call-1"}]),
            _response("done", SECOND_USAGE, []),
        ],
    )

    await node.run(executor_state)

    records = [call.args[0] for call in usage_recorder.await_args_list]
    assert [r.input_tokens for r in records] == [10, 5]
    assert [r.output_tokens for r in records] == [20, 7]
    assert [r.total_tokens for r in records] == [30, 12]


@pytest.mark.asyncio
async def test_executor_single_iteration_usage_unchanged(
    monkeypatch, executor_state, usage_recorder
):
    """단일 iteration 경로의 값은 그대로여야 한다(누적 도입으로 이중 계산 금지)."""
    node = _build_node(monkeypatch, [_response("done", FIRST_USAGE, [])])

    result = await node.run(executor_state)

    usage = result["token_usage"]["Executor"]
    assert usage["call_count"] == 1
    assert usage["total_input_tokens"] == 10
    assert usage["total_output_tokens"] == 20
    assert usage["total_tokens"] == 30
