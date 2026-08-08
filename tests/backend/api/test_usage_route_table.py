"""api/usage.py 분할이 HTTP 표면을 바꾸지 않았음을 보증한다.

베이스라인(`usage_route_table.json`)은 **분할 전** 라우터에서 캡처했다.
분할 후에 생성하면 테스트가 구성상 통과해 그물이 아니라 고무도장이 된다
(`split_slice_selfconfirming_diff` 와 같은 실패 형태).
"""

import json
from pathlib import Path

from api.usage import router

from .route_table import shadowing_pairs, snapshot  # 상대 import — 패키지다

BASELINE = Path(__file__).parent / "usage_route_table.json"


def test_usage_route_table_unchanged() -> None:
    """라우트 유실·추가·개명을 잡는다."""
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    actual = snapshot(router)

    missing = [r for r in expected if r not in actual]
    added = [r for r in actual if r not in expected]

    assert not missing, f"분할 과정에서 사라진 라우트: {missing}"
    assert not added, f"분할 과정에서 생긴 라우트: {added}"


def test_no_shadowing_route_pairs() -> None:
    """먼저 등록된 경로가 뒤 경로를 가리지 않음을 보증한다.

    위 테스트는 집합 비교라 순서에 눈이 멀다. `/usage/claude-config` 처럼
    구체 경로가 여럿이고 파라미터 경로가 없는 현 구성에서는 가림 쌍이
    0건이며(실측 2026-08-09), 분할이 이를 깨면 안 된다.
    """
    pairs = shadowing_pairs(router)

    assert pairs == [], (
        f"경로 가림 발생 — 뒤 라우트가 도달 불가다: {pairs}. "
        "구체 경로를 파라미터 경로보다 앞에 둘 것."
    )


def test_router_prefix_and_tags_unchanged() -> None:
    """마운트 계약. app.py는 이 라우터를 prefix='/api'로 붙인다."""
    assert router.prefix == "/usage"
    assert router.tags == ["Usage"]
