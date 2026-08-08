"""Claude Code external session monitoring API 패키지.

`api/claude_sessions.py`(1,352줄)를 도메인별 모듈로 분할한 결과. 소비자의
import 경로는 분할 전과 동일하게 유지된다.

재노출 대상은 두 이름이다 (실측 2026-08-08):

- `router`                          `api/app.py:90` 이 `safe_import` 로 가져가
  `app.py:529` 에서 prefix `/api` 로 마운트한다
- `scan_and_sync_claude_snapshots`  `api/external_usage.py:141` 이
  `from api.claude_sessions import ...` 로 직접 가져간다. External Usage /sync
  가 이 함수로 호스트 Claude 세션 스냅샷을 갱신한다

**`get_monitor` · `_sync_sessions_to_db` 는 일부러 재노출하지 않는다.**
`tests/backend/test_claude_session_sync.py` 가 이 둘을 **모듈 속성으로 패치**하는데
(`patch.object(...)` — 문자열 patch 가 아니라 import 문 grep 에도 안 잡힌다),
패치가 먹는 지점은 그 이름을 자기 네임스페이스에 바인딩한 모듈이다. 여기서
재노출하면 패치는 성공하지만 실제 호출은 원본을 타서 **조용히 무효**가 된다.
그 테스트는 실제 바인딩 모듈을 직접 패치한다.
"""

from . import activity, discovery, sessions, sources
from ._legacy import router
from .sync import scan_and_sync_claude_snapshots

# **include 순서가 계약이다.** Starlette 는 등록 순서대로 전체 경로를 매칭하고
# `include_router` 는 하위 라우트를 리스트 끝에 붙인다. `sessions` 의
# `GET/DELETE /{session_id}` 는 2세그먼트 파라미터 경로라 구체 경로
# `/external-paths` · `/source-users` · `/projects` · `/processes` · `/ghost`
# 5개를 전부 가린다(실측 확인). 따라서 파라미터 경로 모듈은 **항상 마지막**이다.
#
# 알파벳 순 정렬이나 "정리" 목적의 재배치를 하지 마라 — 라우트 5개가 조용히
# 도달 불가가 된다. test_no_shadowing_route_pairs 가 이를 잡는다.
router.include_router(sources.router)
router.include_router(discovery.router)
router.include_router(sessions.router)
router.include_router(activity.router)

__all__ = [
    "router",
    "scan_and_sync_claude_snapshots",
]
