"""Invariants the ``services.tmux_service`` package split has to keep.

The split is behavior-preserving movement, so most of its risk is invisible to
the existing suite. Two hazards are specific to this file and neither shows up
as a failure anywhere else:

1. The barrel must keep every name its measured import sites reach for. Those
   sites import at startup, so a dropped name fails there, not in a test.
2. The two ledger symbols the instrumentation tests rebind
   (``record_usage_best_effort`` · ``enforce_usage_quota_preflight_best_effort``)
   must stay in the same module as the functions that read them, and the barrel
   must **not** re-export them. Re-exporting makes a stale patch path succeed
   while the submodule keeps reading its own global — the patch is silently
   void. Leaving them off makes it die at the ``setattr`` line instead.
"""

import asyncio

import pytest

import services.tmux_service as barrel
import services.tmux_service.service as service_module
import services.tmux_service.usage as usage_module
from models.llm_usage import LLMUsageStatus
from utils.time import utcnow

# Measured from the import sites, not guessed:
#   src/backend/api/agents/tmux.py               -> get_tmux_service
#   tests/backend/test_llm_usage_instrumentation -> TmuxService, TmuxSessionInfo,
#                                                   parse_claude_cli_usage_metadata
# ``ClaudeAuthStatus`` has no importer today but is the return type of the public
# ``TmuxService.check_claude_auth``, so it belongs to the package's type surface.
_PUBLIC_SURFACE = (
    "ClaudeAuthStatus",
    "TmuxService",
    "TmuxSessionInfo",
    "get_tmux_service",
    "parse_claude_cli_usage_metadata",
)

# Names the barrel must NOT carry, and why each one would be a live bug.
_DELIBERATELY_ABSENT = (
    "record_usage_best_effort",
    "enforce_usage_quota_preflight_best_effort",
    "_tmux_service",
)


@pytest.fixture(autouse=True)
def _reset_singleton():
    """Restore the module singleton so ordering cannot leak an instance."""
    saved = service_module._tmux_service
    yield
    service_module._tmux_service = saved


@pytest.mark.parametrize("name", _PUBLIC_SURFACE)
def test_barrel_still_exposes_every_imported_name(name: str) -> None:
    """``services.tmux_service`` stays valid verbatim at all of its import sites."""
    assert hasattr(barrel, name), f"배럴이 {name} 을 잃었다 — import 사이트가 시작 시점에 죽는다"


@pytest.mark.parametrize("name", _DELIBERATELY_ABSENT)
def test_barrel_omits_names_that_would_make_a_patch_silently_void(name: str) -> None:
    """Re-exporting these turns a loud failure into a silent one.

    ``record_usage_best_effort`` and its preflight sibling are read by
    ``usage.py``; a patch on the barrel would not reach that global.
    ``_tmux_service`` is rebound through ``global``, so a barrel copy would
    freeze ``None`` forever.
    """
    assert not hasattr(barrel, name), (
        f"배럴이 {name} 을 재노출한다 — 낡은 패치 경로가 성공하되 무효가 된다"
    )


def test_ledger_patch_target_reaches_the_reader() -> None:
    """Patching ``usage.record_usage_best_effort`` reaches ``_record_tmux_cli_usage``.

    This is the load-bearing edge: the instrumentation tests patch that exact
    path. If the reader ever moves to another module, this fails while those
    tests could still pass for the wrong reason.
    """
    seen: list[str | None] = []

    async def fake_record(record) -> None:
        seen.append(record.metadata.get("event"))

    original = usage_module.record_usage_best_effort
    usage_module.record_usage_best_effort = fake_record
    try:
        asyncio.run(
            usage_module._record_tmux_cli_usage(
                usage_context={"user_id": "u1"},
                analysis_id="a1",
                project_path="/p",
                branch_name=None,
                session_name="aos-probe",
                status=LLMUsageStatus.SUCCESS,
                started_at=utcnow(),
                event="package_probe",
            )
        )
    finally:
        usage_module.record_usage_best_effort = original

    assert seen == ["package_probe"]


def test_singleton_is_not_split_across_modules() -> None:
    """The accessor and the global it rebinds stay in one module."""
    service_module._tmux_service = None

    first = barrel.get_tmux_service()
    second = barrel.get_tmux_service()

    assert first is second
    assert service_module._tmux_service is first
