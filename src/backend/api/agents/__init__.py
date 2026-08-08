"""Agents API 패키지.

`api/agents.py`(1,731줄)를 도메인별 모듈로 분할한 결과. 소비자의 import 경로는
분할 전과 동일하게 유지된다.

집계 라우터는 `core` 모듈이 소유한다 — `@router.get("")`(list_agents)처럼 경로가
빈 라우트가 있어 prefix 까지 비면 FastAPI 가 "Prefix and path cannot be both
empty" 로 거부하기 때문이다. 경로 문자열을 "/" 로 바꾸는 것은 동작 변경이므로
하지 않는다.

재노출 대상은 `router` 하나가 아니다 — 실측(2026-08-08) 결과 다섯 이름이
패키지 밖에서 직접 쓰인다:

- `_resolve_ocr_runtime`        `tests/.../test_llm_usage_instrumentation.py:475`
- `_validate_project_path`      `tests/.../test_gemini_review_fixes.py:35·42·49·57`
- `ALLOWED_WORKSPACE_ROOTS`     `tests/.../test_gemini_review_fixes.py:49`
- `get_allowed_workspace_roots` `tests/.../test_gemini_review_fixes.py:80·89`
- `extract_text_from_image`     `test_llm_usage_instrumentation.py` 가
  `from api import agents as agents_api` 후 `agents_api.extract_text_from_image(...)`
  로 **모듈 속성** 접근한다 — import 문 grep 으로는 잡히지 않는 형태다

언더스코어 접두사가 붙었어도 실제로는 공개 계약이다. `router` 만 재노출하면
테스트 2파일이 ImportError·AttributeError 로 깨진다.
"""

from . import mcp, ocr, orchestrate, tmux
from .core import router
from .ocr import _resolve_ocr_runtime, extract_text_from_image
from .tmux import (
    ALLOWED_WORKSPACE_ROOTS,
    _validate_project_path,
    get_allowed_workspace_roots,
)

# 등록 순서는 계약이 아니다. `GET /agents/stats` 와 `GET /agents/{agent_id}` 는
# 둘 다 core 안에 있어 선언 순서가 유지되고, 나머지 모듈의 라우트는 3세그먼트
# 이상이거나(`/agents/mcp/...`, `/agents/orchestrate/...`) 메서드가 달라
# 겹치지 않는다. 계약 검사는 test_no_shadowing_route_pairs 가 한다.
router.include_router(mcp.router)
router.include_router(ocr.router)
router.include_router(orchestrate.router)
router.include_router(tmux.router)

__all__ = [
    "ALLOWED_WORKSPACE_ROOTS",
    "_resolve_ocr_runtime",
    "_validate_project_path",
    "extract_text_from_image",
    "get_allowed_workspace_roots",
    "router",
]
