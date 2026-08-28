"""Playground service for agent testing environment.

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
