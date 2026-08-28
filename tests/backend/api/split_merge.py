"""services/merge_service.py(1,328줄) → 도메인 모듈 3종 분할 배정표. (B5.5 Task 3)

    # CWD = repo 루트. <원본> 은 패키지 승격 **직전** 커밋에서 꺼낸 스냅샷
    git show <승격직전ref>:src/backend/services/merge_service.py > /tmp/orig.py
    src/backend/.venv/bin/python tests/backend/api/split_merge.py \
        /tmp/orig.py src/backend/services/merge_service/

실행 로직은 `split_module.py` 에 있다. 이 파일은 **배정표와 그 근거**만 담는다.
패치 타깃이 있는 분할의 본보기는 `split_tmux.py`(B5.5 Task 2) 다.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from split_module import split  # noqa: E402

# ── 배정표: 이름 -> 모듈 ────────────────────────────────────────────────
#
# 하중 지지대 규칙: **테스트가 재바인딩하는 이름은, 그것을 읽는 함수 전부와
# 같은 모듈에 있어야 한다.**
#
# 문자열 패치 6 건은 전부 **한 이름** 을 겨냥한다
# (`tests/backend/test_git_service.py:206·214·255·278·309·328`):
#
#     @patch("services.merge_service.GIT_AVAILABLE", True)
#
# `GIT_AVAILABLE` 은 파일 머리의 `try: from git import ... / except ImportError:`
# 가 세우는 플래그다. **읽는 곳은 `MergeService.__init__` 한 군데뿐**이고
# (`grep -n GIT_AVAILABLE` 실측) `GitCommandError` 를 읽는 네 곳도 전부
# `MergeService` 안이다. 그래서 try 문 전체가 `MergeService` 와 같은 모듈로 가고,
# **배럴은 `GIT_AVAILABLE` 을 재노출하지 않는다** — 재노출하면 낡은 패치 경로가
# 성공하되 서브모듈 전역은 원본을 계속 봐서 조용히 무효가 된다.
#
# try/except 는 `split_module.statement_names` 가 한 문장으로 다루므로
# `GIT_AVAILABLE`·`Repo`·`GitCommandError` 를 가르려 하면 `torn` 검사가 막는다.
# 양쪽 분기의 `GIT_AVAILABLE` 중복도 같은 문장 안이라 중복으로 세지 않는다.
#
# 모듈 레벨 상태 실측: `_merge_requests` 는 `global` 문이 **없다**. 그러나 그것은
# 판정 근거가 아니다(`split_usage.py` 의 `_codex_plan_cache` 는 첨자 대입만 하는데
# 테스트가 dict 를 통째로 갈아끼웠다). 전수 grep 으로 **재바인딩 0 건**이고 reader 가
# 전부 `MergeRequestService` 안임을 확인했다 — 그 클래스와 같은 모듈에 두면 분열하지
# 않는다. 배럴은 이 dict 를 재노출하지 않는다.
ASSIGNMENT: dict[str, str] = {
    # ── errors.py — 예외 1종 ──
    #    `MergeService` 와 `get_merge_service` 가 함께 읽으므로 따로 둔다.
    #    작지만 여기 있어야 service ← requests 방향이 비순환으로 유지된다.
    "MergeServiceError": "errors",
    # ── service.py — 머지·충돌 연산 + GitPython 가용성 플래그 + 팩토리 ──
    #    try 문의 세 이름은 한 덩어리다(위 주석 참조).
    "GIT_AVAILABLE": "service",
    "Repo": "service",
    "GitCommandError": "service",
    "MergeService": "service",
    "get_merge_service": "service",
    # ── requests.py — 머지 요청 CRUD + 인메모리 저장소 ──
    #    `MergeRequestService` 가 `MergeService` 를 쓰므로 service 에 의존한다
    #    (반대 방향 의존은 없다 — 비순환).
    "_merge_requests": "requests",
    "MergeRequestService": "requests",
}

MODULE_ORDER = ["errors", "service", "requests"]

DOCSTRINGS = {
    "errors": '"""머지 서비스 예외."""',
    "service": (
        '"""충돌 탐지와 머지 연산, 그리고 GitPython 가용성 플래그.\n\n'
        "`GIT_AVAILABLE` 을 읽는 곳은 `MergeService.__init__` 하나뿐이고 테스트는\n"
        "그것을 `services.merge_service.service.GIT_AVAILABLE` 로 패치한다 —\n"
        "읽는 쪽을 다른 모듈로 가르면 패치가 조용히 무효가 된다.\n\n"
        "`try`/`except ImportError` 는 원자 단위다. 세 이름(`GIT_AVAILABLE` ·\n"
        '`Repo` · `GitCommandError`)을 가를 수 없다.\n"""'
    ),
    "requests": (
        '"""머지 요청 CRUD 와 그 인메모리 저장소.\n\n'
        "`_merge_requests` 는 `global` 로 재바인딩되지 않고 테스트도 갈아끼우지\n"
        "않는다(전수 실측). 그래도 reader 전부와 같은 모듈에 둔다 — 나중에\n"
        '재바인딩이 생기면 갈린 쪽이 옛 dict 를 계속 보기 때문이다.\n"""'
    ),
}

BARREL = '''"""Merge service for conflict detection and merge operations.

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
'''


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
