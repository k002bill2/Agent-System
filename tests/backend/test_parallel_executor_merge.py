"""ParallelExecutorNode 결과 병합 회귀 테스트 (issue #273).

병렬 브랜치가 만든 `agents` 상태가 병합 결과에 남는지 검증한다.
checkpointer 도입 시 반환되지 않은 키는 채널에 반영되지 않아 유실된다.
"""

from models.agent_state import (
    AgentInfo,
    AgentRole,
    TaskNode,
    TaskStatus,
    create_initial_state,
)
from orchestrator.parallel_executor import ParallelExecutorNode


def _executor_agent(task_id: str) -> AgentInfo:
    """ExecutorNode(`nodes/executor.py`)와 같은 규칙으로 agent id 를 만든다."""
    return AgentInfo(
        id=f"executor-{task_id[:8]}",
        role=AgentRole.EXECUTOR,
        name=f"Executor for {task_id}",
        status=TaskStatus.COMPLETED,
        current_task=task_id,
    )


def _branch_result(task_id: str) -> dict:
    """단일 브랜치(ExecutorNode.run)의 반환 형태를 모사한다."""
    agent = _executor_agent(task_id)
    return {
        "task_id": task_id,
        "result": {
            "tasks": {task_id: TaskNode(id=task_id, title=task_id, status=TaskStatus.COMPLETED)},
            "agents": {agent.id: agent},
            "messages": [],
        },
    }


def test_merge_results_preserves_agents_from_every_branch():
    """각 병렬 브랜치의 agent 가 병합 결과에 모두 남아야 한다."""
    node = ParallelExecutorNode(llm=None, tools=[])
    state = create_initial_state(session_id="session-merge")

    merged = node._merge_results(
        [_branch_result("task-a1"), _branch_result("task-b2")],
        state,
    )

    assert set(merged["agents"]) == {"executor-task-a1", "executor-task-b2"}
    assert merged["agents"]["executor-task-a1"].current_task == "task-a1"
    assert merged["agents"]["executor-task-b2"].current_task == "task-b2"


def test_merge_results_keeps_agents_already_in_state():
    """다른 노드가 등록한 기존 agent 는 병합으로 지워지지 않아야 한다."""
    node = ParallelExecutorNode(llm=None, tools=[])
    state = create_initial_state(session_id="session-merge")
    planner = AgentInfo(id="planner-1", role=AgentRole.PLANNER, name="Planner")
    state["agents"]["planner-1"] = planner

    merged = node._merge_results([_branch_result("task-a1")], state)

    assert merged["agents"]["planner-1"] is planner
    assert "executor-task-a1" in merged["agents"]


def test_merge_results_handles_branch_without_agents():
    """agents 키가 없는 브랜치 결과(조기 반환 경로)도 병합을 깨뜨리지 않는다."""
    node = ParallelExecutorNode(llm=None, tools=[])
    state = create_initial_state(session_id="session-merge")

    merged = node._merge_results(
        [
            {"task_id": "task-a1", "result": {"last_error": "No valid task to execute"}},
            _branch_result("task-b2"),
        ],
        state,
    )

    assert set(merged["agents"]) == {"executor-task-b2"}
