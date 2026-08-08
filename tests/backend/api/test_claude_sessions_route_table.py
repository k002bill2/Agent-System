"""api/claude_sessions.py 분할이 HTTP 표면을 바꾸지 않았음을 보증한다.

B1(api/git.py)에서 만든 route_table 헬퍼를 재사용한다. 파일마다 새로 필요한
것은 베이스라인 JSON 과 Red-Green 증명, 그리고 그 파일 고유의 재노출 계약이다.

**모듈 최상단의 정적 import 를 절대 함수 내부로 옮기지 마라.** app.py:90 의
`safe_import("api.claude_sessions", "router")` 는 `except Exception` 까지 잡아
None 을 반환하고 호출부(app.py:528)는 `if claude_sessions_router:` 로 조용히
건너뛴다. 즉 패키지가 깨져도 앱은 정상 기동하고 claude-sessions 라우트 25개만
통째로 사라진다. 아래 import 가 collection 단계에서 ImportError 로 실패하는
것이 유일한 조기 경보다.
"""

import json
from pathlib import Path

from api.claude_sessions import router

from .route_table import shadowing_pairs, snapshot

BASELINE = Path(__file__).parent / "claude_sessions_route_table.json"


def test_claude_sessions_route_table_unchanged() -> None:
    """라우트 유실·추가·개명을 잡는다."""
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    actual = snapshot(router)

    missing = [r for r in expected if r not in actual]
    added = [r for r in actual if r not in expected]

    assert not missing, f"분할 과정에서 사라진 라우트: {missing}"
    assert not added, f"분할 과정에서 생긴 라우트: {added}"


def test_no_shadowing_route_pairs() -> None:
    """먼저 등록된 경로가 뒤 경로를 가리지 않음을 보증한다.

    **이 파일은 include 순서가 곧 계약이다.** agents 와 다른 점이다 — 거기서는
    구체 경로(`/agents/stats`)와 파라미터 경로(`/agents/{agent_id}`)가 같은
    모듈에 있어 선언 순서가 자동으로 보존됐다. 여기서는 갈린다:

    | 가리는 쪽 (2세그먼트 파라미터) | 가려지는 쪽 (2세그먼트 구체)                    |
    |---|---|
    | `GET /{session_id}`            | `/external-paths` · `/source-users` · `/projects` · `/processes` |
    | `DELETE /{session_id}`         | `/ghost`                                        |

    파라미터 라우트를 앞에 include 하면 위 5개가 **영영 도달 불가**가 된다.
    3세그먼트 이상(`/{session_id}/stream`, `/processes/kill`, `/summaries/...`)은
    두 번째 세그먼트가 리터럴이라 서로 겹치지 않는다.
    """
    pairs = shadowing_pairs(router)

    assert pairs == [], (
        f"경로 가림 발생 — 뒤 라우트가 도달 불가다: {pairs}. "
        "__init__.py 의 include_router 순서에서 구체 경로 모듈을 "
        "파라미터 경로 모듈보다 앞에 둘 것."
    )


def test_router_prefix_and_tags_unchanged() -> None:
    """마운트 계약. app.py:529 는 이 라우터를 prefix='/api' 로 붙인다."""
    assert router.prefix == "/claude-sessions"
    assert router.tags == ["claude-sessions"]


def test_public_names_reexported() -> None:
    """`api.claude_sessions` 가 라우트 밖으로 제공해야 하는 이름.

    실측(2026-08-08):
      - `scan_and_sync_claude_snapshots`  `api/external_usage.py:141` 이
        `from api.claude_sessions import scan_and_sync_claude_snapshots` 로
        직접 가져간다. External Usage /sync 가 이 함수로 호스트 Claude 세션
        스냅샷을 갱신한다 — 재노출을 빠뜨리면 그 경로가 ImportError 로 죽는다.

    `_sync_sessions_to_db` · `get_monitor` 는 패키지 밖에서 import 되지 않고
    `tests/backend/test_claude_session_sync.py` 가 **모듈 속성으로 패치**한다.
    패치 지점은 그 이름을 자기 네임스페이스에 바인딩한 모듈이므로 패키지
    재노출로는 대체되지 않는다 — 분할 시 그 테스트의 패치 대상을 함께 옮긴다.
    """
    from api.claude_sessions import scan_and_sync_claude_snapshots

    assert callable(scan_and_sync_claude_snapshots)
