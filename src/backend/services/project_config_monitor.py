"""Project configuration monitor service.

Discovers and monitors Claude Code project configurations (skills, agents, MCP)
from filesystem. Supports real-time change detection via file watching.
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

from models.project_config import (
    AgentConfig,
    ConfigChangeEvent,
    ConfigChangeType,
    HookConfig,
    MCPServerConfig,
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

        # Add current directory if it has .claude/
        if include_current:
            cwd = Path.cwd()
            claude_dir = cwd / ".claude"
            if claude_dir.exists():
                self._project_paths.append(cwd)

        # Add provided paths
        if project_paths:
            for p in project_paths:
                path = Path(p)
                if path.exists() and (path / ".claude").exists():
                    if path not in self._project_paths:
                        self._project_paths.append(path)

        # Add paths from environment variable
        env_paths = os.getenv("CLAUDE_PROJECT_PATHS", "")
        if env_paths:
            for p in env_paths.split(","):
                p = p.strip()
                if p:
                    path = Path(p)
                    if path.exists() and (path / ".claude").exists():
                        if path not in self._project_paths:
                            self._project_paths.append(path)
                            logger.info(f"Added project path from env: {path}")

    def add_external_project(self, path: str) -> bool:
        """Add an external project path at runtime.

        Args:
            path: Path to project root (must have .claude/ directory)

        Returns:
            True if added, False if invalid or already exists
        """
        p = Path(path)
        if not p.exists():
            logger.warning(f"Path does not exist: {path}")
            return False
        if not (p / ".claude").exists():
            logger.warning(f"Path has no .claude directory: {path}")
            return False
        if p in self._project_paths:
            logger.info(f"Path already monitored: {path}")
            return False

        self._project_paths.append(p)
        self._external_paths.append(path)
        logger.info(f"Added external project: {path}")
        return True

    def remove_external_project(self, path: str) -> bool:
        """Remove an external project path.

        Args:
            path: Path to remove

        Returns:
            True if removed, False if not found
        """
        p = Path(path)
        if p not in self._project_paths:
            return False

        self._project_paths.remove(p)
        if path in self._external_paths:
            self._external_paths.remove(path)

        # Clear cache for this project
        project_id = self._encode_path(p)
        self._cache.pop(project_id, None)

        logger.info(f"Removed external project: {path}")
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

    def discover_projects(self) -> list[ProjectInfo]:
        """Discover all projects with Claude Code configuration.

        Returns:
            List of ProjectInfo for each discovered project
        """
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
            ProjectInfo or None if no .claude/ found
        """
        claude_dir = project_path / ".claude"
        if not claude_dir.exists():
            return None

        project_id = self._encode_path(project_path)
        project_name = project_path.name

        # Count resources
        skills_dir = claude_dir / "skills"
        agents_dir = claude_dir / "agents"
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
                1
                for f in agents_dir.glob("*.md")
                if f.is_file() and not f.name.startswith(".")
            )
            # Exclude shared/ directory files from agent count
            shared_dir = agents_dir / "shared"
            if shared_dir.exists():
                agent_count -= sum(1 for f in shared_dir.glob("*.md") if f.is_file())

        mcp_server_count = 0
        if mcp_file.exists():
            try:
                with open(mcp_file, "r", encoding="utf-8") as f:
                    mcp_data = json.load(f)
                    mcp_server_count = len(mcp_data.get("mcpServers", {}))
            except (json.JSONDecodeError, OSError):
                pass

        # Get last modified time from most recently modified config file
        last_modified = datetime.utcnow()
        for check_path in [skills_dir, agents_dir, mcp_file, hooks_file]:
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
            skill_count=skill_count,
            agent_count=agent_count,
            mcp_server_count=mcp_server_count,
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

    def get_skill_content(self, project_id: str, skill_id: str) -> tuple[SkillConfig | None, str, list[str]]:
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
            ace_capabilities=FrontmatterParser.get_nested_dict(
                frontmatter, "ace_capabilities"
            ),
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
            with open(mcp_file, "r", encoding="utf-8") as f:
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

    def _toggle_mcp_server(
        self, project_id: str, server_id: str, disabled: bool
    ) -> bool:
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
            with open(mcp_file, "r", encoding="utf-8") as f:
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
                with open(hooks_file, "r", encoding="utf-8") as f:
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
            hooks=self.get_project_hooks(project_id),
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
    """Get or create the global monitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = ProjectConfigMonitor()
    return _monitor
