"""api/project_configs.py 분할이 HTTP 표면을 바꾸지 않았음을 보증한다.

B1(api/git.py)에서 만든 route_table 헬퍼를 재사용한다. 파일마다 새로 필요한
것은 베이스라인 JSON 과 Red-Green 증명, 그리고 그 파일 고유의 순서 계약이다.

**모듈 최상단의 정적 import 를 절대 함수 내부로 옮기지 마라.** app.py:94 의
`safe_import("api.project_configs", "router")` 는 `except Exception` 까지 잡아
None 을 반환하고 호출부는 조용히 건너뛴다. 즉 패키지가 깨져도 앱은 정상
기동하고 project-configs 라우트 **60개**가 통째로 사라진다. 아래 import 가
collection 단계에서 ImportError 로 실패하는 것이 유일한 조기 경보다.
"""

import json
from pathlib import Path

from api.project_configs import router

from .route_table import shadowing_pairs, snapshot

BASELINE = Path(__file__).parent / "project_configs_route_table.json"


def test_project_configs_route_table_unchanged() -> None:
    """라우트 유실·추가·개명을 잡는다."""
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    actual = snapshot(router)

    missing = [r for r in expected if r not in actual]
    added = [r for r in actual if r not in expected]

    assert not missing, f"분할 과정에서 사라진 라우트: {missing}"
    assert not added, f"분할 과정에서 생긴 라우트: {added}"


def test_no_shadowing_route_pairs() -> None:
    """먼저 등록된 경로가 뒤 경로를 가리지 않음을 보증한다.

    **B2 대상 중 순서 제약이 가장 많은 파일이다** — 실측(2026-08-08) 10건:

    | 삼키는 쪽 | 삼켜지는 쪽 |
    |---|---|
    | `GET /{project_id}`                          | `/global` · `/paths` · `/stream` · `/by-path` |
    | `GET·POST /{project_id}/rules`               | `GET·POST /global/rules`                      |
    | `PUT·DELETE /{project_id}/rules/{rule_id}`   | 같은 모양 `/global/rules/{rule_id}`           |
    | `GET /{project_id}/rules/{rule_id}/content`  | `/global/rules/{rule_id}/content`             |
    | `PUT /{project_id}/memories/{memory_id}`     | `PUT /{project_id}/memories/index`            |

    `{project_id}` 자리에 리터럴 `global` 이 들어가면 전역 규칙 경로와 모양이
    같아진다 — 이 파일에서 가장 놓치기 쉬운 제약이다. 따라서 전역 규칙 모듈은
    프로젝트 규칙 모듈보다 **먼저** include 해야 한다.

    memories 제약은 **같은 도메인 안**이라 include 순서로 풀 수 없다. 모듈
    안에서 `/memories/index` 핸들러가 `/memories/{memory_id}` 보다 먼저
    선언돼 있어야 한다 — 원본 선언 순서를 유지하는 것이 유일한 방어다.
    """
    pairs = shadowing_pairs(router)

    assert pairs == [], (
        f"경로 가림 발생 — 뒤 라우트가 도달 불가다: {pairs}. "
        "__init__.py 의 include 순서(전역→프로젝트) 또는 모듈 안의 "
        "핸들러 선언 순서(구체→파라미터)를 확인할 것."
    )


def test_external_paths_precedes_project_remove() -> None:
    """`shadowing_pairs()` 가 못 잡는 **부분 겹침** 1건을 고정한다.

    `DELETE /external-paths/{path_encoded}` 와 `DELETE /{project_id}/remove` 는
    서로를 완전히 가리지는 않지만, URL `/project-configs/external-paths/remove`
    는 **양쪽 모두에 매칭**된다. 먼저 등록된 쪽이 이긴다.

    원본은 external-paths 가 먼저였다(선언 인덱스 9 vs 10). 순서가 뒤집히면
    그 URL 이 `remove_project_from_monitoring(project_id="external-paths")` 로
    가는 **동작 변경**이 된다 — 분할이 허용하지 않는 종류다.

    두 라우트를 같은 모듈에 원본 순서로 두면 자동으로 지켜지지만, 계약을
    문서가 아니라 테스트로 고정해 둔다.
    """
    order = [
        (method, path)
        for method, path, _ in snapshot(router)
        if method == "DELETE"
        and path
        in (
            "/project-configs/external-paths/{path_encoded}",
            "/project-configs/{project_id}/remove",
        )
    ]

    assert order == [
        ("DELETE", "/project-configs/external-paths/{path_encoded}"),
        ("DELETE", "/project-configs/{project_id}/remove"),
    ], f"external-paths 삭제가 {{project_id}}/remove 보다 앞이어야 한다: {order}"


def test_router_prefix_and_tags_unchanged() -> None:
    """마운트 계약. app.py 는 이 라우터를 prefix='/api' 로 붙인다."""
    assert router.prefix == "/project-configs"
    assert router.tags == ["project-configs"]


def test_only_router_is_public() -> None:
    """이 패키지가 밖으로 제공하는 이름은 `router` 하나다.

    실측(2026-08-08): `from api.project_configs import ...` 소비자는
    `api/app.py:94` 의 `safe_import` 뿐이고, 모듈 객체 패치
    (`patch.object(project_configs, ...)`)도 0건이다.

    유일한 비-라우트 헬퍼 `_get_db_filtered_projects` 는 `list_projects`
    단독 소비자라 패키지 밖으로 나가지 않는다.
    """
    import api.project_configs as pkg

    assert pkg.router is router
    assert getattr(pkg, "__all__", ["router"]) == ["router"]
