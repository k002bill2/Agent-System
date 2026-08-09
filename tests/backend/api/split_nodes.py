"""orchestrator/nodes.py(1,714줄) → 노드별 모듈 6종 분할 배정표. (B5 Task 3)

    # CWD = repo 루트. <원본> 은 패키지 승격 **직전** 커밋에서 꺼낸 스냅샷
    git show <승격직전ref>:src/backend/orchestrator/nodes.py > /tmp/orig.py
    src/backend/.venv/bin/python tests/backend/api/split_nodes.py /tmp/orig.py src/backend/orchestrator/nodes/

실행 로직은 `split_module.py` 에 있다. 이 파일은 **배정표와 그 근거**만 담는다.

## 이 대상의 성질 (Task 1·2 와 다른 점)

- **모듈 레벨 가변 상태가 0건이다.** 캐시·싱글턴 홀더가 없어 하중 지지대 제약이
  없다. 대신 아래 두 가지가 난점이다.
- **`try/except ImportError` 블록 2개가 원자 단위다.** `split_module.py` 가 배정
  단위를 최상위 문장으로 잡고 "한 문장의 이름은 같은 모듈" 을 단언하는 이유가 이것.
  RAG 블록은 `PlannerNode` 가 쓰므로 planner, MCP 블록은 `ExecutorNode` 가 쓰므로
  executor 로 간다 (AST 역인덱스로 실측).
- **B5 에서 유일하게 테스트 문자열 패치 갱신이 확정된 대상**(7회). 상세는 아래.
- **라우트가 없어 `route_table.py` 를 쓸 수 없다.** 그 자리를
  `tests/backend/test_orchestrator_nodes_optional_deps.py` 가 대신한다 — 분할이
  순환 import 를 만들어 optional 플래그가 조용히 `False` 가 되는 것을 잡는다.

## 테스트 문자열 패치 7회 — 전부 실제 모듈 경로로 갱신한다

전부 `tests/backend/test_llm_usage_instrumentation.py` (949–951, 1125–1128):

| 원래 타깃 | 갱신 후 | 유형 |
|---|---|---|
| `orchestrator.nodes.record_usage_best_effort` | `...nodes.base.record_usage_best_effort` | 모듈 지역 (BaseNode 가 읽는다) |
| `orchestrator.nodes.audit_task_status_change` | `...nodes.executor.audit_task_status_change` | 모듈 지역 (ExecutorNode) |
| `orchestrator.nodes.AuditService.log` | `...nodes.executor.AuditService.log` | 클래스 속성 |
| `orchestrator.nodes.LLMService._get_llm` | `...nodes.base.LLMService._get_llm` | 클래스 속성 |

앞의 둘은 **재노출로 살아나지 않는다** — 패키지 `__init__` 에 속성을 심어도
`base.py`/`executor.py` 의 전역 조회는 자기 모듈 `__dict__` 를 본다. 뒤의 둘은
클래스 속성이라 어느 경로로 찾든 같은 객체이므로 재노출로도 동작하지만, **넷 다
실제 사용처 경로로 맞춘다** — 그래야 `__init__` 재노출을 소비자 요구분(클래스
6종)으로 좁게 유지할 수 있고, 좁게 두면 갱신 누락이 `AttributeError` 로 즉시
드러난다 (B5 Task 2 교훈).

이 넷은 `ASSIGNMENT` 에 넣지 않는다 — `ImportFrom` 바인딩이지 정의가 아니므로
커버리지 단언이 "배정표에 있는데 원본에 없음" 으로 실패한다. import 역산이
자동으로 올바른 모듈에 배치한다.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from split_module import split  # noqa: E402

# ── 배정표: 이름 -> 모듈 (AST 역인덱스 실측 2026-08-09) ──────────────────
#
# 클래스 6개는 각자 모듈로. 5개가 BaseNode 를 상속하므로 import 역산이
# `from .base import BaseNode` 를 넣는다.
#
# optional 의존 블록은 **쓰는 클래스를 따라간다**:
#   get_project_context/RAG_AVAILABLE → PlannerNode 만 사용 → planner
#   MCPToolExecutor/MCP_AVAILABLE     → ExecutorNode 만 사용 → executor
# `RAG_AVAILABLE` 은 실측상 **어느 클래스도 읽지 않는다**(미사용). 그래도 원본에
# 있으므로 보존해야 하고(split_audit 이 유실로 잡는다), 같은 try 문장 안의
# `get_project_context` 와 갈릴 수 없으므로 planner 로 간다.
ASSIGNMENT: dict[str, str] = {
    "BaseNode": "base",
    "OrchestratorNode": "orchestrator",
    "PlannerNode": "planner",
    "get_project_context": "planner",
    "RAG_AVAILABLE": "planner",
    "ExecutorNode": "executor",
    "MCPToolExecutor": "executor",
    "MCP_AVAILABLE": "executor",
    "ReviewerNode": "reviewer",
    "SelfCorrectionNode": "self_correction",
}

# 원본 선언 순서를 따른다 (BaseNode → Orchestrator → Planner → Executor →
# Reviewer → SelfCorrection). optional 블록은 원본에서 클래스들보다 앞에 있어
# 각 모듈 안에서도 클래스보다 앞에 놓인다 — 원본 배치와 같은 모양이다.
MODULE_ORDER = ["base", "orchestrator", "planner", "executor", "reviewer", "self_correction"]

DOCSTRINGS = {
    "base": (
        '"""BaseNode — 모든 LangGraph 노드의 추상 베이스.\n\n'
        "LLM 호출과 사용량 기록(`record_usage_best_effort`)이 여기 모인다.\n"
        "테스트는 이 모듈 경로로 패치한다:\n"
        "`orchestrator.nodes.base.record_usage_best_effort` ·\n"
        '`orchestrator.nodes.base.LLMService._get_llm`.\n"""'
    ),
    "orchestrator": '"""OrchestratorNode — 상태 분석·다음 액션 결정·의존성 기반 스케줄링."""',
    "planner": (
        '"""PlannerNode — LLM 기반 태스크 분해와 RAG 컨텍스트 조회.\n\n'
        "RAG 는 optional 의존이다. `try/except ImportError` 블록을 **통째로** 이 모듈이\n"
        "가진다 — `RAG_AVAILABLE` 과 `get_project_context` 를 가르면 graceful\n"
        "degradation 구조가 깨진다.\n\n"
        "`except ImportError` 는 **어떤** ImportError 든 삼키므로, 분할이 순환 import 를\n"
        "만들면 플래그가 조용히 False 가 되고 fallback 이 빈 문자열을 돌려준다.\n"
        '`tests/backend/test_orchestrator_nodes_optional_deps.py` 가 그것을 잡는다.\n"""'
    ),
    "executor": (
        '"""ExecutorNode — 태스크 실행·HITL 승인 체크·MCP 도구 통합.\n\n'
        "MCP 는 optional 의존이다(위 planner 의 RAG 와 같은 구조·같은 주의).\n\n"
        "테스트는 이 모듈 경로로 패치한다:\n"
        "`orchestrator.nodes.executor.audit_task_status_change` ·\n"
        '`orchestrator.nodes.executor.AuditService.log`.\n"""'
    ),
    "reviewer": '"""ReviewerNode — 품질 검증과 결과 집계."""',
    "self_correction": '"""SelfCorrectionNode — 에러 분석과 재시도 전략 생성 (최대 3회)."""',
}

# 소비자 실측: orchestrator/__init__.py:5 · graph.py:8 · engine.py:91 ·
# parallel_executor.py:10 + 테스트 2개. 합집합이 정확히 이 6종이며 모듈 레벨
# 이름(RAG_AVAILABLE 등)을 요구하는 소비자는 0건이다.
BARREL = (
    '"""LangGraph node implementations 패키지.\n\n'
    "원래 단일 `orchestrator/nodes.py`(1,714줄)를 노드별로 분할한 결과.\n"
    "소비자의 `from orchestrator.nodes import ExecutorNode` 는 그대로 유효하다.\n\n"
    "재노출은 **좁게** 한다 — 실측상 소비자가 요구하는 것은 노드 클래스 6종뿐이다\n"
    "(orchestrator/__init__.py · graph.py · engine.py · parallel_executor.py + 테스트).\n"
    "`AuditService` · `LLMService` · `record_usage_best_effort` 같은 import 바인딩을\n"
    "여기서 재노출하지 않는 것은 의도다: 그러면 테스트의 문자열 패치가 별칭만\n"
    "갈아끼우고 정작 그 이름을 읽는 서브모듈은 원본을 계속 봐서, 패치가 안 먹는데도\n"
    "조용히 지나갈 여지가 생긴다. 좁게 두면 갱신 누락이 즉시 드러난다.\n"
    '"""\n\n'
    "from .base import BaseNode\n"
    "from .executor import ExecutorNode\n"
    "from .orchestrator import OrchestratorNode\n"
    "from .planner import PlannerNode\n"
    "from .reviewer import ReviewerNode\n"
    "from .self_correction import SelfCorrectionNode\n\n"
    "__all__ = [\n"
    '    "BaseNode",\n'
    '    "ExecutorNode",\n'
    '    "OrchestratorNode",\n'
    '    "PlannerNode",\n'
    '    "ReviewerNode",\n'
    '    "SelfCorrectionNode",\n'
    "]\n"
)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    return split(
        Path(argv[1]),
        Path(argv[2]),
        assignment=ASSIGNMENT,
        docstrings=DOCSTRINGS,
        module_order=MODULE_ORDER,
        barrel=BARREL,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv))
