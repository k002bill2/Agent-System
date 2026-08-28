"""Git API 패키지.

`api/git.py`(2,022줄)를 도메인별 모듈로 분할한 결과. 소비자의 import 경로
는 분할 전과 동일하게 유지된다.

재노출 대상은 `router` 하나가 아니다 — 실측(2026-08-05) 결과
`tests/backend/test_llm_usage_instrumentation.py`가 핸들러 함수 두 개를
직접 import 한다. `router`만 재노출하면 그 두 import 가 ImportError 로
깨진다(Global Constraints 2 위반).
"""

from fastapi import APIRouter, Depends

from api.deps import get_current_user

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

# 인증은 **라우터 소유 모듈**에서 건다. 하위 8 모듈의 라우트가 전부 이 하나를
# 지나므로, 여기 걸면 새 라우트가 추가돼도 자동으로 덮인다 — 라우트마다 의존성을
# 붙이는 방식은 한 곳만 빠뜨려도 조용히 열린다.
#
# 2026-08-28 이전에는 이 패키지 어디에도 인증 게이트가 없었다. 실측에서 미인증
# 요청이 `/branches`·`/commits`·`/remotes` 에 200 과 실제 저장소 데이터를 받았고,
# 쓰기 계열도 401 이 아니라 422(본문 검증)까지 도달했다. `PROJECTS_REGISTRY` 가
# 비어 있는 동안에는 404 로 닫혀 보였을 뿐이라, 레지스트리를 채우자 드러났다.
#
# 대시보드는 이미 `apiClient` 의 auth interceptor 로 Authorization 헤더를 보내고
# 있어(그리고 git store 는 전부 apiClient 를 쓴다) 이 변경으로 깨지지 않는다.
#
# 이것은 **인증**(누구인지)만 건다. 프로젝트 단위 **인가**(그 프로젝트에 접근할
# 권한이 있는지)는 아직 없다 — 라우트의 `project_id` 가 path 기반 문자열인 반면
# `require_project_role` 은 UUID 를 기대해서, ID 해석 통일이 선행 조건이다.
# `.planning/STATE.md` 의 후속 1·2 에 그 작업으로 묶어 두었다.
router = APIRouter(
    prefix="/git",
    tags=["git"],
    dependencies=[Depends(get_current_user)],
)

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
