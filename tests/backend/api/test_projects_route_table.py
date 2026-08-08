"""api/projects.py 분할이 HTTP 표면을 바꾸지 않았음을 보증한다.

B1(api/git.py)에서 만든 route_table 헬퍼를 그대로 재사용한다. 재사용할 수 없는
것은 베이스라인 JSON 과 Red-Green 증명이며, 그래서 파일마다 이 테스트가 필요하다.

**모듈 최상단의 정적 import 를 절대 함수 내부로 옮기지 마라.** app.py:118 의
`safe_import("api.projects", "router")` 는 `except Exception` 까지 잡아 None 을
반환하고 호출부는 조용히 건너뛴다. 즉 패키지가 깨져도 앱은 정상 기동하고
project-registry 라우트 14개만 통째로 사라진다 — 로그 한 줄만 남긴 채로.
아래 import 가 collection 단계에서 ImportError 로 실패하는 것이 유일한 조기 경보다.
"""

import json
from pathlib import Path

from api.projects import router

from .route_table import shadowing_pairs, snapshot

BASELINE = Path(__file__).parent / "projects_route_table.json"


def test_projects_route_table_unchanged() -> None:
    """라우트 유실·추가·개명을 잡는다."""
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    actual = snapshot(router)

    missing = [r for r in expected if r not in actual]
    added = [r for r in actual if r not in expected]

    assert not missing, f"분할 과정에서 사라진 라우트: {missing}"
    assert not added, f"분할 과정에서 생긴 라우트: {added}"


def test_no_shadowing_route_pairs() -> None:
    """먼저 등록된 경로가 뒤 경로를 가리지 않음을 보증한다.

    이 파일은 그 위험이 **실재하는** 첫 대상이다: `GET /project-registry/all` 이
    `GET /project-registry/{project_id}` 보다 앞에 등록돼 있다. 순서가 뒤집히면
    `{project_id}` 가 `all` 을 삼켜 영영 도달 불가가 된다.

    위 테스트는 집합 비교라 순서에 눈이 멀다. 전역 등록 순서 자체는 계약이
    아니지만(분할하면 도메인 모듈이 뭉치므로 반드시 바뀐다), 가림은 계약 위반이다.
    """
    pairs = shadowing_pairs(router)

    assert pairs == [], (
        f"경로 가림 발생 — 뒤 라우트가 도달 불가다: {pairs}. "
        "__init__.py 의 include_router 순서에서 구체 경로 모듈을 "
        "파라미터 경로 모듈보다 앞에 둘 것."
    )


def test_router_prefix_and_tags_unchanged() -> None:
    """마운트 계약. app.py 는 이 라우터를 prefix='/api' 로 붙인다.

    `/project-registry` 이지 `/projects` 가 아니다 — `/api/projects/*` 는
    orchestration 라우터의 소유다(OpenAPI 실측 2026-08-08). 분할 후 생기는
    `api/projects/` 패키지 이름이 이를 오인시키기 쉬우므로 여기 고정한다.
    """
    assert router.prefix == "/project-registry"
    assert router.tags == ["project-registry"]


def test_shared_helper_is_importable() -> None:
    """`_get_admin_org_ids` 재노출 계약.

    언더스코어 접두사지만 실제로는 공개 계약이다 — api/project_configs.py:258,
    api/claude_sessions.py:430, api/routes.py:213 이 `from api.projects import
    _get_admin_org_ids` 로 직접 가져간다. router 만 재노출하면 세 모듈이 깨진다.
    """
    from api.projects import _get_admin_org_ids

    assert callable(_get_admin_org_ids)
