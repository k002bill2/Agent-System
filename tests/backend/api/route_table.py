"""APIRouter의 HTTP 표면을 스냅샷으로 고정하는 헬퍼.

분할 리팩터링이 라우트를 잃거나 경로·이름을 바꾸지 않았음을 보증한다.
B1(api/git.py) 이후 B2의 라우트 나열 파일들이 그대로 재사용한다.
"""

import re

from fastapi import APIRouter

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
    """
    rows: list[list[str]] = []
    for route in router.routes:
        for method in sorted(getattr(route, "methods", set())):
            if method in _IGNORED_METHODS:
                continue
            rows.append([method, route.path, route.name])
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
    """
    routes = [r for r in router.routes if hasattr(r, "path_regex")]
    pairs: list[tuple[str, str]] = []
    for index, earlier in enumerate(routes):
        earlier_methods = set(getattr(earlier, "methods", set())) - _IGNORED_METHODS
        for later in routes[index + 1 :]:
            later_methods = set(getattr(later, "methods", set())) - _IGNORED_METHODS
            if not (earlier_methods & later_methods):
                continue
            if earlier.path_regex.fullmatch(_concrete_path(later.path)):
                pairs.append((earlier.path, later.path))
    return pairs
