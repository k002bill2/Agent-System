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

from ._legacy import router, scan_and_sync_claude_snapshots

__all__ = [
    "router",
    "scan_and_sync_claude_snapshots",
]
