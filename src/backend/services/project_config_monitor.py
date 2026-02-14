"""Project configuration monitor service.

Discovers and monitors Claude Code project configurations (skills, agents, MCP)
from filesystem. Supports real-time change detection via file watching.
"""

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from datetime import datetime
from pathlib import Path

from models.project_config import (
    AgentConfig,
    CommandConfig,
    ConfigChangeEvent,
    ConfigChangeType,
    HookConfig,
    MCPServerConfig,
    MCPServerSource,
    MCPServerType,
    ProjectConfigSummary,
    ProjectInfo,
    SkillConfig,
)
from services.frontmatter_parser import FrontmatterParser

logger = logging.getLogger(__name__)


class ProjectConfigMonitor:
    """Monitor for Claude Code project configurations."""

    def __init__(
        self,
        project_paths: list[str] | None = None,
        include_current: bool = True,
    ):
        """Initialize the monitor.

        Args:
            project_paths: List of project root paths to monitor
            include_current: Whether to include current working directory
        """
        self._project_paths: list[Path] = []
        self._external_paths: list[str] = []
        self._cache: dict[str, ProjectConfigSummary] = {}
        self._file_mtimes: dict[str, float] = {}
        self._is_docker = bool(os.getenv("CLAUDE_HOME"))

        # Add current directory (even without .claude/)
        # Skip if cwd is src/backend (the backend runtime directory)
        if include_current:
            cwd = Path.cwd().resolve()
            if cwd.exists() and cwd.name != "backend":
                self._project_paths.append(cwd)

        # Add provided paths (even without .claude/)
        if project_paths:
            for p in project_paths:
                path = Path(p) if self._is_docker else Path(p).resolve()
                if self._is_docker or (path.exists() and path.is_dir()):
                    if path not in self._project_paths:
                        self._project_paths.append(path)

        # Add paths from environment variable
        env_paths = os.getenv("CLAUDE_PROJECT_PATHS", "")
        if env_paths:
            for p in env_paths.split(","):
                p = p.strip()
                if p:
                    path = Path(p) if self._is_docker else Path(p).resolve()
                    if self._is_docker or (path.exists() and path.is_dir()):
                        if path not in self._project_paths:
                            self._project_paths.append(path)
                            logger.info(f"Added project path from env: {path}")

    def add_external_project(self, path: str) -> bool:
        """Add an external project path at runtime.

        Args:
            path: Path to project root (does not require .claude/ directory)

        Returns:
            True if added, False if invalid or already exists
        """
        p = Path(path) if self._is_docker else Path(path).resolve()

        # In Docker, host paths aren't accessible - skip validation
        if not self._is_docker:
            if not p.exists():
                logger.warning(f"Path does not exist: {path}")
                return False
            if not p.is_dir():
                logger.warning(f"Path is not a directory: {path}")
                return False
        if p in self._project_paths:
            logger.info(f"Path already monitored: {path}")
            return False

        if not (p / ".claude").exists():
            logger.info(f"Path has no .claude directory (will show empty config): {path}")

        self._project_paths.append(p)
        self._external_paths.append(str(p))  # Store resolved path
        logger.info(f"Added external project: {p}")
        return True

    def remove_external_project(self, path: str) -> bool:
        """Remove an external project path.

        Args:
            path: Path to remove

        Returns:
            True if removed, False if not found
        """
        p = Path(path).resolve()  # Resolve symlinks for consistency
        if p not in self._project_paths:
            return False

        self._project_paths.remove(p)
        resolved_path = str(p)
        if resolved_path in self._external_paths:
            self._external_paths.remove(resolved_path)

        # Clear cache for this project
        project_id = self._encode_path(p)
        self._cache.pop(project_id, None)

        logger.info(f"Removed external project: {p}")
        return True

    def remove_project(self, path: str) -> bool:
        """Remove any project from monitoring (auto-discovered or external).

        Args:
            path: Path to remove

        Returns:
            True if removed, False if not found
        """
        # Try both original path and resolved path
        p = Path(path)
        resolved_p = p.resolve() if p.exists() else p

        # Check both forms
        target = None
        for pp in self._project_paths:
            if pp == p or pp == resolved_p or str(pp) == path:
                target = pp
                break

        if target is None:
            logger.warning(f"Project not found in monitored paths: {path}")
            return False

        self._project_paths.remove(target)
        resolved_path = str(target)
        if resolved_path in self._external_paths:
            self._external_paths.remove(resolved_path)

        # Clear cache for this project
        project_id = self._encode_path(target)
        self._cache.pop(project_id, None)

        logger.info(f"Removed project from monitoring: {target}")
        return True

    def get_external_paths(self) -> list[str]:
        """Get list of runtime-added external paths."""
        return self._external_paths.copy()

    def get_monitored_paths(self) -> list[str]:
        """Get all monitored project paths."""
        return [str(p) for p in self._project_paths]

    def _encode_path(self, path: Path) -> str:
        """Encode path to project ID.

        Converts /Users/user/Work/Project to -Users-user-Work-Project
        """
        return str(path).replace("/", "-").replace("\\", "-")

    def _decode_path(self, project_id: str) -> str:
        """Decode project ID back to path (lossy for Windows paths)."""
        # Best effort - may not be exact on Windows
        if project_id.startswith("-"):
            return "/" + project_id[1:].replace("-", "/")
        return project_id.replace("-", "/")

    def _refresh_project_paths(self) -> None:
        """Re-scan known directories for newly added projects.

        Checks parent projects/ directory and CLAUDE_PROJECT_PATHS
        for any new project directories not yet in _project_paths.
        """
        # Re-scan projects/ directory (symlinked projects)
        try:
            # Find the Agent-System root from any known path
            for existing_path in list(self._project_paths):
                projects_dir = existing_path.parent / "projects"
                if projects_dir.exists() and projects_dir.is_dir():
                    for entry in projects_dir.iterdir():
                        if entry.is_dir():
                            resolved = entry.resolve() if not self._is_docker else entry
                            if resolved not in self._project_paths:
                                if self._is_docker or resolved.exists():
                                    self._project_paths.append(resolved)
                                    logger.info(f"Auto-discovered new project: {resolved}")
                    break  # Only need to scan projects/ once
        except Exception as e:
            logger.debug(f"Error refreshing project paths: {e}")

        # Re-scan CLAUDE_PROJECT_PATHS env var
        env_paths = os.getenv("CLAUDE_PROJECT_PATHS", "")
        if env_paths:
            for p in env_paths.split(","):
                p = p.strip()
                if p:
                    path = Path(p) if self._is_docker else Path(p).resolve()
                    if path not in self._project_paths:
                        if self._is_docker or (path.exists() and path.is_dir()):
                            self._project_paths.append(path)
                            logger.info(f"Added project path from env: {path}")

    def discover_projects(self) -> list[ProjectInfo]:
        """Discover all projects with Claude Code configuration.

        Automatically refreshes project paths to detect newly added projects.

        Returns:
            List of ProjectInfo for each discovered project
        """
        # Refresh paths to pick up new projects
        self._refresh_project_paths()

        projects = []

        for project_path in self._project_paths:
            try:
                project_info = self._scan_project(project_path)
                if project_info:
                    projects.append(project_info)
            except Exception as e:
                logger.error(f"Error scanning project {project_path}: {e}")
                continue

        # Sort by project name
        projects.sort(key=lambda p: p.project_name.lower())
        return projects

    def _scan_project(self, project_path: Path) -> ProjectInfo | None:
        """Scan a single project for Claude configuration.

        Args:
            project_path: Path to project root

        Returns:
            ProjectInfo (returns basic info even without .claude/)
        """
        # In Docker, host paths aren't accessible - skip exists check
        if not self._is_docker and not project_path.exists():
            return None

        claude_dir = project_path / ".claude"
        has_claude_dir = claude_dir.exists()

        project_id = self._encode_path(project_path)
        project_name = project_path.name

        # If no .claude directory (or in Docker with inaccessible host paths),
        # return basic project info with zero counts
        if not has_claude_dir:
            return ProjectInfo(
                project_id=project_id,
                project_name=project_name,
                project_path=str(project_path),
                claude_dir=str(claude_dir),
                has_skills=False,
                has_agents=False,
                has_mcp=False,
                has_hooks=False,
                skill_count=0,
                agent_count=0,
                mcp_server_count=0,
                hook_count=0,
                last_modified=datetime.utcnow(),
            )

        # Count resources
        skills_dir = claude_dir / "skills"
        agents_dir = claude_dir / "agents"
        commands_dir = claude_dir / "commands"
        mcp_file = claude_dir / "mcp.json"
        hooks_file = claude_dir / "hooks.json"

        skill_count = 0
        if skills_dir.exists():
            skill_count = sum(
                1 for d in skills_dir.iterdir() if d.is_dir() and (d / "SKILL.md").exists()
            )

        agent_count = 0
        if agents_dir.exists():
            agent_count = sum(
                1 for f in agents_dir.glob("*.md") if f.is_file() and not f.name.startswith(".")
            )
            # Exclude shared/ directory files from agent count
            shared_dir = agents_dir / "shared"
            if shared_dir.exists():
                agent_count -= sum(1 for f in shared_dir.glob("*.md") if f.is_file())

        mcp_server_count = 0
        if mcp_file.exists():
            try:
                with open(mcp_file, encoding="utf-8") as f:
                    mcp_data = json.load(f)
                    mcp_server_count = len(mcp_data.get("mcpServers", {}))
            except (json.JSONDecodeError, OSError):
                pass

        command_count = 0
        if commands_dir.exists():
            command_count = sum(1 for f in commands_dir.glob("*.md") if f.is_file())

        # Count hooks
        hook_count = 0
        if hooks_file.exists():
            try:
                with open(hooks_file, encoding="utf-8") as f:
                    hooks_data = json.load(f)
                    # Handle both formats: { "hooks": { ... } } or direct { "event": [...] }
                    if "hooks" in hooks_data and isinstance(hooks_data["hooks"], dict):
                        hooks_data = hooks_data["hooks"]
                    # Count all hook entries across all events
                    for event_hooks in hooks_data.values():
                        if isinstance(event_hooks, list):
                            for entry in event_hooks:
                                if isinstance(entry, dict) and "hooks" in entry:
                                    hook_count += len(entry["hooks"])
            except (json.JSONDecodeError, OSError):
                pass

        # Get last modified time from most recently modified config file
        last_modified = datetime.utcnow()
        for check_path in [skills_dir, agents_dir, commands_dir, mcp_file, hooks_file]:
            if check_path.exists():
                try:
                    mtime = datetime.fromtimestamp(check_path.stat().st_mtime)
                    if mtime > last_modified:
                        last_modified = mtime
                except OSError:
                    pass

        return ProjectInfo(
            project_id=project_id,
            project_name=project_name,
            project_path=str(project_path),
            claude_dir=str(claude_dir),
            has_skills=skill_count > 0,
            has_agents=agent_count > 0,
            has_mcp=mcp_file.exists(),
            has_hooks=hooks_file.exists() or (claude_dir / "hooks").exists(),
            has_commands=command_count > 0,
            skill_count=skill_count,
            agent_count=agent_count,
            mcp_server_count=mcp_server_count,
            hook_count=hook_count,
            command_count=command_count,
            last_modified=last_modified,
        )

    def get_all_skills(self) -> list[SkillConfig]:
        """Get all skills from all monitored projects.

        Returns:
            List of SkillConfig across all projects
        """
        all_skills = []
        for project_path in self._project_paths:
            skills = self.get_project_skills(self._encode_path(project_path))
            all_skills.extend(skills)
        return all_skills

    def get_project_skills(self, project_id: str) -> list[SkillConfig]:
        """Get all skills for a specific project.

        Args:
            project_id: Project identifier

        Returns:
            List of SkillConfig for the project
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            return []

        skills_dir = project_path / ".claude" / "skills"
        if not skills_dir.exists():
            return []

        skills = []
        for skill_dir in skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue

            skill_file = skill_dir / "SKILL.md"
            if not skill_file.exists():
                continue

            try:
                skill = self._parse_skill(skill_file, project_id)
                if skill:
                    skills.append(skill)
            except Exception as e:
                logger.error(f"Error parsing skill {skill_file}: {e}")
                continue

        # Sort by name
        skills.sort(key=lambda s: s.name.lower())
        return skills

    def _parse_skill(self, skill_file: Path, project_id: str) -> SkillConfig | None:
        """Parse a SKILL.md file.

        Args:
            skill_file: Path to SKILL.md
            project_id: Parent project ID

        Returns:
            SkillConfig or None if parsing fails
        """
        frontmatter, body = FrontmatterParser.parse_file(str(skill_file))
        if not frontmatter:
            # Skill without frontmatter - use directory name as name
            frontmatter = {"name": skill_file.parent.name}

        skill_id = skill_file.parent.name
        skill_dir = skill_file.parent

        # Check for additional directories
        has_references = (skill_dir / "references").exists()
        has_scripts = (skill_dir / "scripts").exists()
        has_assets = (skill_dir / "assets").exists()

        # Get file timestamps
        stat = skill_file.stat()

        return SkillConfig(
            skill_id=skill_id,
            project_id=project_id,
            name=FrontmatterParser.get_string_field(frontmatter, "name", skill_id),
            description=FrontmatterParser.get_string_field(frontmatter, "description"),
            file_path=str(skill_file),
            tools=FrontmatterParser.extract_tools(frontmatter),
            model=frontmatter.get("model"),
            version=frontmatter.get("version"),
            author=frontmatter.get("author"),
            has_references=has_references,
            has_scripts=has_scripts,
            has_assets=has_assets,
            created_at=datetime.fromtimestamp(stat.st_ctime),
            modified_at=datetime.fromtimestamp(stat.st_mtime),
        )

    def get_skill_content(
        self, project_id: str, skill_id: str
    ) -> tuple[SkillConfig | None, str, list[str]]:
        """Get full content of a skill.

        Args:
            project_id: Project identifier
            skill_id: Skill identifier

        Returns:
            Tuple of (SkillConfig, content, reference_paths) or (None, "", [])
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            return None, "", []

        skill_file = project_path / ".claude" / "skills" / skill_id / "SKILL.md"
        if not skill_file.exists():
            return None, "", []

        skill = self._parse_skill(skill_file, project_id)
        if not skill:
            return None, "", []

        content = skill_file.read_text(encoding="utf-8")

        # Get reference file paths
        references = []
        refs_dir = skill_file.parent / "references"
        if refs_dir.exists():
            for ref_file in refs_dir.glob("*.md"):
                references.append(str(ref_file))

        return skill, content, references

    def get_all_agents(self) -> list[AgentConfig]:
        """Get all agents from all monitored projects.

        Returns:
            List of AgentConfig across all projects
        """
        all_agents = []
        for project_path in self._project_paths:
            agents = self.get_project_agents(self._encode_path(project_path))
            all_agents.extend(agents)
        return all_agents

    def get_project_agents(self, project_id: str) -> list[AgentConfig]:
        """Get all agents for a specific project.

        Args:
            project_id: Project identifier

        Returns:
            List of AgentConfig for the project
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            return []

        agents_dir = project_path / ".claude" / "agents"
        if not agents_dir.exists():
            return []

        agents = []

        # Parse regular agents (direct .md files)
        for agent_file in agents_dir.glob("*.md"):
            if not agent_file.is_file():
                continue
            try:
                agent = self._parse_agent(agent_file, project_id, is_shared=False)
                if agent:
                    agents.append(agent)
            except Exception as e:
                logger.error(f"Error parsing agent {agent_file}: {e}")
                continue

        # Parse shared agents
        shared_dir = agents_dir / "shared"
        if shared_dir.exists():
            for agent_file in shared_dir.glob("*.md"):
                if not agent_file.is_file():
                    continue
                try:
                    agent = self._parse_agent(agent_file, project_id, is_shared=True)
                    if agent:
                        agents.append(agent)
                except Exception as e:
                    logger.error(f"Error parsing shared agent {agent_file}: {e}")
                    continue

        # Sort: regular agents first, then shared
        agents.sort(key=lambda a: (a.is_shared, a.name.lower()))
        return agents

    def _parse_agent(
        self, agent_file: Path, project_id: str, is_shared: bool = False
    ) -> AgentConfig | None:
        """Parse an agent .md file.

        Args:
            agent_file: Path to agent .md file
            project_id: Parent project ID
            is_shared: Whether agent is in shared/ directory

        Returns:
            AgentConfig or None if parsing fails
        """
        frontmatter, body = FrontmatterParser.parse_file(str(agent_file))
        if not frontmatter:
            frontmatter = {"name": agent_file.stem}

        agent_id = agent_file.stem
        stat = agent_file.stat()

        return AgentConfig(
            agent_id=agent_id,
            project_id=project_id,
            name=FrontmatterParser.get_string_field(frontmatter, "name", agent_id),
            description=FrontmatterParser.get_string_field(frontmatter, "description"),
            file_path=str(agent_file),
            tools=FrontmatterParser.extract_tools(frontmatter),
            model=frontmatter.get("model"),
            role=frontmatter.get("role"),
            ace_capabilities=FrontmatterParser.get_nested_dict(frontmatter, "ace_capabilities"),
            is_shared=is_shared,
            modified_at=datetime.fromtimestamp(stat.st_mtime),
        )

    def get_project_mcp_config(self, project_id: str) -> list[MCPServerConfig]:
        """Get MCP server configuration for a project.

        Args:
            project_id: Project identifier

        Returns:
            List of MCPServerConfig
        """
        project_path = self._find_project_path(project_id)
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
            if not isinstance(config, dict):
                continue

            command = config.get("command", "")
            args = config.get("args", [])
            env = config.get("env", {})
            disabled = config.get("disabled", False)
            note = config.get("_note", "")

            # Determine server type
            if command == "npx":
                server_type = MCPServerType.NPX
                # Extract package name from args
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

            servers.append(
                MCPServerConfig(
                    server_id=server_id,
                    project_id=project_id,
                    command=command,
                    args=args if isinstance(args, list) else [],
                    env=env if isinstance(env, dict) else {},
                    disabled=disabled,
                    note=note,
                    server_type=server_type,
                    package_name=package_name,
                    source=MCPServerSource.PROJECT,
                )
            )

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
            if not isinstance(config, dict):
                continue

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

            servers.append(
                MCPServerConfig(
                    server_id=server_id,
                    project_id=project_id,
                    command=command,
                    args=args if isinstance(args, list) else [],
                    env=env if isinstance(env, dict) else {},
                    disabled=disabled,
                    note=note,
                    server_type=server_type,
                    package_name=package_name,
                    source=MCPServerSource.USER,
                )
            )

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
        project_path = self._find_project_path(project_id)
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
        project_path = self._find_project_path(project_id)
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
        project_path = self._find_project_path(project_id)
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
        project_path = self._find_project_path(project_id)
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

    # ========================================
    # Skills CRUD
    # ========================================

    def update_skill_content(self, project_id: str, skill_id: str, content: str) -> bool:
        """Update skill SKILL.md content.

        Args:
            project_id: Project identifier
            skill_id: Skill identifier (directory name)
            content: New SKILL.md content

        Returns:
            True if updated successfully
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        skill_file = project_path / ".claude" / "skills" / skill_id / "SKILL.md"
        if not skill_file.exists():
            logger.error(f"Skill not found: {skill_id}")
            return False

        try:
            with open(skill_file, "w", encoding="utf-8") as f:
                f.write(content)
                # Ensure trailing newline
                if not content.endswith("\n"):
                    f.write("\n")

            logger.info(f"Updated skill {skill_id} in project {project_id}")
            return True

        except OSError as e:
            logger.error(f"Error updating skill: {e}")
            return False

    def create_skill(self, project_id: str, skill_id: str, content: str) -> SkillConfig | None:
        """Create a new skill.

        Args:
            project_id: Project identifier
            skill_id: Skill identifier (will be directory name)
            content: SKILL.md content

        Returns:
            Created SkillConfig or None if failed
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return None

        skills_dir = project_path / ".claude" / "skills"
        skill_dir = skills_dir / skill_id

        # Create skills directory if doesn't exist
        skills_dir.mkdir(parents=True, exist_ok=True)

        # Check if skill already exists
        if skill_dir.exists():
            logger.error(f"Skill already exists: {skill_id}")
            return None

        try:
            # Create skill directory and SKILL.md
            skill_dir.mkdir()
            skill_file = skill_dir / "SKILL.md"

            with open(skill_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")

            logger.info(f"Created skill {skill_id} in project {project_id}")

            # Return created config
            return self._parse_skill(skill_file, project_id)

        except OSError as e:
            logger.error(f"Error creating skill: {e}")
            return None

    def delete_skill(self, project_id: str, skill_id: str) -> bool:
        """Delete a skill (removes entire skill directory).

        Args:
            project_id: Project identifier
            skill_id: Skill identifier

        Returns:
            True if deleted successfully
        """
        import shutil

        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        skill_dir = project_path / ".claude" / "skills" / skill_id
        if not skill_dir.exists():
            logger.error(f"Skill not found: {skill_id}")
            return False

        try:
            shutil.rmtree(skill_dir)
            logger.info(f"Deleted skill {skill_id} from project {project_id}")
            return True

        except OSError as e:
            logger.error(f"Error deleting skill: {e}")
            return False

    # ========================================
    # Agents CRUD
    # ========================================

    def get_agent_content(self, project_id: str, agent_id: str) -> tuple[AgentConfig | None, str]:
        """Get full content of an agent.

        Args:
            project_id: Project identifier
            agent_id: Agent identifier

        Returns:
            Tuple of (AgentConfig, content) or (None, "")
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            return None, ""

        agents_dir = project_path / ".claude" / "agents"

        # Check regular agents first
        agent_file = agents_dir / f"{agent_id}.md"
        is_shared = False

        if not agent_file.exists():
            # Check shared agents
            agent_file = agents_dir / "shared" / f"{agent_id}.md"
            is_shared = True

        if not agent_file.exists():
            return None, ""

        agent = self._parse_agent(agent_file, project_id, is_shared=is_shared)
        if not agent:
            return None, ""

        content = agent_file.read_text(encoding="utf-8")
        return agent, content

    def update_agent_content(self, project_id: str, agent_id: str, content: str) -> bool:
        """Update agent .md content.

        Args:
            project_id: Project identifier
            agent_id: Agent identifier
            content: New agent .md content

        Returns:
            True if updated successfully
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        agents_dir = project_path / ".claude" / "agents"

        # Check regular agents first
        agent_file = agents_dir / f"{agent_id}.md"
        if not agent_file.exists():
            # Check shared agents
            agent_file = agents_dir / "shared" / f"{agent_id}.md"

        if not agent_file.exists():
            logger.error(f"Agent not found: {agent_id}")
            return False

        try:
            with open(agent_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")

            logger.info(f"Updated agent {agent_id} in project {project_id}")
            return True

        except OSError as e:
            logger.error(f"Error updating agent: {e}")
            return False

    def create_agent(
        self, project_id: str, agent_id: str, content: str, is_shared: bool = False
    ) -> AgentConfig | None:
        """Create a new agent.

        Args:
            project_id: Project identifier
            agent_id: Agent identifier (will be filename without .md)
            content: Agent .md content
            is_shared: Whether to create in shared/ directory

        Returns:
            Created AgentConfig or None if failed
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return None

        agents_dir = project_path / ".claude" / "agents"
        agents_dir.mkdir(parents=True, exist_ok=True)

        if is_shared:
            target_dir = agents_dir / "shared"
            target_dir.mkdir(exist_ok=True)
            agent_file = target_dir / f"{agent_id}.md"
        else:
            agent_file = agents_dir / f"{agent_id}.md"

        # Check if agent already exists
        if agent_file.exists():
            logger.error(f"Agent already exists: {agent_id}")
            return None

        try:
            with open(agent_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")

            logger.info(f"Created agent {agent_id} in project {project_id}")
            return self._parse_agent(agent_file, project_id, is_shared=is_shared)

        except OSError as e:
            logger.error(f"Error creating agent: {e}")
            return None

    def delete_agent(self, project_id: str, agent_id: str) -> bool:
        """Delete an agent.

        Args:
            project_id: Project identifier
            agent_id: Agent identifier

        Returns:
            True if deleted successfully
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        agents_dir = project_path / ".claude" / "agents"

        # Check regular agents first
        agent_file = agents_dir / f"{agent_id}.md"
        if not agent_file.exists():
            # Check shared agents
            agent_file = agents_dir / "shared" / f"{agent_id}.md"

        if not agent_file.exists():
            logger.error(f"Agent not found: {agent_id}")
            return False

        try:
            agent_file.unlink()
            logger.info(f"Deleted agent {agent_id} from project {project_id}")
            return True

        except OSError as e:
            logger.error(f"Error deleting agent: {e}")
            return False

    # ========================================
    # Hooks CRUD
    # ========================================

    def update_hooks(self, project_id: str, hooks_data: dict) -> bool:
        """Update entire hooks.json content.

        Args:
            project_id: Project identifier
            hooks_data: Complete hooks configuration

        Returns:
            True if updated successfully
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        hooks_file = project_path / ".claude" / "hooks.json"

        try:
            with open(hooks_file, "w", encoding="utf-8") as f:
                json.dump(hooks_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            logger.info(f"Updated hooks in project {project_id}")
            return True

        except OSError as e:
            logger.error(f"Error updating hooks: {e}")
            return False

    def add_hook_entry(self, project_id: str, event: str, matcher: str, hooks: list[dict]) -> bool:
        """Add a hook entry to an event.

        Args:
            project_id: Project identifier
            event: Event name (PreToolUse, PostToolUse, etc.)
            matcher: Matcher pattern
            hooks: List of hook definitions

        Returns:
            True if added successfully
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        hooks_file = project_path / ".claude" / "hooks.json"

        # Read existing hooks or create new
        if hooks_file.exists():
            try:
                with open(hooks_file, encoding="utf-8") as f:
                    hooks_data = json.load(f)
            except (json.JSONDecodeError, OSError):
                hooks_data = {"hooks": {}}
        else:
            hooks_data = {"hooks": {}}

        # Ensure hooks wrapper exists
        if "hooks" not in hooks_data:
            hooks_data = {"hooks": hooks_data}

        # Add entry
        if event not in hooks_data["hooks"]:
            hooks_data["hooks"][event] = []

        hooks_data["hooks"][event].append(
            {
                "matcher": matcher,
                "hooks": hooks,
            }
        )

        try:
            with open(hooks_file, "w", encoding="utf-8") as f:
                json.dump(hooks_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            logger.info(f"Added hook entry for {event} in project {project_id}")
            return True

        except OSError as e:
            logger.error(f"Error adding hook: {e}")
            return False

    def delete_hook(self, project_id: str, event: str, index: int) -> bool:
        """Delete a hook entry by event and index.

        Args:
            project_id: Project identifier
            event: Event name
            index: Index of hook entry within the event

        Returns:
            True if deleted successfully
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        hooks_file = project_path / ".claude" / "hooks.json"
        if not hooks_file.exists():
            logger.error("Hooks file not found")
            return False

        try:
            with open(hooks_file, encoding="utf-8") as f:
                hooks_data = json.load(f)

            # Handle wrapped format
            if "hooks" in hooks_data:
                hooks_section = hooks_data["hooks"]
            else:
                hooks_section = hooks_data

            if event not in hooks_section:
                logger.error(f"Event not found: {event}")
                return False

            event_hooks = hooks_section[event]
            if index < 0 or index >= len(event_hooks):
                logger.error(f"Invalid hook index: {index}")
                return False

            del event_hooks[index]

            # Remove empty event
            if not event_hooks:
                del hooks_section[event]

            with open(hooks_file, "w", encoding="utf-8") as f:
                json.dump(hooks_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            logger.info(f"Deleted hook {event}[{index}] from project {project_id}")
            return True

        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Error deleting hook: {e}")
            return False

    def get_project_hooks(self, project_id: str) -> list[HookConfig]:
        """Get hooks configuration for a project.

        Args:
            project_id: Project identifier

        Returns:
            List of HookConfig
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            return []

        hooks = []
        hooks_file = project_path / ".claude" / "hooks.json"

        if hooks_file.exists():
            try:
                with open(hooks_file, encoding="utf-8") as f:
                    hooks_data = json.load(f)

                # Handle both formats:
                # 1. {"hooks": {"EventName": [...]}} (wrapped format)
                # 2. {"EventName": [...]} (direct format)
                if "hooks" in hooks_data and isinstance(hooks_data["hooks"], dict):
                    hooks_data = hooks_data["hooks"]

                # Parse hooks from hooks.json
                for event, event_hooks in hooks_data.items():
                    if not isinstance(event_hooks, list):
                        continue

                    for i, hook_entry in enumerate(event_hooks):
                        if not isinstance(hook_entry, dict):
                            continue

                        matcher = hook_entry.get("matcher", "*")
                        inner_hooks = hook_entry.get("hooks", [])

                        for j, hook in enumerate(inner_hooks):
                            if not isinstance(hook, dict):
                                continue

                            hooks.append(
                                HookConfig(
                                    hook_id=f"{event}_{i}_{j}",
                                    project_id=project_id,
                                    event=event,
                                    matcher=matcher,
                                    command=hook.get("command", ""),
                                    hook_type=hook.get("type", "command"),
                                )
                            )

            except (json.JSONDecodeError, OSError) as e:
                logger.error(f"Error reading hooks config: {e}")

        return hooks

    # ========================================
    # Commands CRUD
    # ========================================

    def get_project_commands(self, project_id: str) -> list[CommandConfig]:
        """Get all commands for a specific project.

        Args:
            project_id: Project identifier

        Returns:
            List of CommandConfig for the project
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            return []

        commands_dir = project_path / ".claude" / "commands"
        if not commands_dir.exists():
            return []

        commands = []
        for cmd_file in commands_dir.glob("*.md"):
            if not cmd_file.is_file():
                continue
            try:
                command = self._parse_command(cmd_file, project_id)
                if command:
                    commands.append(command)
            except Exception as e:
                logger.error(f"Error parsing command {cmd_file}: {e}")
                continue

        commands.sort(key=lambda c: c.name.lower())
        return commands

    def _parse_command(self, command_file: Path, project_id: str) -> CommandConfig | None:
        """Parse a command .md file.

        Args:
            command_file: Path to command .md file
            project_id: Parent project ID

        Returns:
            CommandConfig or None if parsing fails
        """
        frontmatter, body = FrontmatterParser.parse_file(str(command_file))
        if not frontmatter:
            frontmatter = {}

        command_id = command_file.stem
        stat = command_file.stat()

        return CommandConfig(
            command_id=command_id,
            project_id=project_id,
            name=FrontmatterParser.get_string_field(frontmatter, "name", command_id),
            description=FrontmatterParser.get_string_field(frontmatter, "description"),
            file_path=str(command_file),
            allowed_tools=frontmatter.get("allowed-tools"),
            argument_hint=frontmatter.get("argument-hint"),
            modified_at=datetime.fromtimestamp(stat.st_mtime),
        )

    def get_command_content(
        self, project_id: str, command_id: str
    ) -> tuple[CommandConfig | None, str]:
        """Get full content of a command.

        Args:
            project_id: Project identifier
            command_id: Command identifier

        Returns:
            Tuple of (CommandConfig, content) or (None, "")
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            return None, ""

        command_file = project_path / ".claude" / "commands" / f"{command_id}.md"
        if not command_file.exists():
            return None, ""

        command = self._parse_command(command_file, project_id)
        if not command:
            return None, ""

        content = command_file.read_text(encoding="utf-8")
        return command, content

    def create_command(
        self, project_id: str, command_id: str, content: str
    ) -> CommandConfig | None:
        """Create a new command.

        Args:
            project_id: Project identifier
            command_id: Command identifier (filename without .md)
            content: Command .md content

        Returns:
            Created CommandConfig or None if failed
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return None

        commands_dir = project_path / ".claude" / "commands"
        commands_dir.mkdir(parents=True, exist_ok=True)

        command_file = commands_dir / f"{command_id}.md"
        if command_file.exists():
            logger.error(f"Command already exists: {command_id}")
            return None

        try:
            with open(command_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")

            logger.info(f"Created command {command_id} in project {project_id}")
            return self._parse_command(command_file, project_id)

        except OSError as e:
            logger.error(f"Error creating command: {e}")
            return None

    def update_command_content(self, project_id: str, command_id: str, content: str) -> bool:
        """Update command .md content.

        Args:
            project_id: Project identifier
            command_id: Command identifier
            content: New command .md content

        Returns:
            True if updated successfully
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        command_file = project_path / ".claude" / "commands" / f"{command_id}.md"
        if not command_file.exists():
            logger.error(f"Command not found: {command_id}")
            return False

        try:
            with open(command_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")

            logger.info(f"Updated command {command_id} in project {project_id}")
            return True

        except OSError as e:
            logger.error(f"Error updating command: {e}")
            return False

    def delete_command(self, project_id: str, command_id: str) -> bool:
        """Delete a command.

        Args:
            project_id: Project identifier
            command_id: Command identifier

        Returns:
            True if deleted successfully
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            logger.error(f"Project not found: {project_id}")
            return False

        command_file = project_path / ".claude" / "commands" / f"{command_id}.md"
        if not command_file.exists():
            logger.error(f"Command not found: {command_id}")
            return False

        try:
            command_file.unlink()
            logger.info(f"Deleted command {command_id} from project {project_id}")
            return True

        except OSError as e:
            logger.error(f"Error deleting command: {e}")
            return False

    def copy_command(self, source_project_id: str, command_id: str, target_project_id: str) -> bool:
        """Copy a command to another project.

        Args:
            source_project_id: Source project identifier
            command_id: Command identifier to copy
            target_project_id: Target project identifier

        Returns:
            True if copied successfully
        """
        import shutil

        source_path = self._find_project_path(source_project_id)
        target_path = self._find_project_path(target_project_id)

        if not source_path or not target_path:
            logger.error("Source or target project not found")
            return False

        source_file = source_path / ".claude" / "commands" / f"{command_id}.md"
        if not source_file.exists():
            logger.error(f"Source command not found: {command_id}")
            return False

        target_commands_dir = target_path / ".claude" / "commands"
        target_commands_dir.mkdir(parents=True, exist_ok=True)

        target_file = target_commands_dir / f"{command_id}.md"

        # Handle name collision
        if target_file.exists():
            suffix = 1
            while (target_commands_dir / f"{command_id}-{suffix}.md").exists():
                suffix += 1
            target_file = target_commands_dir / f"{command_id}-{suffix}.md"

        try:
            shutil.copy2(source_file, target_file)
            logger.info(
                f"Copied command {command_id} from {source_project_id} to {target_project_id}"
            )
            return True
        except OSError as e:
            logger.error(f"Error copying command: {e}")
            return False

    # ========================================
    # Copy Operations
    # ========================================

    def copy_skill(self, source_project_id: str, skill_id: str, target_project_id: str) -> bool:
        """Copy a skill to another project.

        Args:
            source_project_id: Source project identifier
            skill_id: Skill identifier to copy
            target_project_id: Target project identifier

        Returns:
            True if copied successfully
        """
        import shutil

        source_path = self._find_project_path(source_project_id)
        target_path = self._find_project_path(target_project_id)

        if not source_path or not target_path:
            logger.error("Source or target project not found")
            return False

        source_skill_dir = source_path / ".claude" / "skills" / skill_id
        if not source_skill_dir.exists():
            logger.error(f"Source skill not found: {skill_id}")
            return False

        target_skills_dir = target_path / ".claude" / "skills"
        target_skill_dir = target_skills_dir / skill_id

        # Create skills directory if doesn't exist
        target_skills_dir.mkdir(parents=True, exist_ok=True)

        # Check if skill already exists in target
        if target_skill_dir.exists():
            # Append a suffix to avoid collision
            suffix = 1
            while (target_skills_dir / f"{skill_id}-{suffix}").exists():
                suffix += 1
            target_skill_dir = target_skills_dir / f"{skill_id}-{suffix}"

        try:
            shutil.copytree(source_skill_dir, target_skill_dir)
            logger.info(f"Copied skill {skill_id} from {source_project_id} to {target_project_id}")
            return True
        except OSError as e:
            logger.error(f"Error copying skill: {e}")
            return False

    def copy_agent(self, source_project_id: str, agent_id: str, target_project_id: str) -> bool:
        """Copy an agent to another project.

        Args:
            source_project_id: Source project identifier
            agent_id: Agent identifier to copy
            target_project_id: Target project identifier

        Returns:
            True if copied successfully
        """
        import shutil

        source_path = self._find_project_path(source_project_id)
        target_path = self._find_project_path(target_project_id)

        if not source_path or not target_path:
            logger.error("Source or target project not found")
            return False

        source_agents_dir = source_path / ".claude" / "agents"

        # Find source agent file (could be in root or shared/)
        source_file = source_agents_dir / f"{agent_id}.md"
        is_shared = False
        if not source_file.exists():
            source_file = source_agents_dir / "shared" / f"{agent_id}.md"
            is_shared = True

        if not source_file.exists():
            logger.error(f"Source agent not found: {agent_id}")
            return False

        target_agents_dir = target_path / ".claude" / "agents"
        if is_shared:
            target_dir = target_agents_dir / "shared"
        else:
            target_dir = target_agents_dir

        target_dir.mkdir(parents=True, exist_ok=True)
        target_file = target_dir / f"{agent_id}.md"

        # Check if agent already exists in target
        if target_file.exists():
            # Append a suffix to avoid collision
            suffix = 1
            while (target_dir / f"{agent_id}-{suffix}.md").exists():
                suffix += 1
            target_file = target_dir / f"{agent_id}-{suffix}.md"

        try:
            shutil.copy2(source_file, target_file)
            logger.info(f"Copied agent {agent_id} from {source_project_id} to {target_project_id}")
            return True
        except OSError as e:
            logger.error(f"Error copying agent: {e}")
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
        source_path = self._find_project_path(source_project_id)
        target_path = self._find_project_path(target_project_id)

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

    def copy_hook(
        self, source_project_id: str, event: str, index: int, target_project_id: str
    ) -> bool:
        """Copy a hook to another project.

        Args:
            source_project_id: Source project identifier
            event: Hook event name
            index: Hook entry index
            target_project_id: Target project identifier

        Returns:
            True if copied successfully
        """
        source_path = self._find_project_path(source_project_id)
        target_path = self._find_project_path(target_project_id)

        if not source_path or not target_path:
            logger.error("Source or target project not found")
            return False

        source_hooks_file = source_path / ".claude" / "hooks.json"
        if not source_hooks_file.exists():
            logger.error("Source hooks config not found")
            return False

        try:
            with open(source_hooks_file, encoding="utf-8") as f:
                source_data = json.load(f)

            # Handle wrapped format
            if "hooks" in source_data:
                source_hooks = source_data["hooks"]
            else:
                source_hooks = source_data

            if event not in source_hooks:
                logger.error(f"Source event not found: {event}")
                return False

            event_hooks = source_hooks[event]
            if index < 0 or index >= len(event_hooks):
                logger.error(f"Invalid hook index: {index}")
                return False

            hook_entry = event_hooks[index]

            # Read or create target hooks.json
            target_hooks_file = target_path / ".claude" / "hooks.json"
            target_hooks_file.parent.mkdir(parents=True, exist_ok=True)

            if target_hooks_file.exists():
                with open(target_hooks_file, encoding="utf-8") as f:
                    target_data = json.load(f)
            else:
                target_data = {"hooks": {}}

            # Ensure hooks wrapper
            if "hooks" not in target_data:
                target_data = {"hooks": target_data}

            target_hooks = target_data["hooks"]
            if event not in target_hooks:
                target_hooks[event] = []

            target_hooks[event].append(hook_entry)

            with open(target_hooks_file, "w", encoding="utf-8") as f:
                json.dump(target_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            logger.info(
                f"Copied hook {event}[{index}] from {source_project_id} to {target_project_id}"
            )
            return True

        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Error copying hook: {e}")
            return False

    def get_project_summary(self, project_id: str) -> ProjectConfigSummary | None:
        """Get full configuration summary for a project.

        Args:
            project_id: Project identifier

        Returns:
            ProjectConfigSummary or None if not found
        """
        project_path = self._find_project_path(project_id)
        if not project_path:
            return None

        project_info = self._scan_project(project_path)
        if not project_info:
            return None

        return ProjectConfigSummary(
            project=project_info,
            skills=self.get_project_skills(project_id),
            agents=self.get_project_agents(project_id),
            mcp_servers=self.get_project_mcp_config(project_id),
            user_mcp_servers=self.get_user_mcp_config(project_id),
            hooks=self.get_project_hooks(project_id),
            commands=self.get_project_commands(project_id),
        )

    def _find_project_path(self, project_id: str) -> Path | None:
        """Find project path by ID.

        Args:
            project_id: Project identifier

        Returns:
            Path to project or None
        """
        for project_path in self._project_paths:
            if self._encode_path(project_path) == project_id:
                return project_path
        return None

    async def watch_configs(
        self, interval_seconds: float = 2.0
    ) -> AsyncIterator[ConfigChangeEvent]:
        """Watch for configuration changes using polling.

        Args:
            interval_seconds: Polling interval

        Yields:
            ConfigChangeEvent on each detected change
        """
        # Initialize file mtimes
        self._refresh_file_mtimes()

        while True:
            await asyncio.sleep(interval_seconds)

            # Check for changes
            changes = self._detect_changes()
            for change in changes:
                yield change

            # Refresh mtimes
            self._refresh_file_mtimes()

    def _refresh_file_mtimes(self) -> None:
        """Refresh tracked file modification times."""
        new_mtimes = {}

        for project_path in self._project_paths:
            claude_dir = project_path / ".claude"
            if not claude_dir.exists():
                continue

            # Track key config files
            files_to_track = [
                claude_dir / "mcp.json",
                claude_dir / "hooks.json",
            ]

            # Track skill files
            skills_dir = claude_dir / "skills"
            if skills_dir.exists():
                for skill_dir in skills_dir.iterdir():
                    if skill_dir.is_dir():
                        skill_file = skill_dir / "SKILL.md"
                        if skill_file.exists():
                            files_to_track.append(skill_file)

            # Track agent files
            agents_dir = claude_dir / "agents"
            if agents_dir.exists():
                for agent_file in agents_dir.glob("**/*.md"):
                    files_to_track.append(agent_file)

            # Track command files
            commands_dir = claude_dir / "commands"
            if commands_dir.exists():
                for cmd_file in commands_dir.glob("*.md"):
                    files_to_track.append(cmd_file)

            # Record mtimes
            for file_path in files_to_track:
                if file_path.exists():
                    try:
                        new_mtimes[str(file_path)] = file_path.stat().st_mtime
                    except OSError:
                        pass

        self._file_mtimes = new_mtimes

    def _detect_changes(self) -> list[ConfigChangeEvent]:
        """Detect configuration changes since last check.

        Returns:
            List of ConfigChangeEvent for detected changes
        """
        changes = []
        current_mtimes: dict[str, float] = {}

        for project_path in self._project_paths:
            claude_dir = project_path / ".claude"
            if not claude_dir.exists():
                continue

            project_id = self._encode_path(project_path)

            # Check MCP config
            mcp_file = claude_dir / "mcp.json"
            if mcp_file.exists():
                try:
                    mtime = mcp_file.stat().st_mtime
                    key = str(mcp_file)
                    current_mtimes[key] = mtime

                    if key in self._file_mtimes:
                        if mtime != self._file_mtimes[key]:
                            changes.append(
                                ConfigChangeEvent(
                                    event_type=ConfigChangeType.MODIFIED,
                                    project_id=project_id,
                                    config_type="mcp",
                                    timestamp=datetime.utcnow(),
                                )
                            )
                    else:
                        changes.append(
                            ConfigChangeEvent(
                                event_type=ConfigChangeType.CREATED,
                                project_id=project_id,
                                config_type="mcp",
                                timestamp=datetime.utcnow(),
                            )
                        )
                except OSError:
                    pass

            # Check hooks
            hooks_file = claude_dir / "hooks.json"
            if hooks_file.exists():
                try:
                    mtime = hooks_file.stat().st_mtime
                    key = str(hooks_file)
                    current_mtimes[key] = mtime

                    if key in self._file_mtimes and mtime != self._file_mtimes[key]:
                        changes.append(
                            ConfigChangeEvent(
                                event_type=ConfigChangeType.MODIFIED,
                                project_id=project_id,
                                config_type="hooks",
                                timestamp=datetime.utcnow(),
                            )
                        )
                except OSError:
                    pass

            # Check skills
            skills_dir = claude_dir / "skills"
            if skills_dir.exists():
                for skill_dir in skills_dir.iterdir():
                    if not skill_dir.is_dir():
                        continue
                    skill_file = skill_dir / "SKILL.md"
                    if skill_file.exists():
                        try:
                            mtime = skill_file.stat().st_mtime
                            key = str(skill_file)
                            current_mtimes[key] = mtime

                            if key in self._file_mtimes:
                                if mtime != self._file_mtimes[key]:
                                    changes.append(
                                        ConfigChangeEvent(
                                            event_type=ConfigChangeType.MODIFIED,
                                            project_id=project_id,
                                            config_type="skills",
                                            item_id=skill_dir.name,
                                            timestamp=datetime.utcnow(),
                                        )
                                    )
                            else:
                                changes.append(
                                    ConfigChangeEvent(
                                        event_type=ConfigChangeType.CREATED,
                                        project_id=project_id,
                                        config_type="skills",
                                        item_id=skill_dir.name,
                                        timestamp=datetime.utcnow(),
                                    )
                                )
                        except OSError:
                            pass

            # Check agents
            agents_dir = claude_dir / "agents"
            if agents_dir.exists():
                for agent_file in agents_dir.glob("**/*.md"):
                    try:
                        mtime = agent_file.stat().st_mtime
                        key = str(agent_file)
                        current_mtimes[key] = mtime

                        if key in self._file_mtimes:
                            if mtime != self._file_mtimes[key]:
                                changes.append(
                                    ConfigChangeEvent(
                                        event_type=ConfigChangeType.MODIFIED,
                                        project_id=project_id,
                                        config_type="agents",
                                        item_id=agent_file.stem,
                                        timestamp=datetime.utcnow(),
                                    )
                                )
                        else:
                            changes.append(
                                ConfigChangeEvent(
                                    event_type=ConfigChangeType.CREATED,
                                    project_id=project_id,
                                    config_type="agents",
                                    item_id=agent_file.stem,
                                    timestamp=datetime.utcnow(),
                                )
                            )
                    except OSError:
                        pass

            # Check commands
            commands_dir = claude_dir / "commands"
            if commands_dir.exists():
                for cmd_file in commands_dir.glob("*.md"):
                    try:
                        mtime = cmd_file.stat().st_mtime
                        key = str(cmd_file)
                        current_mtimes[key] = mtime

                        if key in self._file_mtimes:
                            if mtime != self._file_mtimes[key]:
                                changes.append(
                                    ConfigChangeEvent(
                                        event_type=ConfigChangeType.MODIFIED,
                                        project_id=project_id,
                                        config_type="commands",
                                        item_id=cmd_file.stem,
                                        timestamp=datetime.utcnow(),
                                    )
                                )
                        else:
                            changes.append(
                                ConfigChangeEvent(
                                    event_type=ConfigChangeType.CREATED,
                                    project_id=project_id,
                                    config_type="commands",
                                    item_id=cmd_file.stem,
                                    timestamp=datetime.utcnow(),
                                )
                            )
                    except OSError:
                        pass

        # Check for deletions
        for old_key in self._file_mtimes:
            if old_key not in current_mtimes:
                # Determine config type from path
                if "mcp.json" in old_key:
                    config_type = "mcp"
                elif "hooks.json" in old_key:
                    config_type = "hooks"
                elif "/skills/" in old_key or "\\skills\\" in old_key:
                    config_type = "skills"
                elif "/agents/" in old_key or "\\agents\\" in old_key:
                    config_type = "agents"
                elif "/commands/" in old_key or "\\commands\\" in old_key:
                    config_type = "commands"
                else:
                    continue

                # Find project ID
                for project_path in self._project_paths:
                    if str(project_path) in old_key:
                        changes.append(
                            ConfigChangeEvent(
                                event_type=ConfigChangeType.DELETED,
                                project_id=self._encode_path(project_path),
                                config_type=config_type,
                                timestamp=datetime.utcnow(),
                            )
                        )
                        break

        return changes


# Global monitor instance
_monitor: ProjectConfigMonitor | None = None


def get_project_config_monitor() -> ProjectConfigMonitor:
    """Get or create the global monitor instance.

    Auto-discovers projects from:
    - Current working directory
    - Parent Agent-System directory (../..)
    - Symlinked projects in ../../projects/
    - CLAUDE_PROJECT_PATHS environment variable
    """
    global _monitor
    if _monitor is None:
        extra_paths: list[str] = []

        # Add parent Agent-System root (has .claude/ with skills, agents, etc.)
        agent_system_root = Path.cwd().resolve().parent.parent
        if (agent_system_root / ".claude").exists():
            extra_paths.append(str(agent_system_root))

        # Discover symlinked projects in projects/ directory
        projects_dir = agent_system_root / "projects"
        if projects_dir.exists() and projects_dir.is_dir():
            for entry in projects_dir.iterdir():
                if entry.is_dir():
                    resolved = entry.resolve()
                    if resolved.exists():
                        extra_paths.append(str(resolved))

        _monitor = ProjectConfigMonitor(project_paths=extra_paths)
    return _monitor
