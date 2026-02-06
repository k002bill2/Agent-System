"""Warp terminal integration service.

This service integrates with Warp terminal to open projects
and execute commands using Warp's Launch Configuration feature.

Two-phase Claude CLI execution:
1. Launch Claude CLI in interactive mode via Warp
2. After startup (sleep), inject the task text via `expect`
3. Hand control back to user via `interact`

Reference:
- URI Scheme: https://docs.warp.dev/features/uri-scheme
- Launch Configurations: https://docs.warp.dev/terminal/sessions/launch-configurations
"""

import os
import subprocess
import urllib.parse
from datetime import datetime
from pathlib import Path

import yaml

# Docker mode: CLAUDE_HOME is set in Docker environment
IS_DOCKER = bool(os.getenv("CLAUDE_HOME"))

# Pattern that indicates Claude CLI is ready for input
# Claude shows "bypass permissions on" in the status bar when fully loaded
CLAUDE_READY_PATTERN = "bypass permissions"
# Max time to wait for Claude to start (seconds)
CLAUDE_STARTUP_TIMEOUT = 30
# Small delay after pattern match to let TUI fully render
CLAUDE_POST_MATCH_DELAY = 1


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

    def build_claude_command(self, task: str | None = None) -> str:
        """Build a Claude CLI command for Warp launch config.

        Two-phase approach:
        - With task: Uses `expect` to start Claude interactively,
          wait for startup, inject the task, then hand over to user.
        - Without task: Starts Claude in plain interactive mode.

        Args:
            task: Optional task description. If None, opens interactive mode.

        Returns:
            Shell command string to execute in Warp.
        """
        if not task:
            return "claude --dangerously-skip-permissions"

        # Write an expect script that:
        # 1. Spawns Claude CLI in interactive mode
        # 2. Waits for it to start up
        # 3. Sends the task text
        # 4. Hands control back to user (interact)
        script_name = f"aos-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
        script_path = self.launch_config_dir / f"{script_name}.exp"

        # Escape for expect's `send` command:
        # - backslash, double-quote, square brackets (expect special chars)
        escaped_task = (
            task
            .replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("[", "\\[")
            .replace("$", "\\$")
        )

        script_content = (
            f'#!/usr/bin/expect -f\n'
            f'set timeout {CLAUDE_STARTUP_TIMEOUT}\n'
            f'spawn claude --dangerously-skip-permissions\n'
            f'\n'
            f'# Wait for Claude CLI to be fully ready\n'
            f'expect {{\n'
            f'    "*{CLAUDE_READY_PATTERN}*" {{\n'
            f'        sleep {CLAUDE_POST_MATCH_DELAY}\n'
            f'        send "{escaped_task}\\r"\n'
            f'    }}\n'
            f'    timeout {{\n'
            f'        send_user "\\nClaude CLI startup timeout. Please type manually.\\n"\n'
            f'    }}\n'
            f'}}\n'
            f'interact\n'
        )

        # Ensure directory exists and write the script
        self.launch_config_dir.mkdir(parents=True, exist_ok=True)
        script_path.write_text(script_content, encoding="utf-8")
        script_path.chmod(0o755)

        # Return command using ~ (expands on the HOST, not in Docker)
        return f"expect ~/.warp/launch_configurations/{script_name}.exp"

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

        # Clean up both .yaml and .exp files
        for pattern in ("aos-*.yaml", "aos-*.exp"):
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
