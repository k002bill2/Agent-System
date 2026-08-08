"""orchestrator/nodes 의 graceful degradation 이 분할 때문에 발동하지 않음을 보증한다.

`nodes.py` 는 RAG·MCP 를 `try/except ImportError` 로 감싸 의존이 없어도
동작하게 만든다. 문제는 **`except ImportError` 가 어떤 ImportError 든 삼킨다**는
것이다 — 모듈 분할이 순환 import 를 만들면 그것도 ImportError 로 잡혀
`RAG_AVAILABLE`/`MCP_AVAILABLE` 이 조용히 `False` 가 되고, 실물 함수 자리에
빈 문자열을 돌려주는 fallback 이 앉는다.

**이 회귀는 다른 게이트를 전부 통과한다.** ruff·mypy 는 무관하고,
`split_audit.py` 는 블록 텍스트가 동일하므로 0건이며, pytest 도 플래그를
단언하는 테스트가 없으면 통과한다. `api/usage` 분할(B5 Task 2)에서 라우트
표면을 `route_table.py` 가 지켰지만 `nodes.py` 에는 라우트가 없다 —
**이 파일이 그 세 번째 그물의 대체물이다.**

플래그를 `True` 로 하드코딩하지 않는다. 의존이 실제로 없는 환경에서는 `False`
가 정상이기 때문이다. 잡아야 할 것은 **"의존을 import 할 수 있는데도 플래그가
False"** 이며, 그것만이 분할이 만든 순환 import 의 신호다.

분할 전 실측(2026-08-09): `RAG_AVAILABLE=True` · `MCP_AVAILABLE=True` ·
`get_project_context.__module__='services.rag_service'` ·
`MCPToolExecutor=orchestrator.tools.MCPToolExecutor`.
"""

import importlib

import orchestrator.nodes as nodes


def _importable(module: str) -> bool:
    try:
        importlib.import_module(module)
    except ImportError:
        return False
    return True


def test_rag_flag_matches_actual_importability() -> None:
    """`services.rag_service` 가 import 가능하면 RAG 경로가 실물이어야 한다."""
    if not _importable("services.rag_service"):
        return  # 의존 없는 환경 — fallback 이 정상이다

    assert nodes.RAG_AVAILABLE is True, (
        "services.rag_service 를 직접 import 할 수 있는데 RAG_AVAILABLE 이 False 다. "
        "fallback 이 발동한 이유는 의존성 부재가 아니라 **순환 import** 다 — "
        "모듈 분할이 새 import 경로를 만들었는지 확인할 것."
    )
    assert nodes.get_project_context.__module__ == "services.rag_service", (
        f"get_project_context 가 fallback 이다 (모듈={nodes.get_project_context.__module__}). "
        "빈 문자열을 돌려주므로 PlannerNode 가 RAG 컨텍스트 없이 계획을 세운다."
    )


def test_mcp_flag_matches_actual_importability() -> None:
    """`orchestrator.tools` 가 import 가능하면 MCP 경로가 실물이어야 한다."""
    if not _importable("orchestrator.tools"):
        return

    assert nodes.MCP_AVAILABLE is True, (
        "orchestrator.tools 를 직접 import 할 수 있는데 MCP_AVAILABLE 이 False 다. "
        "**순환 import** 를 의심할 것 — orchestrator.tools 와 nodes 는 같은 패키지다."
    )
    assert nodes.MCPToolExecutor is not None, (
        "MCPToolExecutor 가 None 이다. ExecutorNode 의 MCP 도구 실행이 통째로 꺼진다."
    )
    assert nodes.MCPToolExecutor.__module__ == "orchestrator.tools"
