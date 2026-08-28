"""Invariants the ``services.playground_service`` package split has to keep.

This is the batch's only two-stage split: ``PlaygroundService`` was 808 lines on
its own, so five DB staticmethods were lifted to module level before the usual
definition move. That adds hazards the other four packages did not have.

1. **The lifted methods must still be reachable as class attributes.** They are
   re-attached with ``name = staticmethod(name)``, so ``PlaygroundService.
   save_session_to_db(...)`` keeps working. If a future edit drops a re-attach
   line, only a caller notices — and the only in-repo caller is the class itself.
2. **The patch target is the importer, not the definer.** ``_load_sessions`` and
   friends live in ``storage`` but every one of their 21 call sites is in
   ``service``. ``from .storage import _load_sessions`` copies the binding, so a
   patch on ``storage`` would not reach the callers. Twelve test sites name
   ``playground_service.service`` for exactly this reason.
3. **``STORAGE_DIR`` is depth-coupled**, same shape as ``notification_service.
   DATA_DIR``. Keeping the expression byte-identical would silently move the
   session file. ``SESSIONS_FILE`` derives from it.
"""

from pathlib import Path

import pytest
import sqlalchemy

import services.playground_service as barrel
import services.playground_service.config as config_module
import services.playground_service.service as service_module
import services.playground_service.storage as storage_module

# Measured from the import sites, not guessed:
#   api/playground.py -> PlaygroundService
#   tests/…test_playground_service.py -> PlaygroundService · DEFAULT_SYSTEM_PROMPT
#       · _to_lc_messages · _coerce_llm_content · _safe_playground_fallback_model
#   tests/… (both files) -> mutate `playground_service._sessions` directly
_PUBLIC_SURFACE = (
    "DEFAULT_SYSTEM_PROMPT",
    "PlaygroundService",
    "_coerce_llm_content",
    "_safe_playground_fallback_model",
    "_sessions",
    "_to_lc_messages",
)

# Names the barrel must NOT carry, and why each one would be a live bug.
_DELIBERATELY_ABSENT = (
    "_load_sessions",
    "_save_sessions",
    "_fire_and_forget",
    "_initialized",
)

# Lifted out of the class in stage 1 and re-attached with ``staticmethod(...)``.
_LIFTED = (
    "_model_to_pydantic",
    "_pydantic_to_db_dict",
    "save_session_to_db",
    "delete_session_from_db",
    "load_sessions_from_db",
)


@pytest.fixture(autouse=True)
def _clear_sessions():
    storage_module._sessions.clear()
    yield
    storage_module._sessions.clear()


@pytest.mark.parametrize("name", _PUBLIC_SURFACE)
def test_barrel_still_exposes_every_imported_name(name: str) -> None:
    """``services.playground_service`` stays valid verbatim at its import sites."""
    assert hasattr(barrel, name), f"배럴이 {name} 을 잃었다 — import 사이트가 시작 시점에 죽는다"


@pytest.mark.parametrize("name", _DELIBERATELY_ABSENT)
def test_barrel_omits_names_that_would_make_a_patch_silently_void(name: str) -> None:
    """Re-exporting these turns a loud failure into a silent one."""
    assert not hasattr(barrel, name), (
        f"배럴이 {name} 을 재노출한다 — 낡은 패치 경로가 성공하되 무효가 된다"
    )


@pytest.mark.parametrize("name", _LIFTED)
def test_lifted_db_helpers_are_still_class_attributes(name: str) -> None:
    """Stage 1 moved these out of the class; the re-attach keeps the call form.

    ``PlaygroundService.save_session_to_db(session)`` must stay valid — the
    class's own methods call them that way, so a dropped re-attach surfaces as
    an ``AttributeError`` deep inside a fire-and-forget task, where it is
    swallowed rather than raised.
    """
    attached = getattr(barrel.PlaygroundService, name, None)

    assert callable(attached), f"{name} 이 클래스에서 사라졌다 — staticmethod 재부착 누락"
    assert attached is getattr(storage_module, name), f"{name} 이 storage 의 그 함수가 아니다"
    # staticmethod 여야 한다 — 일반 함수로 붙으면 첫 인자가 암묵적으로 넘어간다.
    assert not hasattr(attached, "__self__")


def test_patch_target_is_the_module_that_reads_the_name() -> None:
    """``service`` holds its own binding of the storage helpers — patch it there.

    ``from .storage import _load_sessions`` copies the binding, so patching
    ``storage._load_sessions`` leaves ``service`` calling the real one. The
    twelve repointed test sites depend on this being true.
    """
    assert service_module._load_sessions is storage_module._load_sessions

    sentinel = object()
    original = service_module._load_sessions
    service_module._load_sessions = sentinel
    try:
        # 패치가 service 에만 걸리고 storage 는 그대로 — 두 이름이 갈라진다는 사실 자체가
        # "정의처를 패치하면 호출자에게 안 닿는다" 의 증거다.
        assert service_module._load_sessions is sentinel
        assert storage_module._load_sessions is original
    finally:
        service_module._load_sessions = original


def test_storage_dir_survived_the_extra_package_level() -> None:
    """``STORAGE_DIR`` still points at ``src/backend/data``, not one level shallower."""
    # `services` 패키지 위치에서 독립적으로 유도한다 — config 모듈 자신의 깊이로
    # 계산하면 구현을 되풀이하는 동어반복이라 아무것도 잡지 못한다.
    import services

    backend_root = Path(services.__file__).parent.parent

    assert config_module.STORAGE_DIR.resolve() == (backend_root / "data").resolve()
    assert config_module.STORAGE_DIR.parent.name == "backend"
    assert config_module.SESSIONS_FILE.parent == config_module.STORAGE_DIR


def test_db_import_did_not_fall_back() -> None:
    """The ``except ImportError`` branch must not have fired.

    A circular import introduced by a future refactor is swallowed here as
    "sqlalchemy is missing", and every DB write becomes a silent no-op while
    ruff, mypy and the suite all stay green.
    """
    assert sqlalchemy.__version__  # 없으면 이 단언 자체가 무의미하다

    assert storage_module._DB_AVAILABLE is True
    assert storage_module.PlaygroundSessionModel is not None


def test_sessions_cache_is_one_object_everywhere() -> None:
    """``_sessions`` is never rebound, so every holder sees the same dict."""
    assert barrel._sessions is storage_module._sessions
    assert service_module._sessions is storage_module._sessions

    storage_module._sessions["probe"] = "sentinel"

    assert barrel._sessions["probe"] == "sentinel"
    assert service_module._sessions["probe"] == "sentinel"
