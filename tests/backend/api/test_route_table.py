"""`shadowing_pairs()`가 실제로 경로 가림을 탐지하는지 인위적 라우터로 실증한다.

`test_git_route_table.py`는 실제 라우터의 가림 쌍이 0건임을 확인할 뿐이라
**"항상 빈 리스트를 반환하는 헬퍼"와 구별되지 않는다.** 이 파일이 그 공백을 메운다.
헬퍼는 B2의 라우트 나열 파일 5개(project_configs·agents·claude_sessions·
projects·agent_registry)에서 재사용되므로, 재사용 전에 탐지 능력이 증명돼야 한다.

내부 심볼(`_concrete_path`·`_CONVERTOR_SAMPLES`)을 직접 import 하는 것은 의도적이다.
치환 규칙은 헬퍼의 정확성을 좌우하는 핵심 계약인데, 공개 API인 `shadowing_pairs()`
만으로는 미지 컨버터 처리와 샘플 유효성을 검증할 방법이 없다.
"""

import re

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from starlette.convertors import CONVERTOR_TYPES

from .route_table import _CONVERTOR_SAMPLES, _concrete_path, shadowing_pairs, snapshot


def _endpoint() -> dict[str, str]:
    """가림 판정은 경로 정규식만 보므로 핸들러 본문은 의미가 없다."""
    return {}


def _make_router(*routes: tuple[str, str]) -> APIRouter:
    """(method, path)를 **주어진 순서대로** 등록한다 — 등록 순서가 곧 매칭 순서다."""
    router = APIRouter()
    for method, path in routes:
        router.add_api_route(path, _endpoint, methods=[method])
    return router


def _make_two_level_nesting() -> APIRouter:
    """`include_router`가 **2단계** 겹친 조부모 라우터를 만든다 — 유효 경로는 `/gp/p/c/leaf`.

    prefix가 네 군데에서 온다: 조부모 자신(`/gp`), 부모 자신(`/p`),
    부모가 자식을 포함할 때 준 인자(`/c`), 그리고 자식의 `route.path`(`/leaf`).
    경로 파라미터를 넣지 않는 것은 의도적이다 — 도달성 테스트가 이 경로로
    **실제 요청을 보내야** 하므로 URL 조립이 필요 없어야 한다.
    """
    grandparent = APIRouter(prefix="/gp")
    parent = APIRouter(prefix="/p")
    child = _make_router(("GET", "/leaf"))
    parent.include_router(child, prefix="/c")
    grandparent.include_router(parent)
    return grandparent


def test_detects_shadowing_with_constrained_convertor() -> None:
    """제약 컨버터(`:int`)에서도 가림을 탐지한다 — 이번 수정의 회귀 테스트.

    치환 sentinel이 컨버터를 무시하고 `X` 하나로 고정돼 있으면, 뒤 라우트의
    구체 경로가 `/items/X`가 된다. 앞 라우트 정규식은 `[0-9]+`를 요구하므로
    매칭에 실패하고, **완전히 가려진 라우트를 놓친다**(false-negative).
    """
    router = _make_router(("GET", "/items/{id:int}"), ("GET", "/items/{other:int}"))

    assert shadowing_pairs(router) == [("/items/{id:int}", "/items/{other:int}")]


def test_detects_shadowing_with_default_convertor() -> None:
    """컨버터를 생략한 `{name}`은 str이며, 뒤따르는 구체 경로를 삼킨다."""
    router = _make_router(("GET", "/branches/{name}"), ("GET", "/branches/current"))

    assert shadowing_pairs(router) == [("/branches/{name}", "/branches/current")]


def test_correct_order_is_not_flagged() -> None:
    """구체 경로가 먼저면 가림이 아니다 — 이것이 올바른 등록 순서다."""
    router = _make_router(("GET", "/branches/current"), ("GET", "/branches/{name}"))

    assert shadowing_pairs(router) == []


def test_disjoint_methods_are_not_shadowing() -> None:
    """경로 모양이 같아도 메서드가 겹치지 않으면 서로 도달을 막지 않는다."""
    router = _make_router(("GET", "/branches/{name}"), ("POST", "/branches/current"))

    assert shadowing_pairs(router) == []


def test_path_convertor_detection_unchanged() -> None:
    """`:path`는 기존과 동일하게 단일 세그먼트로 치환된다.

    `.*`는 어떤 값에도 걸리므로 값을 늘릴 이유가 없고, 슬래시를 넣으면
    세그먼트 수가 달라져 오히려 false-positive를 만든다.
    """
    router = _make_router(("GET", "/files/{file_path:path}"), ("GET", "/files/{other:path}"))

    assert shadowing_pairs(router) == [("/files/{file_path:path}", "/files/{other:path}")]


def test_unknown_convertor_raises_instead_of_guessing() -> None:
    """미지 컨버터는 조용히 fallback 하지 않고 실패한다.

    `X`로 넘기면 이번에 고친 false-negative가 그대로 재발하는데, 그때는
    아무도 알아채지 못한다. 실패시켜야 새 컨버터를 도입한 사람이 이
    헬퍼를 갱신하게 된다.
    """
    with pytest.raises(ValueError, match="alien"):
        _concrete_path("/items/{id:alien}")


def test_snapshot_descends_into_included_routers() -> None:
    """`include_router`로 붙인 하위 라우트가 **최종 경로로** 스냅샷에 나타난다.

    fastapi 0.139.0 / starlette 1.3.1의 `include_router`는 하위 라우트를
    부모의 `routes`로 복사하지 않고 `_IncludedRouter` 래퍼를 넣어 지연
    해석한다. 래퍼에는 `methods`도 `path`도 없으므로, 평탄화 없이
    `router.routes`만 훑으면 **하위 라우트가 통째로 사라진다** — 분할이
    라우트를 잃어도 안전망이 침묵한다.

    래퍼 판별을 클래스명 문자열(`_IncludedRouter`)로 하면 Starlette가
    이름을 바꾸는 순간 헬퍼가 조용히 예전의 깨진 동작으로 되돌아간다.
    덕 타이핑(`include_context`/`original_router`)으로 판별하면 그때
    `else` 가지에서 래퍼에 없는 `.path`를 읽어 AttributeError로 **시끄럽게**
    깨진다. 이 테스트가 그 경보다.
    """
    parent = APIRouter(prefix="/parent")
    child = _make_router(("GET", "/items"))
    parent.include_router(child)

    assert snapshot(parent) == [["GET", "/parent/items", "_endpoint"]]


def test_shadowing_pairs_descends_into_included_routers() -> None:
    """모듈 경계를 넘는 가림도 탐지한다 — 분할 후에는 이것이 유일한 순서 위험이다.

    분할은 도메인 모듈을 통째로 `include_router` 하므로, 추출된 구체 경로가
    남아 있는 파라미터 경로보다 **뒤로** 밀린다. 평탄화하지 않으면 헬퍼는
    `_legacy`의 라우트끼리만 비교하고 이 가림을 영영 보지 못한다.

    가림 판정에 쓰는 경로는 `route.path`(prefix 미포함, 예: `/current`)가
    아니라 **유효 경로**(`/parent/current`)여야 한다.
    """
    parent = APIRouter(prefix="/parent")
    parent.add_api_route("/{name}", _endpoint, methods=["GET"])
    child = _make_router(("GET", "/current"))
    parent.include_router(child)

    assert shadowing_pairs(parent) == [("/parent/{name}", "/parent/current")]


def test_snapshot_accumulates_nested_prefixes_without_double_counting() -> None:
    """2단계 중첩에서 prefix가 **한 번씩만** 누적된다.

    위 두 테스트는 `include_router`가 **1단계**인 라우터만 구성하는데,
    1단계에서는 `include_context.prefix`가 "그 지점의 로컬 prefix"라는 가설과
    "루트부터의 누적 prefix"라는 가설이 **같은 값을 내므로 서로 구별되지 않는다.**
    두 가설이 갈라지는 것은 깊이 2부터다 — 누적값 가설이 참이라면
    `_iter_routes()`의 `prefix + ...`가 조상 prefix를 두 번 더해
    `/gp/gp/p/c/leaf` 같은 경로가 나온다.

    실측(fastapi 0.139.0 / starlette 1.3.1)은 **로컬** 가설이 참임을 보였다:
    깊이 1의 `include_context.prefix`는 `/p/c`(부모 자신 + include 인자)이지
    조부모의 `/gp`를 포함하지 않는다. 이 테스트가 그 사실을 고정한다 —
    1회성 실측은 Starlette가 의미를 바꾸는 순간 아무것도 막지 못한다.

    가정이 아니라 예정된 구조다: 계획서의 Task 6(`branch_protection.py`)과
    Task 10(`staging.py`/`sync.py`)에서 손자 라우터가 생기며, 그때
    `api.git.router`는 정확히 2단계 중첩을 갖는다.
    """
    grandparent = _make_two_level_nesting()

    assert snapshot(grandparent) == [["GET", "/gp/p/c/leaf", "_endpoint"]], (
        "2단계 중첩의 유효 경로가 어긋났다 — prefix 조각이 중복되면 "
        "`/gp/gp/p/c/leaf`처럼 조상 prefix가 두 번 들어간다"
    )


def test_snapshot_paths_are_actually_reachable() -> None:
    """스냅샷이 낸 경로로 **실제 요청이 도달**한다 — 헬퍼와 라우팅을 한 쌍으로 묶는다.

    위 테스트보다 강한 불변식이다. 헬퍼는 `include_context`·`original_router`
    같은 라우터 **내부 구조**를 들여다봐서 경로를 재구성한다. 프레임워크가 그
    구조나 조립 규칙을 바꾸면 헬퍼가 계산한 경로와 실제 라우팅이 **갈라질 수
    있는데**, 그때 스냅샷 비교는 여전히 자기 자신과 일관되므로 조용히 통과하고
    API만 깨진 상태가 된다. 이 테스트는 계산된 경로를 실제 서버에 던져 그
    분기를 막는다.

    요청 URL을 리터럴로 쓰지 않고 `snapshot()` 출력에서 뽑는 것이 요점이다 —
    하드코딩하면 두 개의 독립된 단언이 될 뿐 둘을 묶지 못한다.
    """
    grandparent = _make_two_level_nesting()
    app = FastAPI()
    app.include_router(grandparent)
    # 스냅샷은 라우터에만 건다. `app.router`를 쓰면 /openapi.json·/docs 등
    # 프레임워크 기본 라우트가 섞여 대상이 흐려진다.
    [[method, path, _name]] = snapshot(grandparent)

    response = TestClient(app).request(method, path)

    assert response.status_code == 200, (
        f"스냅샷이 낸 {method} {path}에 실제로는 도달할 수 없다 "
        f"(status={response.status_code}) — 헬퍼의 경로 재구성과 프레임워크 "
        f"라우팅이 갈라졌다"
    )


def test_convertor_samples_cover_starlette_and_are_valid() -> None:
    """샘플 표가 Starlette 내장 컨버터와 정합하며, 각 샘플이 자기 정규식을 만족한다.

    Starlette가 컨버터를 추가하면 이 테스트가 먼저 깨져 표 갱신을 요구한다.
    샘플이 자기 컨버터 정규식에 맞지 않으면 그 구체 경로는 애초에 도달
    불가능한 URL이라 가림 판정 자체가 무의미해진다.
    """
    assert set(_CONVERTOR_SAMPLES) == set(CONVERTOR_TYPES)

    for name, sample in _CONVERTOR_SAMPLES.items():
        assert re.fullmatch(CONVERTOR_TYPES[name].regex, sample), (
            f"{name!r} 샘플 {sample!r}이 자기 컨버터 정규식에 맞지 않는다"
        )
