"""Project configuration monitor service.

Slim orchestrator that composes domain-specific managers and provides
file watching for real-time change detection.

Domain managers:
- ProjectDiscovery: project scanning and path management
- SkillManager: skill CRUD and parsing
- AgentManager: agent CRUD and parsing
- MCPConfigManager: MCP server CRUD
- MemoryManager: memory CRUD and parsing
- RulesManager: rules CRUD and parsing
"""

import asyncio
import json
import logging
import shutil
from collections.abc import AsyncIterator
from datetime import datetime
from pathlib import Path

from models.project_config import (
    AgentConfig,
    CommandConfig,
    ConfigChangeEvent,
    ConfigChangeType,
    GlobalConfigSummary,
    HookConfig,
    MCPServerConfig,
    MemoryConfig,
    ProjectConfigSummary,
    ProjectInfo,
    RuleConfig,
    SkillConfig,
)
from services.agent_manager import AgentManager
from services.frontmatter_parser import FrontmatterParser
from services.mcp_config_manager import MCPConfigManager
from services.memory_manager import MemoryManager
from services.project_discovery import ProjectDiscovery
from services.rules_manager import RulesManager
from services.skill_manager import SkillManager
from utils.time import utcnow

logger = logging.getLogger(__name__)


class ProjectConfigMonitor:
    """Monitor for Claude Code project configurations.

    Composes ProjectDiscovery, SkillManager, AgentManager, and MCPConfigManager
    to provide a unified API, plus hooks/commands CRUD and file watching.
    """

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
        self._discovery = ProjectDiscovery(
            project_paths=project_paths,
            include_current=include_current,
        )
        self._skill_manager = SkillManager(self._discovery)
        self._agent_manager = AgentManager(self._discovery)
        self._mcp_manager = MCPConfigManager(self._discovery)
        self._memory_manager = MemoryManager(self._discovery)
        self._rules_manager = RulesManager(self._discovery)

        self._cache: dict[str, ProjectConfigSummary] = {}
        self._file_mtimes: dict[str, float] = {}

    # ========================================
    # Delegated: ProjectDiscovery
    # ========================================

    def add_external_project(self, path: str) -> bool:
        return self._discovery.add_external_project(path)

    def remove_external_project(self, path: str) -> bool:
        result = self._discovery.remove_external_project(path)
        if result:
            # Clear cache using the path
            p = Path(path).resolve()
            project_id = self._discovery.encode_path(p)
            self._cache.pop(project_id, None)
        return result

    def remove_project(self, path: str) -> bool:
        # Get project_id before removal for cache clearing
        p = Path(path)
        resolved_p = p.resolve() if p.exists() else p
        project_id = self._discovery.encode_path(resolved_p)

        result = self._discovery.remove_project(path)
        if result:
            self._cache.pop(project_id, None)
        return result

    def get_external_paths(self) -> list[str]:
        return self._discovery.get_external_paths()

    def get_monitored_paths(self) -> list[str]:
        return self._discovery.get_monitored_paths()

    def discover_projects(self) -> list[ProjectInfo]:
        return self._discovery.discover_projects()

    # ========================================
    # Delegated: SkillManager
    # ========================================

    def get_all_skills(self) -> list[SkillConfig]:
        return self._skill_manager.get_all_skills()

    def get_project_skills(self, project_id: str) -> list[SkillConfig]:
        return self._skill_manager.get_project_skills(project_id)

    def get_skill_content(
        self, project_id: str, skill_id: str
    ) -> tuple[SkillConfig | None, str, list[str]]:
        return self._skill_manager.get_skill_content(project_id, skill_id)

    def update_skill_content(self, project_id: str, skill_id: str, content: str) -> bool:
        return self._skill_manager.update_skill_content(project_id, skill_id, content)

    def create_skill(self, project_id: str, skill_id: str, content: str) -> SkillConfig | None:
        return self._skill_manager.create_skill(project_id, skill_id, content)

    def delete_skill(self, project_id: str, skill_id: str) -> bool:
        return self._skill_manager.delete_skill(project_id, skill_id)

    def copy_skill(self, source_project_id: str, skill_id: str, target_project_id: str) -> bool:
        return self._skill_manager.copy_skill(source_project_id, skill_id, target_project_id)

    # ========================================
    # Delegated: AgentManager
    # ========================================

    def get_all_agents(self) -> list[AgentConfig]:
        return self._agent_manager.get_all_agents()

    def get_project_agents(self, project_id: str) -> list[AgentConfig]:
        return self._agent_manager.get_project_agents(project_id)

    def get_agent_content(self, project_id: str, agent_id: str) -> tuple[AgentConfig | None, str]:
        return self._agent_manager.get_agent_content(project_id, agent_id)

    def update_agent_content(self, project_id: str, agent_id: str, content: str) -> bool:
        return self._agent_manager.update_agent_content(project_id, agent_id, content)

    def create_agent(
        self, project_id: str, agent_id: str, content: str, is_shared: bool = False
    ) -> AgentConfig | None:
        return self._agent_manager.create_agent(project_id, agent_id, content, is_shared)

    def delete_agent(self, project_id: str, agent_id: str) -> bool:
        return self._agent_manager.delete_agent(project_id, agent_id)

    def copy_agent(self, source_project_id: str, agent_id: str, target_project_id: str) -> bool:
        return self._agent_manager.copy_agent(source_project_id, agent_id, target_project_id)

    # ========================================
    # Delegated: MCPConfigManager
    # ========================================

    def get_project_mcp_config(self, project_id: str) -> list[MCPServerConfig]:
        return self._mcp_manager.get_project_mcp_config(project_id)

    def get_user_mcp_config(self, project_id: str = "") -> list[MCPServerConfig]:
        return self._mcp_manager.get_user_mcp_config(project_id)

    def enable_mcp_server(self, project_id: str, server_id: str) -> bool:
        return self._mcp_manager.enable_mcp_server(project_id, server_id)

    def disable_mcp_server(self, project_id: str, server_id: str) -> bool:
        return self._mcp_manager.disable_mcp_server(project_id, server_id)

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
        return self._mcp_manager.update_mcp_server(
            project_id, server_id, command, args, env, disabled, note
        )

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
        return self._mcp_manager.create_mcp_server(
            project_id, server_id, command, args, env, disabled, note
        )

    def delete_mcp_server(self, project_id: str, server_id: str) -> bool:
        return self._mcp_manager.delete_mcp_server(project_id, server_id)

    def copy_mcp_server(
        self, source_project_id: str, server_id: str, target_project_id: str
    ) -> bool:
        return self._mcp_manager.copy_mcp_server(source_project_id, server_id, target_project_id)

    # ========================================
    # Delegated: MemoryManager
    # ========================================

    def get_project_memories(self, project_id: str) -> list[MemoryConfig]:
        return self._memory_manager.get_project_memories(project_id)

    def get_memory_content(
        self, project_id: str, memory_id: str
    ) -> tuple[MemoryConfig | None, str]:
        return self._memory_manager.get_memory_content(project_id, memory_id)

    def get_memory_index(self, project_id: str) -> str:
        return self._memory_manager.get_memory_index(project_id)

    def update_memory_index(self, project_id: str, content: str) -> bool:
        return self._memory_manager.update_memory_index(project_id, content)

    def create_memory(self, project_id: str, memory_id: str, content: str) -> MemoryConfig | None:
        return self._memory_manager.create_memory(project_id, memory_id, content)

    def update_memory_content(self, project_id: str, memory_id: str, content: str) -> bool:
        return self._memory_manager.update_memory_content(project_id, memory_id, content)

    def delete_memory(self, project_id: str, memory_id: str) -> bool:
        return self._memory_manager.delete_memory(project_id, memory_id)

    # ========================================
    # Delegated: RulesManager
    # ========================================

    def get_project_rules(self, project_id: str) -> list[RuleConfig]:
        return self._rules_manager.get_project_rules(project_id)

    def get_global_rules(self) -> list[RuleConfig]:
        return self._rules_manager.get_global_rules()

    def get_rule_content(
        self, project_id: str, rule_id: str, is_global: bool = False
    ) -> tuple[RuleConfig | None, str]:
        return self._rules_manager.get_rule_content(project_id, rule_id, is_global)

    def create_rule(
        self, project_id: str, rule_id: str, content: str, is_global: bool = False
    ) -> RuleConfig | None:
        return self._rules_manager.create_rule(project_id, rule_id, content, is_global)

    def update_rule_content(
        self, project_id: str, rule_id: str, content: str, is_global: bool = False
    ) -> bool:
        return self._rules_manager.update_rule_content(project_id, rule_id, content, is_global)

    def delete_rule(self, project_id: str, rule_id: str, is_global: bool = False) -> bool:
        return self._rules_manager.delete_rule(project_id, rule_id, is_global)

    def copy_rule(self, source_project_id: str, rule_id: str, target_project_id: str) -> bool:
        return self._rules_manager.copy_rule(source_project_id, rule_id, target_project_id)

    # ========================================
    # Hooks CRUD (kept in monitor)
    # ========================================

    def get_project_hooks(self, project_id: str) -> list[HookConfig]:
        """Get hooks configuration for a project.

        Args:
            project_id: Project identifier

        Returns:
            List of HookConfig
        """
        project_path = self._discovery.find_project_path(project_id)
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

    def update_hooks(self, project_id: str, hooks_data: dict) -> bool:
        """Update entire hooks.json content.

        Args:
            project_id: Project identifier
            hooks_data: Complete hooks configuration

        Returns:
            True if updated successfully
        """
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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
        source_path = self._discovery.find_project_path(source_project_id)
        target_path = self._discovery.find_project_path(target_project_id)

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

    # ========================================
    # Commands CRUD (kept in monitor)
    # ========================================

    def get_project_commands(self, project_id: str) -> list[CommandConfig]:
        """Get all commands for a specific project.

        Args:
            project_id: Project identifier

        Returns:
            List of CommandConfig for the project
        """
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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
        source_path = self._discovery.find_project_path(source_project_id)
        target_path = self._discovery.find_project_path(target_project_id)

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
    # Global Configs (~/.claude/)
    # ========================================

    def get_global_configs(self) -> GlobalConfigSummary:
        """Get global configurations from ~/.claude/ directory.

        Scans:
        - ~/.claude/agents/*.md for global agents
        - ~/.claude/skills/*/SKILL.md for global skills
        - ~/.claude/settings.json hooks for global hooks

        Returns:
            GlobalConfigSummary with agents, skills, hooks
        """
        home_claude = Path.home() / ".claude"
        global_project_id = "__global__"
        agents: list[AgentConfig] = []
        skills: list[SkillConfig] = []
        hooks: list[HookConfig] = []

        # --- Global Agents ---
        agents_dir = home_claude / "agents"
        if agents_dir.exists():
            for agent_file in sorted(agents_dir.glob("*.md")):
                if not agent_file.is_file():
                    continue
                try:
                    frontmatter, body = FrontmatterParser.parse_file(str(agent_file))
                    if not frontmatter:
                        frontmatter = {"name": agent_file.stem}

                    stat = agent_file.stat()
                    agents.append(
                        AgentConfig(
                            agent_id=agent_file.stem,
                            project_id=global_project_id,
                            name=FrontmatterParser.get_string_field(
                                frontmatter, "name", agent_file.stem
                            ),
                            description=FrontmatterParser.get_string_field(
                                frontmatter, "description"
                            ),
                            file_path=str(agent_file),
                            tools=FrontmatterParser.extract_tools(frontmatter),
                            model=frontmatter.get("model"),
                            role=frontmatter.get("role"),
                            is_shared=False,
                            modified_at=datetime.fromtimestamp(stat.st_mtime),
                        )
                    )
                except Exception as e:
                    logger.error(f"Error parsing global agent {agent_file}: {e}")

        # --- Global Skills ---
        skills_dir = home_claude / "skills"
        if skills_dir.exists():
            for skill_dir in sorted(skills_dir.iterdir()):
                if not skill_dir.is_dir():
                    continue
                skill_file = skill_dir / "SKILL.md"
                if not skill_file.exists():
                    continue
                try:
                    frontmatter, body = FrontmatterParser.parse_file(str(skill_file))
                    if not frontmatter:
                        frontmatter = {"name": skill_dir.name}

                    stat = skill_file.stat()
                    has_references = (skill_dir / "references").exists()
                    has_scripts = (skill_dir / "scripts").exists()
                    has_assets = (skill_dir / "assets").exists()

                    skills.append(
                        SkillConfig(
                            skill_id=skill_dir.name,
                            project_id=global_project_id,
                            name=FrontmatterParser.get_string_field(
                                frontmatter, "name", skill_dir.name
                            ),
                            description=FrontmatterParser.get_string_field(
                                frontmatter, "description"
                            ),
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
                    )
                except Exception as e:
                    logger.error(f"Error parsing global skill {skill_dir.name}: {e}")

        # --- Global Hooks (from ~/.claude/settings.json) ---
        settings_file = home_claude / "settings.json"
        if settings_file.exists():
            try:
                with open(settings_file, encoding="utf-8") as f:
                    settings = json.load(f)

                hooks_data = settings.get("hooks", {})
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
                                    hook_id=f"global_{event}_{i}_{j}",
                                    project_id=global_project_id,
                                    event=event,
                                    matcher=matcher,
                                    command=hook.get("command", ""),
                                    hook_type=hook.get("type", "command"),
                                )
                            )
            except (json.JSONDecodeError, OSError) as e:
                logger.error(f"Error reading global settings.json: {e}")

        # --- Global MCP Servers (from ~/.claude.json) ---
        mcp_servers = self._mcp_manager.get_user_mcp_config(global_project_id)

        # --- Global Rules ---
        rules = self._rules_manager.get_global_rules()

        return GlobalConfigSummary(
            agents=agents,
            skills=skills,
            hooks=hooks,
            mcp_servers=mcp_servers,
            rules=rules,
        )

    # ========================================
    # Summary
    # ========================================

    def get_project_summary(self, project_id: str) -> ProjectConfigSummary | None:
        """Get full configuration summary for a project.

        Args:
            project_id: Project identifier

        Returns:
            ProjectConfigSummary or None if not found
        """
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            return None

        project_info = self._discovery.scan_project(project_path)
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
            rules=self.get_project_rules(project_id),
            memories=self.get_project_memories(project_id),
        )

    # ========================================
    # File Watching
    # ========================================

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

        for project_path in self._discovery.project_paths:
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

        for project_path in self._discovery.project_paths:
            claude_dir = project_path / ".claude"
            if not claude_dir.exists():
                continue

            project_id = self._discovery.encode_path(project_path)

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
                                    timestamp=utcnow(),
                                )
                            )
                    else:
                        changes.append(
                            ConfigChangeEvent(
                                event_type=ConfigChangeType.CREATED,
                                project_id=project_id,
                                config_type="mcp",
                                timestamp=utcnow(),
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
                                timestamp=utcnow(),
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
                                            timestamp=utcnow(),
                                        )
                                    )
                            else:
                                changes.append(
                                    ConfigChangeEvent(
                                        event_type=ConfigChangeType.CREATED,
                                        project_id=project_id,
                                        config_type="skills",
                                        item_id=skill_dir.name,
                                        timestamp=utcnow(),
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
                                        timestamp=utcnow(),
                                    )
                                )
                        else:
                            changes.append(
                                ConfigChangeEvent(
                                    event_type=ConfigChangeType.CREATED,
                                    project_id=project_id,
                                    config_type="agents",
                                    item_id=agent_file.stem,
                                    timestamp=utcnow(),
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
                                        timestamp=utcnow(),
                                    )
                                )
                        else:
                            changes.append(
                                ConfigChangeEvent(
                                    event_type=ConfigChangeType.CREATED,
                                    project_id=project_id,
                                    config_type="commands",
                                    item_id=cmd_file.stem,
                                    timestamp=utcnow(),
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
                for project_path in self._discovery.project_paths:
                    if str(project_path) in old_key:
                        changes.append(
                            ConfigChangeEvent(
                                event_type=ConfigChangeType.DELETED,
                                project_id=self._discovery.encode_path(project_path),
                                config_type=config_type,
                                timestamp=utcnow(),
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
