"""`AgentState` 미선언 키가 그래프를 통과하며 사라지는 문제 (issue #292).

LangGraph 는 `StateGraph(AgentState)` 의 TypedDict 에 없는 키를 노드 출력에서
**조용히 버린다** — 에러도 경고도 없다. 그래서 정적 검사로는 잡히지 않고,
`AgentState` 에서 선언 한 줄이 사라지면 다음 두 계약이 함께 무너진다:

- `_metadata` — 세션 TTL. 사라지면 그래프를 한 번 돈 세션이 영속 state 에서
  만료 정보를 잃어, 재시작·다른 인스턴스에서 TTL 이 강제되지 않는다.
- `_version` — 낙관적 동시성의 기준 행 버전. 사라지면 조건부 UPDATE 가 무조건
  쓰기로 떨어져 lost update 가 그대로 남는다.

선언 여부를 `__annotations__` 로 확인하는 것은 동어반복이다. 실제로 그래프를
왕복시켜 살아남는지 본다.
"""

import pytest
from langgraph.graph import END, StateGraph

from models.agent_state import AgentState, create_initial_state


async def _bump(state: AgentState) -> dict:
    return {"iteration_count": state.get("iteration_count", 0) + 1}


def _one_node_graph():
    graph = StateGraph(AgentState)
    graph.add_node("bump", _bump)
    graph.set_entry_point("bump")
    graph.add_edge("bump", END)
    return graph.compile()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("_metadata", {"session_id": "s-292", "expires_at": "2099-01-01T00:00:00"}),
        ("_version", 7),
    ],
)
async def test_out_of_graph_key_survives_invocation(key, value):
    state = create_initial_state(session_id="s-292")
    state[key] = value

    result = await _one_node_graph().ainvoke(state)

    assert key in result, f"{key} 가 그래프 통과 중 유실됐다 — AgentState 선언을 확인하라"
    assert result[key] == value


@pytest.mark.asyncio
async def test_declared_node_output_still_applies():
    """대조군 — 노드가 실제로 돌았는지. 위 단언이 빈 그래프로 통과하지 않게."""
    state = create_initial_state(session_id="s-292")
    before = state["iteration_count"]

    result = await _one_node_graph().ainvoke(state)

    assert result["iteration_count"] == before + 1
