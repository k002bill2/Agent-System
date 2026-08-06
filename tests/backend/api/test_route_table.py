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
from fastapi import APIRouter
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
