"""services/notification_service.py(1,017줄) → 도메인 모듈 3종 분할 배정표. (B5.5 Task 4)

    # CWD = repo 루트. <원본> 은 패키지 승격 **직전** 커밋에서 꺼낸 스냅샷
    git show <승격직전ref>:src/backend/services/notification_service.py > /tmp/orig.py
    src/backend/.venv/bin/python tests/backend/api/split_notification.py \
        /tmp/orig.py src/backend/services/notification_service/

실행 로직은 `split_module.py` 에 있다. 이 파일은 **배정표와 그 근거**만 담는다.

**이 분할에는 엔진이 만들 수 없는 후속 수정이 하나 있다 — `DATA_DIR`.**
아래 config 절의 주석을 반드시 읽을 것. 본문 바이트가 같으면 오히려 깨진다.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from split_module import split  # noqa: E402

# ── 배정표: 이름 -> 모듈 ────────────────────────────────────────────────
#
# 하중 지지대 규칙: **재바인딩되는 이름은 그것을 읽는 함수 전부와 같은 모듈에.**
#
# 실측 (계획서 숫자를 물려받지 않았다):
#
# - 문자열 패치 **7 건**(계획서는 13 이라 적었다)이고 전부 한 형태다:
#   `patch("services.notification_service.httpx.AsyncClient")`.
#   `httpx` 를 읽는 세 곳(L135 Slack · L177 Discord · L290 Webhook)이 전부
#   어댑터라 `adapters.py` 로 재지정한다. 배럴에 `httpx` 를 두지 않으므로 낡은
#   경로는 `AttributeError` 로 즉시 죽는다.
# - `global` 재바인딩은 **`_channel_configs` 하나**(L549). 읽는 곳이 전부
#   `NotificationService` 안이라 같은 모듈에 둔다. 외부 소비자 0 건이므로
#   배럴에서도 뺀다 — 재노출하면 재바인딩 후 낡은 dict 를 영구히 노출한다.
# - `_rules` · `_notification_history` 는 재바인딩이 **없다**. 테스트가
#   `.clear()` 로 내용만 건드리므로(L81·82·196·197·600·601) 배럴 재노출이
#   같은 객체를 가리켜 안전하다 — 그래서 넣는다(테스트가 실제로 가져간다).
ASSIGNMENT: dict[str, str] = {
    # ── config.py — 환경 플래그와 채널 설정 파일 I/O ──
    #
    #   ⚠️ `DATA_DIR` 은 `Path(__file__).parent.parent / "data"` 다.
    #   원본은 `services/notification_service.py` 라 `.parent.parent` 가
    #   `src/backend/` 였지만, 패키지 안에서는 한 단계 깊어져 `services/` 를
    #   가리킨다 — 데이터 디렉토리가 조용히 이동한다. 패키지 안 어느 위치에
    #   두어도 `.parent.parent` 로는 맞출 수 없으므로 **본문을 고쳐야 한다**
    #   (`.parent.parent.parent`). 이것이 이 분할의 유일한 의도적 본문 변경이고
    #   `split_audit.py` 가 그 한 건을 정직하게 FAIL 로 보고한다 — 억누르지 말고
    #   전후 실행 비교로 절대 경로가 같은지 확인할 것.
    #   같은 형태가 `playground_service.STORAGE_DIR`(Task 5)에도 있다.
    "USE_DATABASE": "config",
    "DATA_DIR": "config",
    "CHANNEL_CONFIGS_FILE": "config",
    "_load_channel_configs": "config",
    "_save_channel_configs": "config",
    # ── adapters.py — 채널별 전송 어댑터 5종 ──
    #    `httpx` 를 읽는 곳이 전부 여기다(패치 타깃 7 건의 목적지).
    "NotificationAdapter": "adapters",
    "SlackAdapter": "adapters",
    "DiscordAdapter": "adapters",
    "EmailAdapter": "adapters",
    "WebhookAdapter": "adapters",
    # ── service.py — 규칙·발송·이력 + 모듈 상태 4종 + 편의 함수 3종 ──
    #    `_channel_configs` 의 `global` 재바인딩과 그 reader 가 전부 여기 있다.
    "ADAPTERS": "service",
    "_rules": "service",
    "_channel_configs": "service",
    "_notification_history": "service",
    "NotificationService": "service",
    "notify_task_completed": "service",
    "notify_task_failed": "service",
    "notify_approval_required": "service",
}

MODULE_ORDER = ["config", "adapters", "service"]

DOCSTRINGS = {
    "config": (
        '"""알림 설정 — 저장 모드 플래그와 채널 설정 파일 I/O.\n\n'
        "`DATA_DIR` 은 패키지 승격으로 이 파일의 깊이가 한 단계 늘어난 만큼\n"
        "`.parent` 를 하나 더 탄다. 원본(`services/notification_service.py`)이\n"
        "가리키던 `src/backend/data` 를 그대로 가리켜야 한다 — 기존 설정 파일이\n"
        '거기 있다.\n"""'
    ),
    "adapters": (
        '"""채널별 전송 어댑터.\n\n'
        "`httpx` 를 읽는 곳이 전부 여기다. 테스트는\n"
        "`services.notification_service.adapters.httpx.AsyncClient` 를 패치한다 —\n"
        '읽는 쪽을 다른 모듈로 가르면 패치가 조용히 무효가 된다.\n"""'
    ),
    "service": (
        '"""알림 규칙·발송·이력과 그 인메모리 상태.\n\n'
        "`_channel_configs` 는 `get_channel_config` 안에서 `global` 로 재바인딩된다.\n"
        "그것을 읽는 곳 전부가 이 모듈에 있어야 하고, 배럴은 이 이름을 재노출하면\n"
        '안 된다 — 재바인딩 이후 낡은 dict 를 영구히 노출한다.\n"""'
    ),
}

BARREL = '''"""Notification service for sending alerts across multiple channels.

원래 단일 `services/notification_service.py`(1,017줄)를 도메인별로 분할한 결과.
소비자의 `from services.notification_service import NotificationService` 는
그대로 유효하다.

재노출은 실측된 import 사이트가 요구하는 것만 담는다:

    api/organizations.py -> NotificationService · ADAPTERS
    api/notifications.py -> NotificationService · USE_DATABASE
    tests/…test_notification_service.py -> SlackAdapter · DiscordAdapter ·
        WebhookAdapter · NotificationService · _rules · _notification_history ·
        notify_task_completed · notify_task_failed

`NotificationAdapter`(추상 베이스) · `EmailAdapter` · `notify_approval_required`
는 현재 가져가는 곳이 없지만 위 이름들의 형제이고 재바인딩 대상이 아니라
같이 내보낸다.

`_rules` · `_notification_history` 를 재노출하는 것은 안전하다 — 재바인딩이
없어(모듈에 `global` 문 없음, 테스트도 `.clear()` 만 한다) 배럴이 가리키는
객체가 서브모듈의 그것과 계속 같다.

**의도적으로 빠진 것**

- `httpx` — 테스트가 `httpx.AsyncClient` 를 패치한다. 배럴에 두면 낡은 경로
  (`services.notification_service.httpx.AsyncClient`)가 성공해 버려 어댑터가
  실제로 어느 모듈에서 읽는지와 무관해진다. 빠져 있으면 `patch` 가 그 자리에서
  `AttributeError` 로 죽어 실패가 자기 위치를 가리킨다.
- `_channel_configs` — `global` 로 재바인딩된다. 값을 재노출하면 재바인딩
  이후 배럴이 낡은 dict 를 영구히 노출한다(`audit_service` 의 `_audit_logs` 와
  같은 형태).
- `DATA_DIR` · `CHANNEL_CONFIGS_FILE` — 가져가는 곳이 없다.
"""

from .adapters import (
    DiscordAdapter,
    EmailAdapter,
    NotificationAdapter,
    SlackAdapter,
    WebhookAdapter,
)
from .config import USE_DATABASE
from .service import (
    ADAPTERS,
    NotificationService,
    _notification_history,
    _rules,
    notify_approval_required,
    notify_task_completed,
    notify_task_failed,
)

__all__ = [
    "ADAPTERS",
    "USE_DATABASE",
    "DiscordAdapter",
    "EmailAdapter",
    "NotificationAdapter",
    "NotificationService",
    "SlackAdapter",
    "WebhookAdapter",
    "notify_approval_required",
    "notify_task_completed",
    "notify_task_failed",
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
