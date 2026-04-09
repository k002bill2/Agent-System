"""Terminal abstraction layer for multi-terminal execution.

Provides a unified interface for executing commands across 8 terminal types:
Warp, tmux, Terminal.app, iTerm2, Kitty, Alacritty, Ghostty, WezTerm.

WarpAdapter delegates to existing warp_service.py.
TmuxAdapter delegates to existing tmux_service.py patterns.
Other adapters implement terminal-specific execution via AppleScript or CLI.
"""

from __future__ import annotations

import logging
import os
import shlex
import shutil
import subprocess
import time
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from pathlib import Path

logger = logging.getLogger(__name__)

IS_DOCKER = bool(os.getenv("CLAUDE_HOME"))


class TerminalType(str, Enum):
    """Supported terminal types."""

    WARP = "warp"
    TMUX = "tmux"
    TERMINAL_APP = "terminal_app"
    ITERM2 = "iterm2"
    KITTY = "kitty"
    ALACRITTY = "alacritty"
    GHOSTTY = "ghostty"
    WEZTERM = "wezterm"


TERMINAL_INFO: dict[TerminalType, dict[str, str]] = {
    TerminalType.WARP: {"name": "Warp", "description": "AI-powered terminal"},
    TerminalType.TMUX: {"name": "tmux", "description": "Terminal multiplexer"},
    TerminalType.TERMINAL_APP: {
        "name": "Terminal.app",
        "description": "macOS built-in terminal",
    },
    TerminalType.ITERM2: {
        "name": "iTerm2",
        "description": "macOS terminal emulator",
    },
    TerminalType.KITTY: {"name": "Kitty", "description": "GPU-based terminal"},
    TerminalType.ALACRITTY: {
        "name": "Alacritty",
        "description": "GPU-accelerated terminal",
    },
    TerminalType.GHOSTTY: {
        "name": "Ghostty",
        "description": "Fast, native terminal",
    },
    TerminalType.WEZTERM: {
        "name": "WezTerm",
        "description": "GPU-accelerated terminal by Wez Furlong",
    },
}


class TerminalAdapter(ABC):
    """Abstract base class for terminal adapters."""

    @abstractmethod
    async def is_available(self) -> bool:
        """Check whether this terminal is installed and usable."""

    @abstractmethod
    async def execute(
        self,
        project_path: str,
        command: str,
        title: str | None = None,
        branch_name: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict:
        """Execute a command in this terminal.

        Args:
            project_path: Working directory for the command.
            command: The prompt or command to execute.
            title: Optional window/tab title.
            branch_name: Git branch to create before execution.
            image_paths: Image paths to pass via --image flags.

        Returns:
            dict with ``success``, ``terminal``, and ``message`` or ``error`` keys.
        """


# ---------------------------------------------------------------------------
# Helper: build a claude CLI command string
# ---------------------------------------------------------------------------


def _save_prompt_and_build_cmd(
    command: str,
    image_paths: list[str] | None = None,
) -> str:
    """Save a prompt to a temp file and return a shell command string.

    Mirrors the prompt-file pattern used in ``warp_service.py`` to avoid
    shell-escaping issues with complex prompts.
    """
    prompt_dir = Path.home() / ".aos" / "prompts"
    prompt_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S%f")
    prompt_file = prompt_dir / f"aos-prompt-{timestamp}.txt"
    prompt_file.write_text(command, encoding="utf-8")

    base_cmd = "claude --dangerously-skip-permissions"
    if image_paths:
        image_flags = " ".join(f'--image "{p}"' for p in image_paths)
        base_cmd = f"{base_cmd} {image_flags}"

    return f'{base_cmd} "$(cat {prompt_file})"'


def _build_full_command(
    command: str,
    branch_name: str | None = None,
    image_paths: list[str] | None = None,
) -> str:
    """Build the full shell command including optional git checkout and claude CLI."""
    claude_cmd = _save_prompt_and_build_cmd(command, image_paths)
    if branch_name:
        return f"git checkout -b {shlex.quote(branch_name)} && {claude_cmd}"
    return claude_cmd


def _write_exec_script(
    project_path: str,
    command: str,
    branch_name: str | None = None,
    image_paths: list[str] | None = None,
) -> Path:
    """Write a temp shell script for AppleScript-based terminals.

    Complex commands with nested quotes break AppleScript string escaping.
    Writing to a script file avoids all escaping issues.
    """
    full_command = _build_full_command(command, branch_name, image_paths)
    script_dir = Path.home() / ".aos" / "scripts"
    script_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S%f")
    script_file = script_dir / f"aos-exec-{timestamp}.sh"
    script_file.write_text(
        f"#!/bin/bash\ncd {shlex.quote(project_path)} && {full_command}\n",
        encoding="utf-8",
    )
    script_file.chmod(0o755)
    return script_file


# ---------------------------------------------------------------------------
# Concrete adapters
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Shared helper for AppleScript-based adapters
# ---------------------------------------------------------------------------


async def _run_osascript(script: str, terminal_type: TerminalType) -> dict:
    """Run an AppleScript and return a standardised result dict."""
    try:
        subprocess.run(
            ["osascript", "-e", script],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        name = TERMINAL_INFO[terminal_type]["name"]
        return {
            "success": True,
            "terminal": terminal_type.value,
            "message": f"Opened {name}",
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "terminal": terminal_type.value,
            "error": "AppleScript timed out",
        }
    except subprocess.CalledProcessError as e:
        logger.error("osascript failed for %s: %s", terminal_type.value, e)
        return {
            "success": False,
            "terminal": terminal_type.value,
            "error": f"AppleScript execution failed: {e}",
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class TerminalService:
    """Facade that routes execution to the correct terminal adapter."""

    def __init__(self) -> None:
        self._adapters: dict[TerminalType, TerminalAdapter] = {
            TerminalType.WARP: WarpAdapter(),
            TerminalType.TMUX: TmuxAdapter(),
            TerminalType.TERMINAL_APP: TerminalAppAdapter(),
            TerminalType.ITERM2: ITermAdapter(),
            TerminalType.KITTY: KittyAdapter(),
            TerminalType.ALACRITTY: AlacrittyAdapter(),
            TerminalType.GHOSTTY: GhosttyAdapter(),
            TerminalType.WEZTERM: WezTermAdapter(),
        }

    def get_adapter(self, terminal: TerminalType) -> TerminalAdapter:
        """Return the adapter for the given terminal type."""
        return self._adapters[terminal]

    async def detect_available(self) -> list[dict]:
        """Probe every adapter and return availability info."""
        results: list[dict] = []
        for t, adapter in self._adapters.items():
            info = TERMINAL_INFO[t]
            available = await adapter.is_available()
            results.append(
                {
                    "type": t.value,
                    "name": info["name"],
                    "description": info["description"],
                    "available": available,
                }
            )
        return results


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_terminal_service: TerminalService | None = None


def get_terminal_service() -> TerminalService:
    """Return the TerminalService singleton."""
    global _terminal_service
    if _terminal_service is None:
        _terminal_service = TerminalService()
    return _terminal_service
