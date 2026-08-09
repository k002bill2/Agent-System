"""터미널 앱별 어댑터 (Warp · tmux · Terminal.app · iTerm · Kitty ·
Alacritty · Ghostty · WezTerm · cmux)."""

import asyncio
import logging
import shlex
import shutil
import subprocess
import time
from pathlib import Path

from .base import (
    TerminalAdapter,
    TerminalType,
    _build_full_command,
    _run_osascript,
    _save_prompt_and_build_cmd,
    _write_exec_script,
)

logger = logging.getLogger(__name__)


class WarpAdapter(TerminalAdapter):
    """Delegates to the existing WarpService."""

    async def is_available(self) -> bool:
        from services.warp_service import get_warp_service

        return get_warp_service().is_warp_installed()

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        from services.warp_service import get_warp_service

        warp = get_warp_service()
        claude_cmd = warp.build_claude_command(task=command, image_paths=image_paths)
        result = warp.open_with_command(
            path=project_path,
            command=claude_cmd,
            title=title,
            new_window=False,
            branch_name=branch_name,
        )
        return {
            "success": result.get("success", False),
            "terminal": TerminalType.WARP.value,
            "message": result.get("message"),
            "error": result.get("error"),
        }


class TmuxAdapter(TerminalAdapter):
    """Creates a tmux session and sends commands to it."""

    async def is_available(self) -> bool:
        return shutil.which("tmux") is not None

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        timestamp = int(time.time())
        session_name = f"aos-{timestamp}"

        try:
            subprocess.run(
                ["tmux", "new-session", "-d", "-s", session_name, "-c", project_path],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as e:
            logger.error("Failed to create tmux session: %s", e.stderr)
            return {
                "success": False,
                "terminal": TerminalType.TMUX.value,
                "error": f"Failed to create tmux session: {e.stderr}",
            }

        # Optional branch creation
        if branch_name:
            try:
                subprocess.run(
                    [
                        "tmux",
                        "send-keys",
                        "-t",
                        session_name,
                        f"git checkout -b {shlex.quote(branch_name)}",
                        "Enter",
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            except subprocess.CalledProcessError as e:
                logger.warning("Branch checkout send failed: %s", e.stderr)

        # Build and send the claude command
        claude_cmd = _save_prompt_and_build_cmd(command, image_paths)
        try:
            subprocess.run(
                ["tmux", "send-keys", "-t", session_name, claude_cmd, "Enter"],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as e:
            logger.error("Failed to send command to tmux: %s", e.stderr)
            return {
                "success": False,
                "terminal": TerminalType.TMUX.value,
                "error": f"Failed to send command: {e.stderr}",
            }

        # Open a GUI terminal and attach to the tmux session so the user
        # gets a visible window (tmux alone is detached/invisible).
        # Prefer iTerm over Terminal.app when available.
        attach_cmd = f"tmux attach -t {session_name}"
        if Path("/Applications/iTerm.app").exists():
            attach_script = (
                'tell application "iTerm"\n'
                "    activate\n"
                "    create window with default profile\n"
                "    tell current session of current window\n"
                f'        write text "{attach_cmd}"\n'
                "    end tell\n"
                "end tell"
            )
        else:
            attach_script = (
                f'tell application "Terminal"\n    activate\n    do script "{attach_cmd}"\nend tell'
            )
        try:
            subprocess.run(
                ["osascript", "-e", attach_script],
                check=True,
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            logger.warning("Failed to auto-attach tmux session: %s", e)

        return {
            "success": True,
            "terminal": TerminalType.TMUX.value,
            "message": f"Started tmux session '{session_name}' at {project_path}",
        }


class TerminalAppAdapter(TerminalAdapter):
    """macOS built-in Terminal.app via AppleScript."""

    async def is_available(self) -> bool:
        # Terminal.app is always available on macOS
        return True

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        exec_script = _write_exec_script(project_path, command, branch_name, image_paths)
        script = (
            'tell application "Terminal"\n'
            "    activate\n"
            f'    do script "bash {exec_script}"\n'
            "end tell"
        )
        return await _run_osascript(script, TerminalType.TERMINAL_APP)


class ITermAdapter(TerminalAdapter):
    """iTerm2 via AppleScript."""

    async def is_available(self) -> bool:
        return Path("/Applications/iTerm.app").exists()

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        exec_script = _write_exec_script(project_path, command, branch_name, image_paths)
        script = (
            'tell application "iTerm"\n'
            "    activate\n"
            "    create window with default profile\n"
            "    tell current session of current window\n"
            f'        write text "bash {exec_script}"\n'
            "    end tell\n"
            "end tell"
        )
        return await _run_osascript(script, TerminalType.ITERM2)


class KittyAdapter(TerminalAdapter):
    """Kitty terminal via CLI."""

    async def is_available(self) -> bool:
        return shutil.which("kitty") is not None

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        full_command = _build_full_command(command, branch_name, image_paths)
        try:
            subprocess.Popen(
                [
                    "kitty",
                    "--single-instance",
                    f"--directory={project_path}",
                    "-e",
                    "bash",
                    "-c",
                    full_command,
                ],
            )
            return {
                "success": True,
                "terminal": TerminalType.KITTY.value,
                "message": f"Opened Kitty at {project_path}",
            }
        except OSError as e:
            logger.error("Failed to launch Kitty: %s", e)
            return {
                "success": False,
                "terminal": TerminalType.KITTY.value,
                "error": f"Failed to launch Kitty: {e}",
            }


class AlacrittyAdapter(TerminalAdapter):
    """Alacritty terminal via CLI."""

    async def is_available(self) -> bool:
        return shutil.which("alacritty") is not None

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        full_command = _build_full_command(command, branch_name, image_paths)
        try:
            subprocess.Popen(
                [
                    "alacritty",
                    "--working-directory",
                    project_path,
                    "-e",
                    "bash",
                    "-c",
                    full_command,
                ],
            )
            return {
                "success": True,
                "terminal": TerminalType.ALACRITTY.value,
                "message": f"Opened Alacritty at {project_path}",
            }
        except OSError as e:
            logger.error("Failed to launch Alacritty: %s", e)
            return {
                "success": False,
                "terminal": TerminalType.ALACRITTY.value,
                "error": f"Failed to launch Alacritty: {e}",
            }


class GhosttyAdapter(TerminalAdapter):
    """Ghostty via AppleScript (System Events keystrokes).

    Ghostty does not yet expose a rich AppleScript API, so we
    activate the app and send keystrokes through System Events.
    """

    async def is_available(self) -> bool:
        return Path("/Applications/Ghostty.app").exists()

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        exec_script = _write_exec_script(project_path, command, branch_name, image_paths)
        script = (
            'tell application "Ghostty"\n'
            "    activate\n"
            "end tell\n"
            "delay 0.5\n"
            'tell application "System Events"\n'
            '    tell process "Ghostty"\n'
            f'        keystroke "bash {exec_script}"\n'
            "        key code 36\n"
            "    end tell\n"
            "end tell"
        )
        return await _run_osascript(script, TerminalType.GHOSTTY)


class WezTermAdapter(TerminalAdapter):
    """WezTerm via its CLI."""

    async def is_available(self) -> bool:
        return shutil.which("wezterm") is not None

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        full_command = _build_full_command(command, branch_name, image_paths)
        try:
            subprocess.Popen(
                [
                    "wezterm",
                    "cli",
                    "spawn",
                    "--cwd",
                    project_path,
                    "--",
                    "bash",
                    "-c",
                    full_command,
                ],
            )
            return {
                "success": True,
                "terminal": TerminalType.WEZTERM.value,
                "message": f"Opened WezTerm at {project_path}",
            }
        except OSError as e:
            logger.error("Failed to launch WezTerm: %s", e)
            return {
                "success": False,
                "terminal": TerminalType.WEZTERM.value,
                "error": f"Failed to launch WezTerm: {e}",
            }


class CmuxAdapter(TerminalAdapter):
    """cmux terminal via its CLI."""

    async def is_available(self) -> bool:
        return shutil.which("cmux") is not None or Path("/Applications/cmux.app").exists()

    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        exec_script = _write_exec_script(project_path, command, branch_name, image_paths)

        # cmux CLI IPC fails with Broken pipe from uvicorn subprocess.
        # Workaround: open via LaunchServices, then type command via
        # AppleScript keystroke (same approach as GhosttyAdapter).
        try:
            open_proc = await asyncio.create_subprocess_exec(
                "/usr/bin/open",
                "-a",
                "cmux",
                project_path,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, open_err = await asyncio.wait_for(open_proc.communicate(), timeout=10)
        except (TimeoutError, OSError) as e:
            logger.error("Failed to launch cmux: %s", e)
            return {
                "success": False,
                "terminal": TerminalType.CMUX.value,
                "error": f"Failed to launch cmux: {e}",
            }

        if open_proc.returncode != 0:
            err = open_err.decode().strip() if open_err else "unknown error"
            logger.error("open -a cmux failed: %s", err)
            return {
                "success": False,
                "terminal": TerminalType.CMUX.value,
                "error": f"Failed to launch cmux: {err}",
            }

        # Type the command into the new workspace via System Events
        script = (
            'tell application "cmux"\n'
            "    activate\n"
            "end tell\n"
            "delay 1.5\n"
            'tell application "System Events"\n'
            '    tell process "cmux"\n'
            f'        keystroke "bash {exec_script}"\n'
            "        key code 36\n"
            "    end tell\n"
            "end tell"
        )
        return await _run_osascript(script, TerminalType.CMUX)
