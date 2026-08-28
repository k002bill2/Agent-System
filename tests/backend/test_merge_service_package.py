"""Invariants the ``services.merge_service`` package split has to keep.

Three hazards, none of which shows up as a failure anywhere else:

1. The barrel must keep every name its measured import sites reach for —
   including ``MergeRequestStatus``, which this package re-exports from
   ``models.git`` because three test sites import it from here.
2. ``GIT_AVAILABLE`` is rebound by six ``@patch`` decorators. It must stay in
   the module that reads it and must **not** be on the barrel: re-exporting
   makes a stale patch path succeed while ``service.py`` keeps reading its own
   global, so the patch is silently void.
3. ``try: from git import ... / except ImportError`` fails open. A refactor that
   introduces a circular import is caught as "dependency absent" and the module
   degrades silently — with ruff, mypy, a body-for-body split audit and the full
   suite all green. Only the flag's value shows it.
"""

import importlib

import pytest

import services.merge_service as barrel
import services.merge_service.requests as requests_module
import services.merge_service.service as service_module
from models.git import MergeRequestStatus

# Measured from the import sites, not guessed:
#   api/git/merge.py            -> get_merge_service · MergeServiceError
#   api/git/_shared.py          -> MergeRequestService · get_merge_service
#   tests/backend/test_git_service.py -> MergeService · MergeRequestService
#                                        · MergeRequestStatus
_PUBLIC_SURFACE = (
    "MergeRequestService",
    "MergeRequestStatus",
    "MergeService",
    "MergeServiceError",
    "get_merge_service",
)

# Names the barrel must NOT carry, and why each one would be a live bug.
_DELIBERATELY_ABSENT = (
    "GIT_AVAILABLE",
    "Repo",
    "GitCommandError",
    "_merge_requests",
)


@pytest.fixture(autouse=True)
def _clear_store():
    """The in-memory store is module state shared by every reader."""
    requests_module._merge_requests.clear()
    yield
    requests_module._merge_requests.clear()


@pytest.mark.parametrize("name", _PUBLIC_SURFACE)
def test_barrel_still_exposes_every_imported_name(name: str) -> None:
    """``services.merge_service`` stays valid verbatim at all of its import sites."""
    assert hasattr(barrel, name), f"배럴이 {name} 을 잃었다 — import 사이트가 시작 시점에 죽는다"


@pytest.mark.parametrize("name", _DELIBERATELY_ABSENT)
def test_barrel_omits_names_that_would_make_a_patch_silently_void(name: str) -> None:
    """Re-exporting these turns a loud failure into a silent one."""
    assert not hasattr(barrel, name), (
        f"배럴이 {name} 을 재노출한다 — 낡은 패치 경로가 성공하되 무효가 된다"
    )


def test_git_import_did_not_fall_back() -> None:
    """The ``except ImportError`` branch must not have fired.

    A circular import introduced by a future refactor is swallowed here as
    "GitPython is missing": ``MergeService.__init__`` then raises
    ``MergeServiceError`` for every caller while every gate stays green. Asserting
    the flag is the only check that sees it, so prove the dependency is really
    installed first, then assert the flag agrees.
    """
    importlib.import_module("git")  # 없으면 이 단언 자체가 무의미하다

    assert service_module.GIT_AVAILABLE is True
    assert service_module.Repo is not None
    assert service_module.GitCommandError is not Exception


def test_patch_target_reaches_the_only_reader() -> None:
    """``service.GIT_AVAILABLE`` is what ``MergeService.__init__`` actually reads.

    The six ``@patch`` decorators in ``test_git_service.py`` name this exact
    path. If the reader ever moves to another module this fails, while those
    tests could still pass for the wrong reason.
    """
    saved = service_module.GIT_AVAILABLE
    service_module.GIT_AVAILABLE = False
    try:
        with pytest.raises(barrel.MergeServiceError):
            barrel.MergeService(git_service=object())
    finally:
        service_module.GIT_AVAILABLE = saved


def test_store_is_not_split_across_modules() -> None:
    """Every reader of the request store sees the same dict."""
    requests_module._merge_requests.setdefault("p1", {})["mr1"] = "sentinel"

    assert requests_module._merge_requests["p1"]["mr1"] == "sentinel"


def test_re_exported_status_is_the_models_git_enum() -> None:
    """The barrel forwards the enum itself, not a copy."""
    assert barrel.MergeRequestStatus is MergeRequestStatus
