"""Git API 패키지.

`api/git.py`(2,022줄)를 도메인별 모듈로 분할한 결과. 소비자의 import 경로
는 분할 전과 동일하게 유지된다.

재노출 대상은 `router` 하나가 아니다 — 실측(2026-08-05) 결과
`tests/backend/test_llm_usage_instrumentation.py`가 핸들러 함수 두 개를
직접 import 한다. `router`만 재노출하면 그 두 import 가 ImportError 로
깨진다(Global Constraints 2 위반).
"""

from fastapi import APIRouter

from . import (
    branches,
    commits,
    github,
    merge,
    merge_requests,
    remotes,
    repositories,
    working_tree,
)
from .commits import generate_draft_commits, generate_draft_commits_for_project

router = APIRouter(prefix="/git", tags=["git"])

# 등록 순서는 원본 선언 순서를 재현하지 않는다 — 원본은 도메인 그룹이 불연속이라
# (branch-protection·draft-commits·fetch/pull/push) 복원 자체가 불가능하다.
# 지켜야 할 계약은 test_no_shadowing_route_pairs 가 검사하는 것 하나뿐이다:
# 같은 모양 경로에서 파라미터 쪽이 구체 쪽보다 앞서지 않을 것.
router.include_router(branches.router)
router.include_router(commits.router)
router.include_router(github.router)
router.include_router(merge.router)
router.include_router(merge_requests.router)
router.include_router(remotes.router)
router.include_router(repositories.router)
router.include_router(working_tree.router)

__all__ = [
    "generate_draft_commits",
    "generate_draft_commits_for_project",
    "router",
]
