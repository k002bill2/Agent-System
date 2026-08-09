"""services/external_usage_service.py(932줄) → 모듈 3종 분할 배정표. (B5 Task 4)

    # CWD = repo 루트. <원본> 은 패키지 승격 **직전** 커밋에서 꺼낸 스냅샷
    git show <승격직전ref>:src/backend/services/external_usage_service.py > /tmp/orig.py
    src/backend/.venv/bin/python tests/backend/api/split_external_usage.py /tmp/orig.py src/backend/services/external_usage_service/

실행 로직은 `split_module.py` 에 있다. 이 파일은 **배정표와 그 근거**만 담는다.

## 이 대상의 성질

- **컨테이너 안 정의 0건.** Task 3 의 `try/except ImportError` 함정이 없다.
- **모듈 레벨 상태 1건**: `_service_instance` 는 `get_external_usage_service` 가
  `global` 로 재바인딩하므로 **같은 모듈에 남긴다**(service).
- **`httpx` 패치 7건.** 형태는 `patch("services.external_usage_service.httpx.AsyncClient")`
  이며 전부 `tests/backend/test_external_usage_service.py` 에 있다.

## httpx 패치를 `collectors` 경로로 옮기는 이유

이 패치는 모듈의 `httpx` **속성**을 거쳐 **공유 `httpx` 모듈 객체**의 `AsyncClient`
를 갈아끼운다. 따라서 실제 HTTP 호출이 어느 서브모듈에서 일어나든 먹으며, 유일한
요구는 패치 경로가 `httpx` 속성을 노출하는 것이다.

계획서는 `__init__.py` 에 `import httpx` 를 유지하는 안을 적었으나 택하지 않았다:
① 좁은 재노출 원칙과 충돌한다(B5 Task 2·3 교훈) ② 배럴이 그 이름을 쓰지 않으므로
ruff F401 이 난다 ③ 무엇보다 **httpx 를 실제로 쓰지 않는 모듈에 이름을 두는 것**이다.

AST 실측 결과 `httpx` 를 쓰는 것은 컬렉터 3종뿐이고 셋 다 `collectors.py` 로 가므로,
패치 타깃은 `services.external_usage_service.collectors.httpx.AsyncClient` **한 곳**으로
모인다.

> **스캔 교훈(이 태스크에서 재발)**: `patch(` 를 정규식 앵커로 쓰면 여러 줄 호출
> (`with patch(\n    "services.X.httpx.AsyncClient",`)을 놓친다. Task 2 에서 같은 함정에
> 걸렸는데 패턴을 고치지 않아 반복됐다. **타깃 문자열(`"services.X.`) 자체만 grep 할 것** —
> 호출 형태와 무관하게 잡힌다.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from split_module import split  # noqa: E402

# ── 배정표 (AST 의존 실측 2026-08-09) ──────────────────────────────────
#
# 의존 방향이 한 방향이다: summaries ← service, collectors ← service.
# summaries 와 collectors 사이에는 의존이 없다.
ASSIGNMENT: dict[str, str] = {
    # ── summaries.py — ledger·snapshot 집계와 대조 리포트 (순수 함수) ──
    "_PROVIDER_ALIASES": "summaries",
    "_ledger_external_provider": "summaries",
    "_record_tokens": "summaries",
    "summarize_internal_ledger_records": "summaries",
    "summarize_claude_snapshot_records": "summaries",
    "_summary_tokens": "summaries",
    "_merge_summaries": "summaries",
    "_comparison_status": "summaries",
    "build_reconciliation_summary": "summaries",
    # ── collectors.py — provider별 usage 수집기. httpx 를 쓰는 유일한 모듈 ──
    "BaseUsageCollector": "collectors",
    "OpenAIUsageCollector": "collectors",
    "GitHubCopilotCollector": "collectors",
    "AnthropicUsageCollector": "collectors",
    # ── service.py — 오케스트레이션 + 싱글턴 홀더 ──
    #    `_service_instance` 는 `global` 재바인딩이므로 get_external_usage_service 와
    #    반드시 같은 모듈. 가르면 인스턴스 사본이 분열된다.
    "_LEDGER_PROVIDER_FILTERS": "service",
    "_bool_env": "service",
    "ExternalUsageService": "service",
    "_service_instance": "service",
    "get_external_usage_service": "service",
}

MODULE_ORDER = ["summaries", "collectors", "service"]

DOCSTRINGS = {
    "summaries": (
        '"""내부 ledger·Claude 스냅샷 집계와 provider 대조 리포트.\n\n'
        '순수 함수만 둔다 — 외부 I/O 도 모듈 상태도 없다.\n"""'
    ),
    "collectors": (
        '"""Provider별 usage 수집기 (OpenAI · GitHub Copilot · Anthropic).\n\n'
        "`httpx` 를 쓰는 유일한 모듈이다. 테스트는 이 경로로 패치한다:\n"
        "`services.external_usage_service.collectors.httpx.AsyncClient`.\n\n"
        "모듈의 `httpx` 속성을 거쳐 **공유 httpx 모듈 객체**의 `AsyncClient` 를\n"
        '갈아끼우는 형태이므로, 세 수집기 전부에 한 번에 먹는다.\n"""'
    ),
    "service": (
        '"""ExternalUsageService — 수집·집계 오케스트레이션과 싱글턴 홀더.\n\n'
        "`_service_instance` 는 `get_external_usage_service` 가 `global` 로\n"
        "재바인딩하므로 반드시 같은 모듈에 있어야 한다 — 가르면 인스턴스 사본이\n"
        '분열되고, ruff·mypy·테스트를 모두 통과한 채로 두 개가 살아 있게 된다.\n"""'
    ),
}

# 소비자 실측: api/llm_proxy.py:22 · api/external_usage.py:22 가
# `get_external_usage_service` 를, tests/backend/test_external_usage_service.py:12 가
# 5종을 import 한다. 합집합이 정확히 이 6종이다.
BARREL = (
    '"""External usage 서비스 패키지.\n\n'
    "원래 단일 `services/external_usage_service.py`(932줄)를 분할한 결과.\n"
    "소비자의 `from services.external_usage_service import get_external_usage_service`\n"
    "는 그대로 유효하다.\n\n"
    "재노출은 **좁게** 한다 — 소비자가 실제로 요구하는 6종뿐이다.\n"
    "`httpx` 를 여기 두지 않는 것은 의도다: 테스트의 패치는 실제로 httpx 를 쓰는\n"
    "`collectors` 경로를 겨냥하며, 배럴에 이름만 두면 ruff F401 이 나고 무엇보다\n"
    "그 이름을 쓰지 않는 모듈에 이름을 두는 셈이 된다.\n"
    '"""\n\n'
    "from .collectors import AnthropicUsageCollector, OpenAIUsageCollector\n"
    "from .service import ExternalUsageService, get_external_usage_service\n"
    "from .summaries import (\n"
    "    summarize_claude_snapshot_records,\n"
    "    summarize_internal_ledger_records,\n"
    ")\n\n"
    "__all__ = [\n"
    '    "AnthropicUsageCollector",\n'
    '    "ExternalUsageService",\n'
    '    "OpenAIUsageCollector",\n'
    '    "get_external_usage_service",\n'
    '    "summarize_claude_snapshot_records",\n'
    '    "summarize_internal_ledger_records",\n'
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
