"""Warp terminal integration service.

This service integrates with Warp terminal to open projects
and execute commands using Warp's Launch Configuration feature.

Tab reuse:
- If Warp is already running and new_window=False, opens a new **tab**
  in the existing window via AppleScript + wrapper script.
- Otherwise, uses Launch Configuration (which creates a new window).

Reference:
- URI Scheme: https://docs.warp.dev/features/uri-scheme
- Launch Configurations: https://docs.warp.dev/terminal/sessions/launch-configurations
"""

import logging
import os
import subprocess
import urllib.parse
from datetime import datetime
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

# Docker mode: CLAUDE_HOME is set in Docker environment
IS_DOCKER = bool(os.getenv("CLAUDE_HOME"))

# Legacy expect-based constants (no longer used, kept for reference)
# CLAUDE_READY_PATTERN = "bypass permissions"
# CLAUDE_STARTUP_TIMEOUT = 30
# CLAUDE_POST_MATCH_DELAY = 1


class WarpService:
    """Service for Warp terminal integration."""

    def __init__(self):
        """Initialize Warp service.

        In Docker mode, uses /home/aos/.warp/launch_configurations
        which is volume-mounted from the host's ~/.warp/launch_configurations.
        """
        if IS_DOCKER:
            self.launch_config_dir = Path("/home/aos/.warp/launch_configurations")
        else:
            self.launch_config_dir = Path.home() / ".warp" / "launch_configurations"

    def is_warp_running(self) -> bool:
        """Check if Warp terminal is currently running.

        Returns False in Docker mode since we can't check host processes.
        """
        if IS_DOCKER:
            return False

        try:
            # Warp.app의 실제 바이너리 이름은 "stable"이므로 pgrep -x로 찾을 수 없음.
            # pgrep -f로 Warp.app 경로 패턴 매칭 사용.
            result = subprocess.run(
                ["pgrep", "-f", "Warp.app/Contents/MacOS"],
                capture_output=True,
                text=True,
            )
            return result.returncode == 0
        except Exception:
            return False

    def is_warp_installed(self) -> bool:
        """Check if Warp is installed.

        In Docker mode, always returns True since we can't check
        the host filesystem. The frontend will handle the URI opening.
        """
        if IS_DOCKER:
            return True

        # Check for Warp.app in standard macOS location
        warp_app = Path("/Applications/Warp.app")
        return warp_app.exists()

    def build_claude_command(
        self,
        task: str | None = None,
        image_paths: list[str] | None = None,
    ) -> str:
        """Build a Claude CLI command for Warp launch config.

        - With task: Saves prompt to file, passes to Claude CLI as argument.
          Claude CLI accepts a prompt as positional argument and starts
          an interactive session with that prompt already submitted.
        - Without task: Starts Claude in plain interactive mode.
        - With image_paths: Adds --image flags for each image file.

        Args:
            task: Optional task description. If None, opens interactive mode.
            image_paths: Optional list of absolute image file paths to attach.

        Returns:
            Shell command string to execute in Warp.
        """
        # Build --image flags
        image_flags = ""
        if image_paths:
            image_flags = " ".join(f'--image "{p}"' for p in image_paths)

        if not task:
            base = "claude --dangerously-skip-permissions"
            if image_flags:
                return f"{base} {image_flags}"
            return base

        # Write prompt to a temp file to avoid shell escaping issues
        prompt_name = f"aos-prompt-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
        self.launch_config_dir.mkdir(parents=True, exist_ok=True)
        prompt_path = self.launch_config_dir / f"{prompt_name}.txt"
        prompt_path.write_text(task, encoding="utf-8")

        # Use $(cat file) to pass the prompt as a positional argument
        # This starts an interactive Claude session with the prompt pre-submitted
        prompt_file_path = f"~/.warp/launch_configurations/{prompt_name}.txt"
        base_cmd = "claude --dangerously-skip-permissions"
        if image_flags:
            base_cmd += f" {image_flags}"
        return f'{base_cmd} "$(cat {prompt_file_path})"'

    def open_path(self, path: str, new_window: bool = True) -> dict:
        """
        Open a path in Warp using URI scheme.

        Args:
            path: Directory path to open
            new_window: If True, open in new window; otherwise new tab

        Returns:
            dict with success status and message
        """
        if not self.is_warp_installed():
            return {
                "success": False,
                "error": "Warp is not installed",
            }

        # Validate path exists (skip in Docker - host paths not accessible)
        if not IS_DOCKER and not Path(path).exists():
            return {
                "success": False,
                "error": f"Path does not exist: {path}",
            }

        # URL encode the path
        encoded_path = urllib.parse.quote(path, safe="")

        # Build Warp URI
        action = "new_window" if new_window else "new_tab"
        warp_url = f"warp://action/{action}?path={encoded_path}"

        # In Docker mode, return URI for frontend to open
        if IS_DOCKER:
            return {
                "success": True,
                "message": f"Open Warp at {path}",
                "uri": warp_url,
                "open_via_frontend": True,
            }

        try:
            # Use 'open' command on macOS
            subprocess.run(["open", warp_url], check=True)
            return {
                "success": True,
                "message": f"Opened Warp at {path}",
                "uri": warp_url,
                "open_via_frontend": False,
            }
        except subprocess.CalledProcessError as e:
            return {
                "success": False,
                "error": f"Failed to open Warp: {e}",
            }

    def _open_tab_with_command(self, path: str, command: str) -> dict:
        """Open a new tab in the existing Warp window and execute a command.

        Uses Warp URI scheme to open a new tab at the given path,
        then uses AppleScript to type and execute the command in it.

        Args:
            path: Directory path for the tab's working directory
            command: Command to execute in the new tab

        Returns:
            dict with success status and message
        """
        # Create wrapper script to avoid shell escaping issues
        script_name = f"aos-tab-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
        self.launch_config_dir.mkdir(parents=True, exist_ok=True)
        script_path = self.launch_config_dir / f"{script_name}.sh"

        # exec replaces the shell so Claude CLI owns the tab process
        script_content = f'#!/bin/bash\ncd "{path}" || exit 1\nexec {command}\n'
        script_path.write_text(script_content, encoding="utf-8")
        script_path.chmod(0o755)

        script_str = str(script_path)

        try:
            # Step 1: Open new tab via Warp URI scheme (reliable native method)
            encoded_path = urllib.parse.quote(path, safe="")
            warp_tab_url = f"warp://action/new_tab?path={encoded_path}"
            subprocess.run(["open", warp_tab_url], check=True)

            # Step 2: Wait for tab to open, then type command via AppleScript
            applescript = (
                "delay 1.0\n"
                'tell application "System Events"\n'
                '    tell process "Warp"\n'
                f'        keystroke "bash {script_str}"\n'
                "        delay 0.1\n"
                "        key code 36\n"
                "    end tell\n"
                "end tell\n"
            )
            subprocess.run(
                ["osascript", "-e", applescript],
                check=True,
                capture_output=True,
                text=True,
                timeout=10,
            )
            return {
                "success": True,
                "message": f"Opened new Warp tab at {path}",
                "opened_as": "tab",
                "script_path": script_str,
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "AppleScript timed out while opening Warp tab",
            }
        except subprocess.CalledProcessError as e:
            logger.warning("Warp tab open failed: %s", e)
            return {
                "success": False,
                "error": f"Failed to open Warp tab: {e}",
            }

    def open_with_command(
        self,
        path: str,
        command: str,
        title: str | None = None,
        new_window: bool = True,
    ) -> dict:
        """
        Open a path in Warp and execute a command using Launch Configuration.

        Args:
            path: Directory path to open
            command: Command to execute
            title: Optional tab title
            new_window: If True, open in new window; otherwise new tab

        Returns:
            dict with success status and message
        """
        if not self.is_warp_installed():
            return {
                "success": False,
                "error": "Warp is not installed",
            }

        # Validate path exists (skip in Docker - host paths not accessible)
        if not IS_DOCKER and not Path(path).exists():
            return {
                "success": False,
                "error": f"Path does not exist: {path}",
            }

        # Always use Launch Configuration for reliability.
        # The previous AppleScript-based tab approach (_open_tab_with_command)
        # was unreliable due to keystroke timing issues and accessibility permissions.
        # Launch configs natively embed the command in YAML, which Warp executes directly.

        # Create launch configuration
        config_name = f"aos-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        tab_title = title or "AOS Task"

        config = {
            "name": config_name,
            "windows": [
                {
                    "tabs": [
                        {
                            "title": tab_title,
                            "layout": {
                                "cwd": path,
                                "commands": [
                                    {"exec": command},
                                ],
                            },
                        }
                    ]
                }
            ],
        }

        # Ensure config directory exists
        self.launch_config_dir.mkdir(parents=True, exist_ok=True)

        # Write config file with proper unicode support
        config_path = self.launch_config_dir / f"{config_name}.yaml"
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                f.write("---\n")
                yaml.dump(config, f, default_flow_style=False, allow_unicode=True)
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to create launch config: {e}",
            }

        # Open Warp with the launch configuration
        warp_url = f"warp://launch/{config_name}"

        # In Docker mode, skip subprocess and return URI for frontend
        if IS_DOCKER:
            return {
                "success": True,
                "message": f"Launch config created for: {command}",
                "uri": warp_url,
                "config_name": config_name,
                "config_path": str(config_path),
                "open_via_frontend": True,
            }

        try:
            subprocess.run(["open", warp_url], check=True)
            return {
                "success": True,
                "message": f"Opened Warp at {path} with command: {command}",
                "uri": warp_url,
                "config_name": config_name,
                "config_path": str(config_path),
                "open_via_frontend": False,
                "opened_as": "window",
            }
        except subprocess.CalledProcessError as e:
            return {
                "success": False,
                "error": f"Failed to open Warp: {e}",
            }

    def cleanup_old_configs(self, max_age_hours: int = 24) -> int:
        """
        Clean up old AOS launch configurations and expect scripts.

        Args:
            max_age_hours: Remove configs older than this many hours

        Returns:
            Number of files removed
        """
        if not self.launch_config_dir.exists():
            return 0

        removed = 0
        cutoff = datetime.now().timestamp() - (max_age_hours * 3600)

        # Clean up .yaml, .exp, .sh, and .txt files
        for pattern in ("aos-*.yaml", "aos-*.exp", "aos-tab-*.sh", "aos-prompt-*.txt"):
            for config_file in self.launch_config_dir.glob(pattern):
                try:
                    if config_file.stat().st_mtime < cutoff:
                        config_file.unlink()
                        removed += 1
                except Exception:
                    pass  # Ignore cleanup errors

        return removed


# Singleton instance
_warp_service: WarpService | None = None


def get_warp_service() -> WarpService:
    """Get the Warp service singleton."""
    global _warp_service
    if _warp_service is None:
        _warp_service = WarpService()
    return _warp_service
