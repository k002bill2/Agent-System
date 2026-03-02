"""MCP server configuration management for Claude Code projects.

Handles CRUD operations for MCP server configurations
within .claude/mcp.json and ~/.claude.json files.
"""

import json
import logging
from pathlib import Path

from models.project_config import MCPServerConfig, MCPServerSource, MCPServerType
from services.project_discovery import ProjectDiscovery

logger = logging.getLogger(__name__)


class MCPConfigManager:
    """Manages MCP server configurations."""

    def __init__(self, discovery: ProjectDiscovery):
        """Initialize with a ProjectDiscovery instance.

        Args:
            discovery: ProjectDiscovery for path resolution
        """
        self._discovery = discovery

    def _parse_server_entry(
        self,
        server_id: str,
        config: dict,
        project_id: str,
        source: MCPServerSource = MCPServerSource.PROJECT,
    ) -> MCPServerConfig | None:
        """Parse a single MCP server config entry.

        Args:
            server_id: Server identifier
            config: Server configuration dict
            project_id: Project identifier
            source: Whether this is a project or user config

        Returns:
            MCPServerConfig or None if invalid
        """
        if not isinstance(config, dict):
            return None

        command = config.get("command", "")
        args = config.get("args", [])
        env = config.get("env", {})
        disabled = config.get("disabled", False)
        note = config.get("_note", "")

        # Determine server type
        if command == "npx":
            server_type = MCPServerType.NPX
            package_name = ""
            for arg in args:
                if not arg.startswith("-"):
                    package_name = arg
                    break
        elif command == "uvx":
            server_type = MCPServerType.UVX
            package_name = ""
            for arg in args:
                if not arg.startswith("-") and arg != "--from":
                    package_name = arg
                    break
        else:
            server_type = MCPServerType.COMMAND
            package_name = command

        return MCPServerConfig(
            server_id=server_id,
            project_id=project_id,
            command=command,
            args=args if isinstance(args, list) else [],
            env=env if isinstance(env, dict) else {},
            disabled=disabled,
            note=note,
            server_type=server_type,
            package_name=package_name,
            source=source,
        )

    def get_project_mcp_config(self, project_id: str) -> list[MCPServerConfig]:
        """Get MCP server configuration for a project.

        Args:
            project_id: Project identifier

        Returns:
            List of MCPServerConfig
        """
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            return []

        mcp_file = project_path / ".claude" / "mcp.json"
        if not mcp_file.exists():
            return []

        try:
            with open(mcp_file, encoding="utf-8") as f:
                mcp_data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Error reading MCP config {mcp_file}: {e}")
            return []

        servers = []
        mcp_servers = mcp_data.get("mcpServers", {})

        for server_id, config in mcp_servers.items():
            server = self._parse_server_entry(
                server_id, config, project_id, MCPServerSource.PROJECT
            )
            if server:
                servers.append(server)

        # Sort: enabled first, then alphabetically
        servers.sort(key=lambda s: (s.disabled, s.server_id.lower()))
        return servers

    def get_user_mcp_config(self, project_id: str = "") -> list[MCPServerConfig]:
        """Get user-level MCP server configuration from ~/.claude.json.

        Args:
            project_id: Optional project ID for context (used in returned configs)

        Returns:
            List of MCPServerConfig from user-level settings
        """
        user_claude_file = Path.home() / ".claude.json"
        if not user_claude_file.exists():
            return []

        try:
            with open(user_claude_file, encoding="utf-8") as f:
                user_data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Error reading user Claude config: {e}")
            return []

        servers = []
        mcp_servers = user_data.get("mcpServers", {})

        for server_id, config in mcp_servers.items():
            server = self._parse_server_entry(server_id, config, project_id, MCPServerSource.USER)
            if server:
                servers.append(server)

        # Sort: enabled first, then alphabetically
        servers.sort(key=lambda s: (s.disabled, s.server_id.lower()))
        return servers

    def enable_mcp_server(self, project_id: str, server_id: str) -> bool:
        """Enable an MCP server.

        Args:
            project_id: Project identifier
            server_id: Server identifier

        Returns:
            True if enabled successfully
        """
        return self._toggle_mcp_server(project_id, server_id, disabled=False)

    def disable_mcp_server(self, project_id: str, server_id: str) -> bool:
        """Disable an MCP server.

        Args:
            project_id: Project identifier
            server_id: Server identifier

        Returns:
            True if disabled successfully
        """
        return self._toggle_mcp_server(project_id, server_id, disabled=True)

    def _toggle_mcp_server(self, project_id: str, server_id: str, disabled: bool) -> bool:
        """Toggle MCP server disabled state.

        Args:
            project_id: Project identifier
            server_id: Server identifier
            disabled: New disabled state

        Returns:
            True if toggled successfully
        """
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        mcp_file = project_path / ".claude" / "mcp.json"
        if not mcp_file.exists():
            logger.error(f"MCP config not found: {mcp_file}")
            return False

        try:
            with open(mcp_file, encoding="utf-8") as f:
                mcp_data = json.load(f)

            mcp_servers = mcp_data.get("mcpServers", {})
            if server_id not in mcp_servers:
                logger.error(f"Server not found: {server_id}")
                return False

            mcp_servers[server_id]["disabled"] = disabled

            with open(mcp_file, "w", encoding="utf-8") as f:
                json.dump(mcp_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            logger.info(
                f"{'Disabled' if disabled else 'Enabled'} MCP server {server_id} "
                f"in project {project_id}"
            )
            return True

        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Error updating MCP config: {e}")
            return False

    def update_mcp_server(
        self,
        project_id: str,
        server_id: str,
        command: str | None = None,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
        disabled: bool | None = None,
        note: str | None = None,
    ) -> MCPServerConfig | None:
        """Update an MCP server configuration.

        Args:
            project_id: Project identifier
            server_id: Server identifier
            command: New command (optional)
            args: New args (optional)
            env: New environment variables (optional)
            disabled: New disabled state (optional)
            note: New note (optional)

        Returns:
            Updated MCPServerConfig or None if failed
        """
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return None

        mcp_file = project_path / ".claude" / "mcp.json"
        if not mcp_file.exists():
            logger.error(f"MCP config not found: {mcp_file}")
            return None

        try:
            with open(mcp_file, encoding="utf-8") as f:
                mcp_data = json.load(f)

            mcp_servers = mcp_data.get("mcpServers", {})
            if server_id not in mcp_servers:
                logger.error(f"Server not found: {server_id}")
                return None

            server = mcp_servers[server_id]

            # Update only provided fields
            if command is not None:
                server["command"] = command
            if args is not None:
                server["args"] = args
            if env is not None:
                server["env"] = env
            if disabled is not None:
                server["disabled"] = disabled
            if note is not None:
                server["_note"] = note

            with open(mcp_file, "w", encoding="utf-8") as f:
                json.dump(mcp_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            logger.info(f"Updated MCP server {server_id} in project {project_id}")

            # Return updated config
            servers = self.get_project_mcp_config(project_id)
            return next((s for s in servers if s.server_id == server_id), None)

        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Error updating MCP config: {e}")
            return None

    def create_mcp_server(
        self,
        project_id: str,
        server_id: str,
        command: str = "npx",
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
        disabled: bool = False,
        note: str = "",
    ) -> MCPServerConfig | None:
        """Create a new MCP server configuration.

        Args:
            project_id: Project identifier
            server_id: Server identifier
            command: Command to run
            args: Command arguments
            env: Environment variables
            disabled: Whether server is disabled
            note: Note about the server

        Returns:
            Created MCPServerConfig or None if failed
        """
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return None

        mcp_file = project_path / ".claude" / "mcp.json"

        # Create file if doesn't exist
        if not mcp_file.exists():
            mcp_data = {"mcpServers": {}}
        else:
            try:
                with open(mcp_file, encoding="utf-8") as f:
                    mcp_data = json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                logger.error(f"Error reading MCP config: {e}")
                return None

        mcp_servers = mcp_data.setdefault("mcpServers", {})

        # Check if server already exists
        if server_id in mcp_servers:
            logger.error(f"Server already exists: {server_id}")
            return None

        # Create server entry
        server_entry: dict = {
            "command": command,
            "args": args or [],
        }
        if env:
            server_entry["env"] = env
        if disabled:
            server_entry["disabled"] = True
        if note:
            server_entry["_note"] = note

        mcp_servers[server_id] = server_entry

        try:
            with open(mcp_file, "w", encoding="utf-8") as f:
                json.dump(mcp_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            logger.info(f"Created MCP server {server_id} in project {project_id}")

            # Return created config
            servers = self.get_project_mcp_config(project_id)
            return next((s for s in servers if s.server_id == server_id), None)

        except OSError as e:
            logger.error(f"Error writing MCP config: {e}")
            return None

    def delete_mcp_server(self, project_id: str, server_id: str) -> bool:
        """Delete an MCP server configuration.

        Args:
            project_id: Project identifier
            server_id: Server identifier

        Returns:
            True if deleted successfully
        """
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        mcp_file = project_path / ".claude" / "mcp.json"
        if not mcp_file.exists():
            logger.error(f"MCP config not found: {mcp_file}")
            return False

        try:
            with open(mcp_file, encoding="utf-8") as f:
                mcp_data = json.load(f)

            mcp_servers = mcp_data.get("mcpServers", {})
            if server_id not in mcp_servers:
                logger.error(f"Server not found: {server_id}")
                return False

            del mcp_servers[server_id]

            with open(mcp_file, "w", encoding="utf-8") as f:
                json.dump(mcp_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            logger.info(f"Deleted MCP server {server_id} from project {project_id}")
            return True

        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Error deleting MCP server: {e}")
            return False

    def copy_mcp_server(
        self, source_project_id: str, server_id: str, target_project_id: str
    ) -> bool:
        """Copy an MCP server to another project.

        Args:
            source_project_id: Source project identifier
            server_id: MCP server identifier to copy
            target_project_id: Target project identifier

        Returns:
            True if copied successfully
        """
        source_path = self._discovery.find_project_path(source_project_id)
        target_path = self._discovery.find_project_path(target_project_id)

        if not source_path or not target_path:
            logger.error("Source or target project not found")
            return False

        source_mcp_file = source_path / ".claude" / "mcp.json"
        if not source_mcp_file.exists():
            logger.error("Source MCP config not found")
            return False

        try:
            with open(source_mcp_file, encoding="utf-8") as f:
                source_data = json.load(f)

            source_servers = source_data.get("mcpServers", {})
            if server_id not in source_servers:
                logger.error(f"Source MCP server not found: {server_id}")
                return False

            server_config = source_servers[server_id]

            # Read or create target mcp.json
            target_mcp_file = target_path / ".claude" / "mcp.json"
            target_mcp_file.parent.mkdir(parents=True, exist_ok=True)

            if target_mcp_file.exists():
                with open(target_mcp_file, encoding="utf-8") as f:
                    target_data = json.load(f)
            else:
                target_data = {"mcpServers": {}}

            target_servers = target_data.setdefault("mcpServers", {})

            # Handle name collision
            final_server_id = server_id
            if server_id in target_servers:
                suffix = 1
                while f"{server_id}-{suffix}" in target_servers:
                    suffix += 1
                final_server_id = f"{server_id}-{suffix}"

            target_servers[final_server_id] = server_config

            with open(target_mcp_file, "w", encoding="utf-8") as f:
                json.dump(target_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            logger.info(
                f"Copied MCP server {server_id} from {source_project_id} to {target_project_id}"
            )
            return True

        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Error copying MCP server: {e}")
            return False
