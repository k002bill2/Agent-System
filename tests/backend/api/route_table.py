"""APIRouter의 HTTP 표면을 스냅샷으로 고정하는 헬퍼.

분할 리팩터링이 라우트를 잃거나 경로·이름을 바꾸지 않았음을 보증한다.
B1(api/git.py) 이후 B2의 라우트 나열 파일들이 그대로 재사용한다.
"""

import re
from collections.abc import Iterator

from fastapi import APIRouter
from starlette.routing import BaseRoute, compile_path

# 프레임워크가 자동 부여하는 메서드는 계약이 아니므로 제외한다.
_IGNORED_METHODS = frozenset({"HEAD", "OPTIONS"})

# `{project_id}` / `{branch_name:path}` → (이름, 컨버터 또는 None)
_PARAM = re.compile(r"\{([^{}:]+)(?::([^{}]+))?\}")

# 컨버터별 **대표 샘플**. 각 값은 해당 컨버터의 정규식을 만족해야 한다 —
# 만족하지 않으면 그 구체 경로는 애초에 도달 불가능한 URL이라 가림 판정이
# 무의미해진다(test_route_table.py가 이 불변식을 강제한다).
#
# 모든 파라미터를 `X` 하나로 치환하면 `{id:int}` 같은 제약 컨버터에서
# 앞 라우트 정규식(`[0-9]+`)이 `X`를 거부해 **가림을 놓친다**. 안전망이
# 조용히 눈머는 것이라, 컨버터마다 유효한 값을 쓴다.
_CONVERTOR_SAMPLES = {
    "str": "X",
    # `.*`는 어떤 값에도 걸리므로 값을 늘릴 이유가 없다. 슬래시를 넣으면
    # 세그먼트 수가 달라져 오히려 false-positive를 만든다.
    "path": "X",
    "int": "1",
    "float": "1.0",
    "uuid": "00000000-0000-0000-0000-000000000000",
}


def _concrete_path(path: str) -> str:
    """경로 파라미터를 컨버터별 유효 샘플로 채워 **도달 가능한 구체 경로**를 만든다.

    컨버터를 생략한 `{name}`은 Starlette 기본값인 `str`로 취급한다.

    모르는 컨버터는 조용히 fallback 하지 않고 `ValueError`로 실패시킨다.
    미지 컨버터를 임의 값으로 넘기면 위에서 고친 false-negative가 그대로
    재발하는데 그때는 아무도 알아채지 못한다. 실패해야 새 컨버터를 도입한
    사람이 이 표를 갱신한다.
    """

    def replace(match: re.Match[str]) -> str:
        convertor = match.group(2) or "str"
        if convertor not in _CONVERTOR_SAMPLES:
            raise ValueError(
                f"알 수 없는 경로 컨버터 {convertor!r} ({path!r}). "
                f"_CONVERTOR_SAMPLES에 유효한 샘플을 추가할 것 — "
                f"임의 값으로 넘기면 경로 가림을 놓친다."
            )
        return _CONVERTOR_SAMPLES[convertor]

    return _PARAM.sub(replace, path)


def _iter_routes(router: APIRouter, prefix: str = "") -> Iterator[tuple[str, BaseRoute]]:
    """중첩 라우터를 평탄화해 `(유효 경로, route 객체)`를 **매칭 순서 그대로** 낸다.

    fastapi 0.139.0 / starlette 1.3.1의 `include_router`는 하위 라우트를 부모의
    `routes`로 복사하지 않고 `_IncludedRouter` 래퍼를 넣어 **지연 해석**한다.
    그래서 `router.routes`를 한 겹만 훑으면 하위 라우트가 통째로 보이지 않는다.

    구조가 비대칭이라 경로 조립 방식이 두 갈래다:

    | 등록 방식        | 경로가 있는 곳                  | prefix 위치                |
    |------------------|--------------------------------|----------------------------|
    | 직접 등록        | `route.path` (prefix **포함**) | 등록 시 이미 적용됨        |
    | `include_router` | 하위 `route.path` (prefix 없음)| `include_context.prefix`   |

    `include_context.prefix`는 **부모 쪽** prefix(부모 자신 + include 인자)를 담고,
    하위 라우터 **자신의** prefix는 하위 `route.path`에 이미 박혀 있다. 따라서
    누적 prefix에 `route.path`를 잇기만 하면 중첩이 깊어져도 이중 계산이 없다
    (실측: 3단 중첩 `/parent` → `/child` → `/leaf` = `/parent/child/leaf`).

    **래퍼 판별을 클래스명 문자열로 하지 않는 이유**: `type(route).__name__ ==
    "_IncludedRouter"`는 private 클래스 이름에 의존하므로, Starlette가 이름을
    바꾸면 판별이 조용히 실패하고 헬퍼가 예전의 눈먼 동작으로 되돌아간다 —
    이 파일에서 이미 한 번 고친 false-negative(컨버터 sentinel)와 같은 종류의
    실패다. 덕 타이핑으로 판별하면 속성 이름이 바뀌는 순간 `else` 가지가 래퍼에
    없는 `.path`를 읽어 `AttributeError`로 **시끄럽게** 깨진다.
    """
    for route in router.routes:
        if hasattr(route, "include_context") and hasattr(route, "original_router"):
            yield from _iter_routes(
                route.original_router, prefix + (route.include_context.prefix or "")
            )
        else:
            yield prefix + route.path, route


def snapshot(router: APIRouter) -> list[list[str]]:
    """(method, path, endpoint name) 목록을 **등록 순서 그대로** 반환한다.

    정렬하지 않는 것은 진단 편의 때문이다(실패 메시지가 원본 배치를 보여준다).
    비교는 집합으로 한다 — 전역 등록 순서는 동작 계약이 아니기 때문이다.
    분할은 도메인 모듈을 통째로 include_router 하므로 원본에서 흩어져 있던
    같은 도메인의 라우트가 한 덩어리로 뭉친다. 실측(2026-08-04) 결과
    branch-protection·draft-commits·fetch/pull/push가 자기 도메인 그룹과
    떨어져 선언돼 있어 전역 순서 복원은 애초에 불가능하다.

    순서가 실제로 문제되는 유일한 경우는 `shadowing_pairs()`가 잡는다.

    name까지 포함하는 이유: 핸들러를 다른 모듈로 옮길 때 함수명이 바뀌면
    operationId가 달라져 OpenAPI 소비자가 깨진다. 경로만 보면 놓친다.

    경로는 `_iter_routes()`가 계산한 **유효 경로**다 — 하위 라우터의
    `route.path`에는 prefix가 빠져 있어 그대로 쓰면 베이스라인과 어긋난다.
    """
    rows: list[list[str]] = []
    for path, route in _iter_routes(router):
        for method in sorted(getattr(route, "methods", set())):
            if method in _IGNORED_METHODS:
                continue
            rows.append([method, path, route.name])
    return rows


def shadowing_pairs(router: APIRouter) -> list[tuple[str, str]]:
    """먼저 등록된 라우트가 뒤 라우트를 영영 가려버리는 쌍을 찾는다.

    Starlette는 등록 순서대로 **전체 경로**를 정규식 매칭한다. 따라서
    `/projects/{id}/merge`가 `/projects/{id}/merge/status`를 가리는 일은
    없다(세그먼트 수가 다르다). 실제 가림은 같은 모양일 때만 생긴다 —
    `/branches/{branch_name}`가 뒤따르는 `/branches/current`를 삼키는 식.

    판정: 두 라우트의 HTTP 메서드가 겹치고, 뒤 라우트의 경로 파라미터를
    **컨버터별 유효 샘플**로 채운 결과(`_concrete_path`)가 앞 라우트의
    정규식에 걸리면 가림이다. 임의 리터럴 하나로 채우면 `{id:int}` 같은
    제약 컨버터에서 가림을 놓친다 — `test_route_table.py`가 이를 고정한다.

    실측(2026-08-04): 현재 63개 라우트에 이런 쌍은 **0건**이다. 이 함수는
    분할이 그 성질을 깨지 않았음을 보증한다.

    비교 대상은 `_iter_routes()`로 평탄화한 전 라우트이며, 판정에 쓰는 경로도
    **유효 경로**다. 분할은 도메인 모듈을 통째로 `include_router` 하므로 추출된
    라우트가 매칭 순서의 **뒤로** 밀린다 — 평탄화하지 않으면 남은 `_legacy`
    라우트끼리만 비교하고 정작 위험한 모듈 간 가림을 영영 보지 못한다.

    라우트가 들고 있는 `path_regex`는 하위 라우터의 **prefix 없는** 경로로
    컴파일돼 있어 유효 경로와 맞지 않는다. 그래서 유효 경로로 다시 컴파일한다 —
    `Route.__init__`이 쓰는 함수와 동일한 `compile_path`이므로, 같은 전체 경로로
    직접 등록했을 때의 정규식과 정확히 같다.
    """
    routes = [
        (path, set(getattr(route, "methods", set())) - _IGNORED_METHODS, compile_path(path)[0])
        for path, route in _iter_routes(router)
    ]
    pairs: list[tuple[str, str]] = []
    for index, (earlier_path, earlier_methods, earlier_regex) in enumerate(routes):
        for later_path, later_methods, _ in routes[index + 1 :]:
            if not (earlier_methods & later_methods):
                continue
            if earlier_regex.fullmatch(_concrete_path(later_path)):
                pairs.append((earlier_path, later_path))
    return pairs
