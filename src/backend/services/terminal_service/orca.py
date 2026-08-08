"""Orca IDE 어댑터와 그 CLI 프로토콜 (JSON 실행·타임아웃·에러 분류).

테스트(`test_terminal_service_orca.py`)의 `MODULE` 상수가 겨냥하는 모듈이다.
`shutil` · `sys` · `asyncio` · `_write_exec_script` 네 패치 타깃이 모두 여기
모여 있어, 분할 후 그 상수 한 줄만 이 경로로 바꾸면 7회 이상의 패치가 한꺼번에
유효해진다.
"""

import asyncio
import json
import logging
import os
import shutil
import sys
from typing import NamedTuple

from .base import TerminalAdapter, TerminalType, _write_exec_script

logger = logging.getLogger(__name__)


_ORCA_TIMEOUT_SECONDS = 20


_ORCA_UNREGISTERED_ERROR_CODES = frozenset(
    {"selector_not_found", "worktree_not_found", "repo_not_found"}
)


def _resolve_orca_command() -> str:
    """Return the Orca CLI executable name for this platform.

    On Linux a bare ``orca`` is the GNOME screen reader, not this app, so
    the IDE ships its CLI as ``orca-ide``. ``ORCA_CLI_COMMAND`` overrides
    both for non-standard installs. Resolved per call so environment and
    platform changes are picked up without reimporting.
    """
    override = os.getenv("ORCA_CLI_COMMAND")
    if override:
        return override
    return "orca" if sys.platform == "darwin" else "orca-ide"


class _OrcaResult(NamedTuple):
    """Outcome of a single ``orca ... --json`` invocation."""

    ok: bool
    code: str | None
    error: str | None


def _is_unregistered_worktree_error(result: _OrcaResult) -> bool:
    """Return True when the failure means the repo is unknown to Orca."""
    if result.code in _ORCA_UNREGISTERED_ERROR_CODES:
        return True
    text = (result.error or "").lower()
    return "not found" in text and ("worktree" in text or "repo" in text)


def _parse_orca_payload(stdout: str, stderr: str, returncode: int | None) -> _OrcaResult:
    """Parse an Orca JSON envelope into an ``_OrcaResult``.

    Orca emits ``{"ok": true, "result": {...}}`` on success and
    ``{"ok": false, "error": {"code": ..., "message": ...}}`` on failure,
    always on stdout, exiting non-zero for the latter.
    """
    if not stdout:
        detail = stderr or "no output"
        return _OrcaResult(False, None, f"orca exited with {returncode}: {detail}")

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        logger.error("orca returned non-JSON output (exit %s)", returncode)
        return _OrcaResult(False, None, f"failed to parse orca JSON response (exit {returncode})")

    if payload.get("ok"):
        return _OrcaResult(True, None, None)

    error = payload.get("error")
    if isinstance(error, dict):
        code = error.get("code")
        message = error.get("message") or code
    else:
        code = None
        message = str(error) if error else None
    return _OrcaResult(False, code, message or f"orca command failed (exit {returncode})")


async def _terminate_orca_process(proc: asyncio.subprocess.Process) -> None:
    """Kill and reap a child that outlived its timeout.

    Without this the abandoned ``orca`` process keeps running and can
    create the terminal *after* the API already reported failure.
    """
    try:
        proc.kill()
    except ProcessLookupError:
        return  # already exited; nothing to reap
    await proc.wait()


async def _run_orca_json(args: list[str]) -> _OrcaResult:
    """Run an ``orca`` CLI command with ``--json`` and parse its response.

    ``stdin`` is detached: CLIs inheriting uvicorn's stdin have hung or
    failed with broken pipes in this codebase before.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as e:
        logger.error("Failed to launch orca: %s", e)
        return _OrcaResult(False, None, str(e))

    try:
        raw_out, raw_err = await asyncio.wait_for(proc.communicate(), timeout=_ORCA_TIMEOUT_SECONDS)
    except TimeoutError:
        logger.error("orca command timed out after %ss", _ORCA_TIMEOUT_SECONDS)
        await _terminate_orca_process(proc)
        return _OrcaResult(False, None, f"orca command timed out after {_ORCA_TIMEOUT_SECONDS}s")
    except OSError as e:
        logger.error("orca command failed while reading output: %s", e)
        await _terminate_orca_process(proc)
        return _OrcaResult(False, None, str(e))

    stdout = raw_out.decode().strip() if raw_out else ""
    stderr = raw_err.decode().strip() if raw_err else ""
    return _parse_orca_payload(stdout, stderr, proc.returncode)


class OrcaAdapter(TerminalAdapter):
    """Orca workspace manager via its CLI.

    Spawns a terminal session inside the existing checkout with
    ``orca terminal create``; no new worktree is created.
    """

    async def is_available(self) -> bool:
        return shutil.which(_resolve_orca_command()) is not None

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        exec_script = _write_exec_script(project_path, command, branch_name, image_paths)

        orca_cmd = _resolve_orca_command()
        create_args = [
            orca_cmd,
            "terminal",
            "create",
            "--worktree",
            f"path:{project_path}",
            "--command",
            f"bash {exec_script}",
        ]
        if title:
            create_args += ["--title", title]
        create_args.append("--json")

        result = await _run_orca_json(create_args)

        # Recover once from an unregistered repo by adding it, then retrying.
        if not result.ok and _is_unregistered_worktree_error(result):
            added = await _run_orca_json(
                [orca_cmd, "repo", "add", "--path", project_path, "--json"]
            )
            if added.ok:
                result = await _run_orca_json(create_args)
            else:
                result = added

        if result.ok:
            return {
                "success": True,
                "terminal": TerminalType.ORCA.value,
                "message": f"Created Orca terminal at {project_path}",
            }

        logger.error("orca terminal create failed: %s", result.error)
        return {
            "success": False,
            "terminal": TerminalType.ORCA.value,
            "error": f"Failed to create Orca terminal: {result.error}",
        }
