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

        - With task: Saves prompt to file, passes to Claude CLI as argument.
          Claude CLI accepts a prompt as positional argument and starts
          an interactive session with that prompt already submitted.
        - Without task: Starts Claude in plain interactive mode.

        Args:
            task: Optional task description. If None, opens interactive mode.

        Returns:
            Shell command string to execute in Warp.
        """
        if not task:
            return "claude --dangerously-skip-permissions"

        # Write prompt to a temp file to avoid shell escaping issues
        prompt_name = f"aos-prompt-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
        self.launch_config_dir.mkdir(parents=True, exist_ok=True)
        prompt_path = self.launch_config_dir / f"{prompt_name}.txt"
        prompt_path.write_text(task, encoding="utf-8")

        # Use $(cat file) to pass the prompt as a positional argument
        # This starts an interactive Claude session with the prompt pre-submitted
        prompt_file_path = f"~/.warp/launch_configurations/{prompt_name}.txt"
        return f'claude --dangerously-skip-permissions "$(cat {prompt_file_path})"'

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
