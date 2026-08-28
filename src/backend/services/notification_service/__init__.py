"""Notification service for sending alerts across multiple channels.

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
    "_notification_history",
    "_rules",
    "notify_approval_required",
    "notify_task_completed",
    "notify_task_failed",
]
