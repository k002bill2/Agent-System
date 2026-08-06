"""Git API 패키지.

`api/git.py`(2,022줄)를 도메인별 모듈로 분할한 결과. 소비자의 import 경로
는 분할 전과 동일하게 유지된다.

재노출 대상은 `router` 하나가 아니다 — 실측(2026-08-05) 결과
`tests/backend/test_llm_usage_instrumentation.py`가 핸들러 함수 두 개를
직접 import 한다. `router`만 재노출하면 그 두 import 가 ImportError 로
깨진다(Global Constraints 2 위반).
"""

from . import github, repositories
from ._legacy import (
    generate_draft_commits,
    generate_draft_commits_for_project,
    router,
)

router.include_router(github.router)
router.include_router(repositories.router)

__all__ = [
    "generate_draft_commits",
    "generate_draft_commits_for_project",
    "router",
]
