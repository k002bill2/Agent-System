"""api/agents.py 분할이 HTTP 표면을 바꾸지 않았음을 보증한다.

B1(api/git.py)에서 만든 route_table 헬퍼를 재사용한다. 파일마다 새로 필요한
것은 베이스라인 JSON 과 Red-Green 증명, 그리고 그 파일 고유의 재노출 계약이다.

**모듈 최상단의 정적 import 를 절대 함수 내부로 옮기지 마라.** app.py:91 의
`safe_import("api.agents", "router")` 는 `except Exception` 까지 잡아 None 을
반환하고 호출부는 조용히 건너뛴다. 즉 패키지가 깨져도 앱은 정상 기동하고
agents 라우트 29개만 통째로 사라진다. 아래 import 가 collection 단계에서
ImportError 로 실패하는 것이 유일한 조기 경보다.
"""

import json
from pathlib import Path

from api.agents import router

from .route_table import shadowing_pairs, snapshot

BASELINE = Path(__file__).parent / "agents_route_table.json"


def test_agents_route_table_unchanged() -> None:
    """라우트 유실·추가·개명을 잡는다."""
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    actual = snapshot(router)

    missing = [r for r in expected if r not in actual]
    added = [r for r in actual if r not in expected]

    assert not missing, f"분할 과정에서 사라진 라우트: {missing}"
    assert not added, f"분할 과정에서 생긴 라우트: {added}"


def test_no_shadowing_route_pairs() -> None:
    """먼저 등록된 경로가 뒤 경로를 가리지 않음을 보증한다.

    이 파일의 위험 지점은 `GET /agents/stats` 와 `GET /agents/{agent_id}` 다 —
    둘 다 2세그먼트라 순서가 뒤집히면 `{agent_id}` 가 `stats` 를 삼킨다.
    `orchestrate`·`mcp` 라우트는 전부 3세그먼트 이상이라 겹치지 않는다.

    따라서 분할 시 `stats` 와 `{agent_id}` 를 다른 모듈로 가르면 include 순서가
    곧 계약이 된다. 같은 모듈에 두는 것이 안전하다.
    """
    pairs = shadowing_pairs(router)

    assert pairs == [], (
        f"경로 가림 발생 — 뒤 라우트가 도달 불가다: {pairs}. "
        "__init__.py 의 include_router 순서에서 구체 경로 모듈을 "
        "파라미터 경로 모듈보다 앞에 둘 것."
    )


def test_router_prefix_and_tags_unchanged() -> None:
    """마운트 계약. app.py 는 이 라우터를 prefix='/api' 로 붙인다."""
    assert router.prefix == "/agents"
    assert router.tags == ["agents"]


def test_public_names_reexported() -> None:
    """`api.agents` 가 제공해야 하는 이름들.

    실측(2026-08-08) — 전부 패키지 밖에서 직접 가져간다:
      - `_resolve_ocr_runtime`      test_llm_usage_instrumentation.py:475
      - `extract_text_from_image`   test_llm_usage_instrumentation.py:492 이후
                                    (`from api import agents as agents_api` 후
                                     `agents_api.extract_text_from_image(...)`)
      - `_validate_project_path`    test_gemini_review_fixes.py:35·42·49·57
      - `ALLOWED_WORKSPACE_ROOTS`   test_gemini_review_fixes.py:49
      - `get_allowed_workspace_roots` test_gemini_review_fixes.py:80·89

    언더스코어 접두사가 붙었어도 실제로는 공개 계약이다. `router` 만
    재노출하면 두 테스트 파일이 ImportError·AttributeError 로 깨진다.
    """
    import api.agents as agents_pkg
    from api.agents import (
        ALLOWED_WORKSPACE_ROOTS,
        _resolve_ocr_runtime,
        _validate_project_path,
        get_allowed_workspace_roots,
    )

    assert callable(_resolve_ocr_runtime)
    assert callable(_validate_project_path)
    assert callable(get_allowed_workspace_roots)
    assert ALLOWED_WORKSPACE_ROOTS is not None

    # 모듈 속성 접근 경로 — `from ... import` 가 아니라 attribute lookup 이다
    assert hasattr(agents_pkg, "extract_text_from_image")
