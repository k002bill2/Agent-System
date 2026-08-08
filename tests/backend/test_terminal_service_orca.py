"""Unit tests for OrcaAdapter in terminal_service.

The Orca CLI binary is never invoked: ``asyncio.create_subprocess_exec`` is
mocked so the full argv-build → run → JSON-parse → recover path is exercised
without spawning a real terminal in the user's Orca app.

``_write_exec_script`` is also patched so no files are written to ``~/.aos``.
"""

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.terminal_service import (
    OrcaAdapter,
    TERMINAL_INFO,
    TerminalService,
    TerminalType,
    _resolve_orca_command,
)

MODULE = "services.terminal_service.orca"

FAKE_SCRIPT = Path("/tmp/aos-exec-test.sh")
PROJECT_PATH = "/Users/tester/Work/demo"


@pytest.fixture(autouse=True)
def _pin_orca_command(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin the CLI name so argv assertions hold on macOS and Linux alike.

    Resolution itself is covered by the dedicated tests below, which
    override this fixture's env var.
    """
    monkeypatch.setenv("ORCA_CLI_COMMAND", "orca")


def _proc(stdout: str = "", stderr: str = "", returncode: int = 0) -> MagicMock:
    """Build a mock asyncio subprocess whose communicate() returns given output."""
    proc = MagicMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(stdout.encode(), stderr.encode()))
    proc.wait = AsyncMock(return_value=returncode)
    return proc


def _ok_json() -> str:
    return json.dumps({"id": "x", "ok": True, "result": {"terminalId": "t-1"}})


def _err_json(code: str, message: str | None = None) -> str:
    return json.dumps(
        {"id": "x", "ok": False, "error": {"code": code, "message": message or code}}
    )


# ---------------------------------------------------------------------------
# is_available
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_is_available_true_when_cli_on_path() -> None:
    with patch(f"{MODULE}.shutil.which", return_value="/usr/local/bin/orca"):
        assert await OrcaAdapter().is_available() is True


@pytest.mark.asyncio
async def test_is_available_probes_resolved_command(monkeypatch: pytest.MonkeyPatch) -> None:
    """Availability must probe the platform-resolved binary, not a bare 'orca'."""
    monkeypatch.delenv("ORCA_CLI_COMMAND", raising=False)
    monkeypatch.setattr(f"{MODULE}.sys.platform", "linux")

    with patch(f"{MODULE}.shutil.which", return_value=None) as which_mock:
        assert await OrcaAdapter().is_available() is False

    which_mock.assert_called_once_with("orca-ide")


@pytest.mark.asyncio
async def test_is_available_false_when_cli_missing() -> None:
    with patch(f"{MODULE}.shutil.which", return_value=None):
        assert await OrcaAdapter().is_available() is False


# ---------------------------------------------------------------------------
# execute: success path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_success_builds_expected_argv() -> None:
    exec_mock = AsyncMock(return_value=_proc(stdout=_ok_json()))

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "do the thing")

    assert result["success"] is True
    assert result["terminal"] == TerminalType.ORCA.value
    assert result.get("error") is None

    args, kwargs = exec_mock.call_args
    assert list(args[:3]) == ["orca", "terminal", "create"]
    # --worktree / --command values must be single argv elements (no shell quoting)
    assert args[args.index("--worktree") + 1] == f"path:{PROJECT_PATH}"
    assert args[args.index("--command") + 1] == f"bash {FAKE_SCRIPT}"
    assert "--json" in args
    assert "--title" not in args
    # stdin must be detached: inherited stdin breaks CLIs under uvicorn.
    assert kwargs["stdin"] is asyncio.subprocess.DEVNULL
    assert kwargs["stdout"] is asyncio.subprocess.PIPE
    assert kwargs["stderr"] is asyncio.subprocess.PIPE


@pytest.mark.asyncio
async def test_execute_passes_title_flag() -> None:
    exec_mock = AsyncMock(return_value=_proc(stdout=_ok_json()))

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd", title="RUNNER")

    assert result["success"] is True
    args = exec_mock.call_args[0]
    assert args[args.index("--title") + 1] == "RUNNER"


@pytest.mark.asyncio
async def test_execute_forwards_branch_and_images_to_script_builder() -> None:
    exec_mock = AsyncMock(return_value=_proc(stdout=_ok_json()))

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT) as script_mock,
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        await OrcaAdapter().execute(
            PROJECT_PATH, "cmd", branch_name="feat/x", image_paths=["/tmp/a.png"]
        )

    script_mock.assert_called_once_with(PROJECT_PATH, "cmd", "feat/x", ["/tmp/a.png"])


# ---------------------------------------------------------------------------
# execute: failure paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_failure_on_error_payload() -> None:
    exec_mock = AsyncMock(
        return_value=_proc(stdout=_err_json("runtime_unreachable", "runtime is down"), returncode=1)
    )

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is False
    assert result["terminal"] == TerminalType.ORCA.value
    assert "runtime is down" in result["error"]
    # non-recoverable error must not trigger a repo-add retry
    assert exec_mock.await_count == 1


@pytest.mark.asyncio
async def test_execute_failure_on_nonzero_exit_without_json() -> None:
    exec_mock = AsyncMock(return_value=_proc(stdout="", stderr="orca: fatal", returncode=1))

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is False
    assert "orca: fatal" in result["error"]


@pytest.mark.asyncio
async def test_execute_failure_on_unparsable_json() -> None:
    exec_mock = AsyncMock(return_value=_proc(stdout="not json at all"))

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is False
    assert "parse" in result["error"].lower()


@pytest.mark.asyncio
async def test_execute_failure_on_timeout_kills_and_reaps_child() -> None:
    """A timed-out orca must be killed and reaped.

    Otherwise the orphan keeps running and can open the terminal *after*
    the API has already reported failure.
    """
    hung = _proc(stdout=_ok_json())
    exec_mock = AsyncMock(return_value=hung)

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
        patch(f"{MODULE}.asyncio.wait_for", side_effect=TimeoutError),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is False
    assert "timed out" in result["error"].lower()
    hung.kill.assert_called_once_with()
    hung.wait.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_timeout_tolerates_already_exited_child() -> None:
    """kill() racing a natural exit must not surface as a new error."""
    gone = _proc(stdout=_ok_json())
    gone.kill.side_effect = ProcessLookupError

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", AsyncMock(return_value=gone)),
        patch(f"{MODULE}.asyncio.wait_for", side_effect=TimeoutError),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is False
    assert "timed out" in result["error"].lower()
    gone.wait.assert_not_awaited()


@pytest.mark.asyncio
async def test_execute_failure_when_cli_cannot_launch() -> None:
    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(
            f"{MODULE}.asyncio.create_subprocess_exec",
            MagicMock(side_effect=OSError("no such file")),
        ),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is False
    assert "no such file" in result["error"]


# ---------------------------------------------------------------------------
# execute: repo-registration recovery
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_registers_repo_and_retries_once() -> None:
    exec_mock = AsyncMock(
        side_effect=[
            _proc(stdout=_err_json("selector_not_found"), returncode=1),  # create #1
            _proc(stdout=_ok_json()),  # repo add
            _proc(stdout=_ok_json()),  # create #2
        ]
    )

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is True
    assert exec_mock.await_count == 3

    repo_add_args = exec_mock.await_args_list[1][0]
    assert list(repo_add_args[:3]) == ["orca", "repo", "add"]
    assert repo_add_args[repo_add_args.index("--path") + 1] == PROJECT_PATH
    assert "--json" in repo_add_args


@pytest.mark.asyncio
async def test_execute_retries_only_once_when_second_create_fails() -> None:
    exec_mock = AsyncMock(
        side_effect=[
            _proc(stdout=_err_json("selector_not_found"), returncode=1),
            _proc(stdout=_ok_json()),
            _proc(stdout=_err_json("selector_not_found"), returncode=1),
        ]
    )

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is False
    assert exec_mock.await_count == 3


@pytest.mark.asyncio
async def test_execute_no_retry_when_repo_add_fails() -> None:
    exec_mock = AsyncMock(
        side_effect=[
            _proc(stdout=_err_json("selector_not_found"), returncode=1),
            _proc(stdout=_err_json("invalid_path", "path is not a git repo"), returncode=1),
        ]
    )

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is False
    assert exec_mock.await_count == 2
    assert "path is not a git repo" in result["error"]


# ---------------------------------------------------------------------------
# CLI executable resolution
# ---------------------------------------------------------------------------


def test_resolve_orca_command_prefers_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ORCA_CLI_COMMAND", "/opt/orca/bin/orca-custom")
    monkeypatch.setattr(f"{MODULE}.sys.platform", "linux")
    assert _resolve_orca_command() == "/opt/orca/bin/orca-custom"


def test_resolve_orca_command_on_macos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ORCA_CLI_COMMAND", raising=False)
    monkeypatch.setattr(f"{MODULE}.sys.platform", "darwin")
    assert _resolve_orca_command() == "orca"


def test_resolve_orca_command_off_macos_avoids_screen_reader(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """On Linux a bare 'orca' is the GNOME screen reader, so use orca-ide."""
    monkeypatch.delenv("ORCA_CLI_COMMAND", raising=False)
    monkeypatch.setattr(f"{MODULE}.sys.platform", "linux")
    assert _resolve_orca_command() == "orca-ide"


@pytest.mark.asyncio
async def test_execute_uses_resolved_command_for_create_and_repo_add(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Both the create and the recovery repo-add argv use the resolved binary."""
    monkeypatch.delenv("ORCA_CLI_COMMAND", raising=False)
    monkeypatch.setattr(f"{MODULE}.sys.platform", "linux")

    exec_mock = AsyncMock(
        side_effect=[
            _proc(stdout=_err_json("selector_not_found"), returncode=1),
            _proc(stdout=_ok_json()),
            _proc(stdout=_ok_json()),
        ]
    )

    with (
        patch(f"{MODULE}._write_exec_script", return_value=FAKE_SCRIPT),
        patch(f"{MODULE}.asyncio.create_subprocess_exec", exec_mock),
    ):
        result = await OrcaAdapter().execute(PROJECT_PATH, "cmd")

    assert result["success"] is True
    assert [call[0][0] for call in exec_mock.await_args_list] == [
        "orca-ide",
        "orca-ide",
        "orca-ide",
    ]


# ---------------------------------------------------------------------------
# registry wiring
# ---------------------------------------------------------------------------


def test_orca_registered_in_service() -> None:
    adapter = TerminalService().get_adapter(TerminalType.ORCA)
    assert isinstance(adapter, OrcaAdapter)


def test_orca_accepted_by_api_string_coercion() -> None:
    """POST /api/terminal/execute resolves the raw string via TerminalType()."""
    assert TerminalType("orca") is TerminalType.ORCA


def test_orca_terminal_info_present() -> None:
    info = TERMINAL_INFO[TerminalType.ORCA]
    assert info["name"] == "Orca"
    assert info["description"]


@pytest.mark.asyncio
async def test_detect_available_includes_orca() -> None:
    results = await TerminalService().detect_available()
    types = [r["type"] for r in results]
    assert TerminalType.ORCA.value in types
