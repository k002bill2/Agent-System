"""Warp terminal integration service.

This service integrates with Warp terminal to open projects
and execute commands using Warp's Launch Configuration feature.

Reference:
- URI Scheme: https://docs.warp.dev/features/uri-scheme
- Launch Configurations: https://docs.warp.dev/terminal/sessions/launch-configurations
"""

from pathlib import Path
import subprocess
import tempfile
import yaml
import urllib.parse
from datetime import datetime


class WarpService:
    """Service for Warp terminal integration."""

    def __init__(self):
        """Initialize Warp service."""
        self.launch_config_dir = Path.home() / ".warp" / "launch_configurations"

    def is_warp_installed(self) -> bool:
        """Check if Warp is installed."""
        # Check for Warp.app in standard macOS location
        warp_app = Path("/Applications/Warp.app")
        return warp_app.exists()

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

        # Validate path exists
        if not Path(path).exists():
            return {
                "success": False,
                "error": f"Path does not exist: {path}",
            }

        # URL encode the path
        encoded_path = urllib.parse.quote(path, safe="")

        # Build Warp URI
        action = "new_window" if new_window else "new_tab"
        warp_url = f"warp://action/{action}?path={encoded_path}"

        try:
            # Use 'open' command on macOS
            subprocess.run(["open", warp_url], check=True)
            return {
                "success": True,
                "message": f"Opened Warp at {path}",
                "uri": warp_url,
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

        # Validate path exists
        if not Path(path).exists():
            return {
                "success": False,
                "error": f"Path does not exist: {path}",
            }

        # Create launch configuration
        config_name = f"ags-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        tab_title = title or "AGS Task"

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

        # Write config file
        config_path = self.launch_config_dir / f"{config_name}.yaml"
        try:
            with open(config_path, "w") as f:
                # Use YAML with explicit document markers
                f.write("---\n")
                yaml.dump(config, f, default_flow_style=False)
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to create launch config: {e}",
            }

        # Open Warp with the launch configuration
        warp_url = f"warp://launch/{config_name}"

        try:
            subprocess.run(["open", warp_url], check=True)
            return {
                "success": True,
                "message": f"Opened Warp at {path} with command: {command}",
                "uri": warp_url,
                "config_name": config_name,
                "config_path": str(config_path),
            }
        except subprocess.CalledProcessError as e:
            return {
                "success": False,
                "error": f"Failed to open Warp: {e}",
            }

    def cleanup_old_configs(self, max_age_hours: int = 24) -> int:
        """
        Clean up old AGS launch configurations.

        Args:
            max_age_hours: Remove configs older than this many hours

        Returns:
            Number of configs removed
        """
        if not self.launch_config_dir.exists():
            return 0

        removed = 0
        cutoff = datetime.now().timestamp() - (max_age_hours * 3600)

        for config_file in self.launch_config_dir.glob("ags-*.yaml"):
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
