"""Merge service for conflict detection and merge operations.

원래 단일 `services/merge_service.py`(1,328줄)를 도메인별로 분할한 결과.
소비자의 `from services.merge_service import get_merge_service` 는 그대로 유효하다.

재노출은 실측된 import 사이트가 요구하는 것만 담는다:

    api/git/merge.py    -> get_merge_service · MergeServiceError
    api/git/_shared.py  -> MergeRequestService · get_merge_service
    tests/…test_git_service.py -> MergeService · MergeRequestService · MergeRequestStatus

`MergeRequestStatus` 는 이 패키지가 정의하지 않고 `models.git` 에서 가져오는
이름이지만 **재노출한다** — 테스트 3 곳이 실제로 여기서 가져가고, 패치 타깃이
아니라 재노출이 무효를 만들 여지가 없다. (반면 아래 `GIT_AVAILABLE` 은 정확히
그 이유로 뺀다. 기준은 "정의했는가" 가 아니라 "재바인딩되는가" 다.)

**의도적으로 빠진 것**

- `GIT_AVAILABLE` · `Repo` · `GitCommandError` — 테스트가 `GIT_AVAILABLE` 을
  재바인딩한다. 배럴에 두면 낡은 패치 경로(`services.merge_service.GIT_AVAILABLE`)
  가 성공하되 `service.py` 의 전역은 원본을 계속 봐서 조용히 무효가 된다.
  빠져 있으면 `patch` 가 그 자리에서 `AttributeError` 로 죽어 실패가 자기 위치를
  가리킨다.
- `_merge_requests` — 모듈 상태다. 값을 재노출하면 나중에 재바인딩이 생겼을 때
  배럴이 옛 dict 를 영구히 노출한다.
"""

from models.git import MergeRequestStatus

from .errors import MergeServiceError
from .requests import MergeRequestService
from .service import MergeService, get_merge_service

__all__ = [
    "MergeRequestService",
    "MergeRequestStatus",
    "MergeService",
    "MergeServiceError",
    "get_merge_service",
]
