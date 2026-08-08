"""Agents API 패키지.

`api/agents.py`(1,731줄)를 도메인별 모듈로 분할한 결과. 소비자의 import 경로는
분할 전과 동일하게 유지된다.

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

from ._legacy import (
    ALLOWED_WORKSPACE_ROOTS,
    _resolve_ocr_runtime,
    _validate_project_path,
    extract_text_from_image,
    get_allowed_workspace_roots,
    router,
)

__all__ = [
    "ALLOWED_WORKSPACE_ROOTS",
    "_resolve_ocr_runtime",
    "_validate_project_path",
    "extract_text_from_image",
    "get_allowed_workspace_roots",
    "router",
]
