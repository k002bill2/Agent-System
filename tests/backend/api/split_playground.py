"""services/playground_service.py(1,286줄) → 도메인 모듈 5종 분할 배정표. (B5.5 Task 5)

**이 대상만 2 단계다.** 최대 클래스 `PlaygroundService` 가 혼자 808 줄이라 정의
이동(1 단계)만으로는 한도에 못 들어간다. 그래서 먼저 메서드를 들어올린다:

    # 1 단계 — DB 그룹 5 개를 클래스 밖으로 (808 → 687 줄)
    src/backend/.venv/bin/python tests/backend/api/lift_staticmethods.py \
        <원본> PlaygroundService \
        _model_to_pydantic _pydantic_to_db_dict save_session_to_db \
        delete_session_from_db load_sessions_from_db > /tmp/lifted.py

    # 2 단계 — 정의 이동
    src/backend/.venv/bin/python tests/backend/api/split_playground.py \
        /tmp/lifted.py src/backend/services/playground_service/

**DB 그룹을 고른 것은 크기 때문이 아니라 제약 두 개를 한 번에 풀기 때문이다.**
`_initialized` 를 재바인딩하는 곳이 둘인데(`_load_sessions` · `load_sessions_from_db`)
후자가 클래스 안에 있어 `_load_sessions`(48줄)와 클래스(808줄)가 한 모듈로 묶였다
(856 > 800). DB 그룹을 들어올리면 둘이 같은 모듈(`storage`)로 모이고 클래스도 줄어든다.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from split_module import split  # noqa: E402

# ── 배정표: 이름 -> 모듈 ────────────────────────────────────────────────
#
# **재바인딩 vs 변형을 AST 로 구분한 것이 이 배정표의 근거다.**
# `global _sessions, _initialized` 가 두 곳에 있지만(L244·L1181) 실제로는:
#
#     _sessions     첨자 대입·삭제만 — **한 번도 재바인딩되지 않는다**
#                   (`global _sessions` 선언은 잉여다. 첨자 대입에는 필요 없다)
#     _initialized  L65 · L289 · L1188 에서 진짜 재바인딩
#
# 따라서 제약은 `_initialized` 하나이고, 그것을 재바인딩·판독하는 셋
# (`_load_sessions` 와 들어올린 `load_sessions_from_db`)이 `storage` 에 모인다.
# `_sessions` 는 변형만 되므로 여러 모듈이 `from .storage import _sessions` 로
# 같은 dict 를 가리키고, 배럴 재노출도 안전하다(테스트가 그렇게 쓴다).
#
# **패치 타깃 12 건은 앞의 세 태스크와 방향이 반대다.**
# `monkeypatch.setattr(playground_service, "_load_sessions"|"_save_sessions"
# |"_fire_and_forget", ...)` — 모듈 **객체** 패치다. 세 이름의 정의는 `storage` 로
# 가지만 **호출 지점은 21 곳 전부 `PlaygroundService` 안**이다(실측: storage 범위
# 0 건). `from .storage import _load_sessions` 는 바인딩을 복사하므로 패치는
# 정의처가 아니라 **읽는 쪽** 을 겨냥해야 한다 — `playground_service.service`.
# (`mock.patch` 문서의 "patch where it's used, not where it's defined" 그대로다.)
# 배럴에 세 이름을 두지 않으므로 낡은 경로는 `AttributeError` 로 죽는다.
ASSIGNMENT: dict[str, str] = {
    # ── config.py — 환경 플래그 · 경로 · 상수 ──
    #
    #   ⚠️ `STORAGE_DIR` 은 `Path(__file__).parent.parent / "data"` 다. 패키지
    #   승격으로 한 단계 깊어지므로 `.parent` 를 하나 더 타야 원래의
    #   `src/backend/data` 를 가리킨다. `SESSIONS_FILE` 이 여기서 파생되므로
    #   한 줄만 고치면 된다. `notification_service.DATA_DIR`(#358)과 같은 형태이고
    #   본문을 그대로 두면 `split_audit.py` 가 OK 를 낸다 — 같은 바이트, 다른 경로.
    "USE_DATABASE": "config",
    "STORAGE_DIR": "config",
    "SESSIONS_FILE": "config",
    "DEFAULT_SYSTEM_PROMPT": "config",
    "PLAYGROUND_TOOLS": "config",
    # ── storage.py — 파일·DB 영속화와 인메모리 캐시 ──
    #    `_DB_AVAILABLE` 을 세우는 try 문(원자 단위)과 그것을 읽는 DB 함수 셋이
    #    함께 있다. `_initialized` 재바인딩 두 곳도 여기 모인다.
    "_DB_AVAILABLE": "storage",
    "AsyncSession": "storage",
    "PlaygroundSessionModel": "storage",
    "_sessions": "storage",
    "_initialized": "storage",
    "_ensure_storage_dir": "storage",
    "_load_sessions": "storage",
    "_save_sessions": "storage",
    "_fire_and_forget": "storage",
    "_model_to_pydantic": "storage",
    "_pydantic_to_db_dict": "storage",
    "save_session_to_db": "storage",
    "delete_session_from_db": "storage",
    "load_sessions_from_db": "storage",
    # ── llm.py — LangChain 메시지 변환과 모델 폴백 ──
    "_to_lc_messages": "llm",
    "_coerce_llm_content": "llm",
    "_playground_usage_context": "llm",
    "_is_inaccessible_model_error": "llm",
    "_safe_playground_fallback_model": "llm",
    "_invoke_with_model_fallback": "llm",
    # ── mock.py — LLM 없이 쓰는 목 응답 생성기 ──
    "_generate_mock_response": "mock",
    "_generate_mock_tool_result": "mock",
    # ── service.py — PlaygroundService (13 메서드) ──
    "PlaygroundService": "service",
}

MODULE_ORDER = ["config", "storage", "llm", "mock", "service"]

DOCSTRINGS = {
    "config": (
        '"""플레이그라운드 설정 — 저장 모드 플래그 · 경로 · 기본 프롬프트 · 목 도구 목록.\n\n'
        "`STORAGE_DIR` 은 패키지 승격으로 이 파일의 깊이가 한 단계 늘어난 만큼\n"
        "`.parent` 를 하나 더 탄다. 원본(`services/playground_service.py`)이\n"
        '가리키던 `src/backend/data` 를 그대로 가리켜야 한다 — 세션 파일이 거기 있다.\n"""'
    ),
    "storage": (
        '"""세션 영속화 — 파일 I/O · DB 동기화 · 인메모리 캐시.\n\n'
        "`_initialized` 는 `_load_sessions` 와 `load_sessions_from_db` 양쪽에서\n"
        "재바인딩되므로 둘이 반드시 같은 모듈에 있어야 한다. `_sessions` 는 첨자\n"
        "대입만 되고 재바인딩되지 않으므로 다른 모듈이 import 해도 같은 dict 를 본다.\n\n"
        "`_load_sessions` · `_save_sessions` · `_fire_and_forget` 은 여기서 정의되지만\n"
        "**호출자는 전부 `service.py`** 다. 테스트는 그래서 정의처가 아니라\n"
        '`services.playground_service.service` 를 패치한다.\n"""'
    ),
    "llm": '"""LangChain 메시지 변환과 접근 불가 모델 폴백."""',
    "mock": '"""LLM 없이 동작을 확인할 때 쓰는 목 응답 생성기."""',
    "service": (
        '"""PlaygroundService — 세션 CRUD · 실행 · 도구 · 비교.\n\n'
        "DB 영속화 5 함수는 `storage.py` 로 들어올린 뒤 클래스에 같은 이름으로\n"
        "재부착했다(`staticmethod(...)`) — `PlaygroundService.save_session_to_db(...)`\n"
        "호출 형태가 그대로 유지된다. 클래스 전체가 `@staticmethod` 라 가능한 형태다.\n\n"
        "`_load_sessions` · `_save_sessions` · `_fire_and_forget` 을 읽는 곳이 전부\n"
        "이 모듈이다. 테스트는 이 모듈 객체를 패치한다 —\n"
        '`monkeypatch.setattr(playground_service.service, "_load_sessions", ...)`.\n"""'
    ),
}

BARREL = '''"""Playground service for agent testing environment.

원래 단일 `services/playground_service.py`(1,286줄)를 도메인별로 분할한 결과.
소비자의 `from services.playground_service import PlaygroundService` 는 그대로
유효하다.

재노출은 실측된 import 사이트가 요구하는 것만 담는다:

    api/playground.py -> PlaygroundService
    tests/…test_playground_service.py -> PlaygroundService · DEFAULT_SYSTEM_PROMPT
        · _to_lc_messages · _coerce_llm_content · _safe_playground_fallback_model
    tests/…(양쪽) -> `playground_service._sessions` 를 직접 변형한다

`_sessions` 를 재노출하는 것은 안전하다 — 첨자 대입·삭제만 되고 **한 번도
재바인딩되지 않으므로**(AST 로 확인) 배럴이 가리키는 dict 가 서브모듈의 그것과
계속 같다.

**의도적으로 빠진 것**

- `_load_sessions` · `_save_sessions` · `_fire_and_forget` — 테스트가 모듈 객체
  패치로 재바인딩한다(12 건). 정의는 `storage` 지만 **읽는 쪽은 전부 `service`**
  이므로 패치도 `services.playground_service.service` 를 겨냥해야 한다. 배럴에
  두면 낡은 경로가 성공하되 무효가 되고, 빠져 있으면 `setattr` 이 그 자리에서
  `AttributeError` 로 죽어 실패가 자기 위치를 가리킨다.
- `_initialized` — `global` 로 재바인딩된다. 값을 재노출하면 배럴이 낡은 `False`
  를 영구히 노출한다.
- `USE_DATABASE` · `STORAGE_DIR` · `SESSIONS_FILE` · `PLAYGROUND_TOOLS` ·
  `_DB_AVAILABLE` — 가져가는 곳이 없다.
"""

from .config import DEFAULT_SYSTEM_PROMPT
from .llm import _coerce_llm_content, _safe_playground_fallback_model, _to_lc_messages
from .service import PlaygroundService
from .storage import _sessions

__all__ = [
    "DEFAULT_SYSTEM_PROMPT",
    "PlaygroundService",
    "_coerce_llm_content",
    "_safe_playground_fallback_model",
    "_sessions",
    "_to_lc_messages",
]
'''


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    return split(
        Path(argv[1]),
        Path(argv[2]),
        assignment=ASSIGNMENT,
        docstrings=DOCSTRINGS,
        module_order=MODULE_ORDER,
        barrel=BARREL,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv))
