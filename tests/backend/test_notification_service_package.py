"""Invariants the ``services.notification_service`` package split has to keep.

Three hazards, none of which shows up as a failure anywhere else:

1. ``DATA_DIR`` is ``Path(__file__).parent…`` — a **depth-coupled** path. The
   package promotion put the file one level deeper, so keeping the expression
   byte-identical would silently move the data directory from ``src/backend/data``
   to ``src/backend/services/data``, and the existing channel config would read
   as empty. This is the split's one intentional body change; the assertion below
   is what makes it verified rather than assumed.
2. ``_channel_configs`` is rebound through ``global``. Its readers must stay in
   the module that rebinds it, and the barrel must not carry the value.
3. ``httpx`` must not be on the barrel. Seven ``patch`` sites name the module
   that actually reads it; a barrel copy would let a stale path succeed.
"""

from pathlib import Path

import httpx
import pytest

import services.notification_service as barrel
import services.notification_service.adapters as adapters_module
import services.notification_service.config as config_module
import services.notification_service.service as service_module

# Measured from the import sites, not guessed:
#   api/organizations.py -> NotificationService · ADAPTERS
#   api/notifications.py -> NotificationService · USE_DATABASE
#   tests/…test_notification_service.py -> SlackAdapter · DiscordAdapter ·
#       WebhookAdapter · NotificationService · _rules · _notification_history ·
#       notify_task_completed · notify_task_failed
_PUBLIC_SURFACE = (
    "ADAPTERS",
    "DiscordAdapter",
    "EmailAdapter",
    "NotificationAdapter",
    "NotificationService",
    "SlackAdapter",
    "USE_DATABASE",
    "WebhookAdapter",
    "_notification_history",
    "_rules",
    "notify_approval_required",
    "notify_task_completed",
    "notify_task_failed",
)

# Names the barrel must NOT carry, and why each one would be a live bug.
_DELIBERATELY_ABSENT = ("httpx", "_channel_configs")


@pytest.fixture(autouse=True)
def _clear_state():
    service_module._rules.clear()
    service_module._notification_history.clear()
    yield
    service_module._rules.clear()
    service_module._notification_history.clear()


@pytest.mark.parametrize("name", _PUBLIC_SURFACE)
def test_barrel_still_exposes_every_imported_name(name: str) -> None:
    """``services.notification_service`` stays valid verbatim at its import sites."""
    assert hasattr(barrel, name), f"배럴이 {name} 을 잃었다 — import 사이트가 시작 시점에 죽는다"


@pytest.mark.parametrize("name", _DELIBERATELY_ABSENT)
def test_barrel_omits_names_that_would_make_a_patch_silently_void(name: str) -> None:
    """Re-exporting these turns a loud failure into a silent one."""
    assert not hasattr(barrel, name), (
        f"배럴이 {name} 을 재노출한다 — 낡은 패치 경로가 성공하되 무효가 된다"
    )


def test_data_dir_survived_the_extra_package_level() -> None:
    """``DATA_DIR`` still points at ``src/backend/data``, not one level shallower.

    ``split_audit.py`` compares bodies byte for byte, so it reports this file's
    one changed line — and would have reported *nothing* had the line been left
    alone, which is exactly the failure: same bytes, different directory.
    """
    # `services` 패키지 위치에서 독립적으로 유도한다 — config 모듈 자신의 깊이로
    # 계산하면 구현을 그대로 되풀이하는 동어반복이 되어 아무것도 잡지 못한다.
    import services

    backend_root = Path(services.__file__).parent.parent

    assert config_module.DATA_DIR.resolve() == (backend_root / "data").resolve()
    assert config_module.DATA_DIR.parent.name == "backend"
    assert config_module.CHANNEL_CONFIGS_FILE.parent == config_module.DATA_DIR


def test_channel_config_rebinding_is_visible_to_its_readers() -> None:
    """``get_channel_config`` rebinds ``_channel_configs``; readers must follow.

    The reader and the ``global`` statement are in one module, so the rebound
    dict is what the next read sees. If they were ever split, this returns a
    config drawn from the stale copy.
    """
    from models.notification import NotificationChannel

    config = service_module.NotificationService.get_channel_config(NotificationChannel.SLACK)

    assert config is not None
    assert service_module._channel_configs[NotificationChannel.SLACK] is config


def test_adapters_read_the_process_wide_httpx_module() -> None:
    """The patch path ``adapters.httpx.AsyncClient`` reaches the adapters.

    Seven sites in ``test_notification_service.py`` name that exact path.
    """
    assert adapters_module.httpx is httpx


def test_state_objects_are_shared_not_copied() -> None:
    """The barrel forwards the same list/dict objects the service mutates."""
    assert barrel._rules is service_module._rules
    assert barrel._notification_history is service_module._notification_history
