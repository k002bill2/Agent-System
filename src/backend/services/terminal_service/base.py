"""터미널 어댑터 공유 기반 — 타입·메타데이터·베이스 클래스·명령 조립.

`TERMINAL_INFO` 는 가변 dict 지만 사용처 전수가 **읽기뿐**이라 모듈을 갈라도
안전하다(import 시점에 확장·변이하는 코드가 없다).

`_write_exec_script` 는 adapters 와 orca 양쪽이 쓰는 공유 헬퍼다. orca 쪽
테스트가 `services.terminal_service.orca._write_exec_script` 로 패치하는데,
그것은 orca 모듈이 이 이름을 import 해 자기 전역에 바인딩하기 때문이다 —
여기(base) 경로로 패치하면 orca 의 조회에는 먹지 않는다.
"""

import logging
import os
import shlex
import subprocess
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
    CMUX = "cmux"
    ORCA = "orca"


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
    TerminalType.CMUX: {
        "name": "cmux",
        "description": "AI-native terminal with workspaces",
    },
    TerminalType.ORCA: {
        "name": "Orca",
        "description": "AI-native workspace manager",
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
