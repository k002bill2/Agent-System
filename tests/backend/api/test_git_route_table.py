"""api/git.py 분할이 HTTP 표면을 바꾸지 않았음을 보증한다."""

import json
from pathlib import Path

from api.git import router

from .route_table import shadowing_pairs, snapshot  # 상대 import — 패키지다

BASELINE = Path(__file__).parent / "git_route_table.json"


def test_git_route_table_unchanged() -> None:
    """라우트 유실·추가·개명을 잡는다."""
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    actual = snapshot(router)

    missing = [r for r in expected if r not in actual]
    added = [r for r in actual if r not in expected]

    assert not missing, f"분할 과정에서 사라진 라우트: {missing}"
    assert not added, f"분할 과정에서 생긴 라우트: {added}"


def test_no_shadowing_route_pairs() -> None:
    """먼저 등록된 경로가 뒤 경로를 가리지 않음을 보증한다.

    위 테스트는 집합 비교라 순서에 눈이 멀다. 그런데 **전역 등록 순서는
    동작 계약이 아니다** — 분할은 도메인 모듈을 통째로 include_router 하므로
    원본에서 흩어져 있던 같은 도메인 라우트가 뭉치고, 전역 순서는 반드시
    바뀐다(실측 2026-08-05: branch-protection·draft-commits·fetch/pull/push가
    자기 도메인과 떨어져 선언돼 있어 원본 순서 복원은 불가능하다).

    순서가 실제로 동작을 바꾸는 경우는 하나뿐이다: 앞선 라우트의 정규식이
    뒤 라우트의 구체 경로를 삼켜 후자가 영영 도달 불가가 되는 것. 현재
    63개 라우트에 그런 쌍은 0건이며(실측), 분할이 이를 깨면 안 된다.
    """
    pairs = shadowing_pairs(router)

    assert pairs == [], (
        f"경로 가림 발생 — 뒤 라우트가 도달 불가다: {pairs}. "
        "__init__.py 의 include_router 순서에서 구체 경로 모듈을 "
        "파라미터 경로 모듈보다 앞에 둘 것."
    )


def test_router_prefix_and_tags_unchanged() -> None:
    """마운트 계약. app.py는 이 라우터를 prefix='/api'로 붙인다."""
    assert router.prefix == "/git"
    assert router.tags == ["git"]
