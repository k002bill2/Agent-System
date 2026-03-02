"""Agent management for Claude Code projects.

Handles CRUD operations and parsing for agent .md files
within .claude/agents/ directories.
"""

import logging
import shutil
from datetime import datetime
from pathlib import Path

from models.project_config import AgentConfig
from services.frontmatter_parser import FrontmatterParser
from services.project_discovery import ProjectDiscovery

logger = logging.getLogger(__name__)


class AgentManager:
    """Manages Claude Code agent configurations."""

    def __init__(self, discovery: ProjectDiscovery):
        """Initialize with a ProjectDiscovery instance.

        Args:
            discovery: ProjectDiscovery for path resolution
        """
        self._discovery = discovery

    def get_all_agents(self) -> list[AgentConfig]:
        """Get all agents from all monitored projects.

        Returns:
            List of AgentConfig across all projects
        """
        all_agents = []
        for project_path in self._discovery.project_paths:
            agents = self.get_project_agents(self._discovery.encode_path(project_path))
            all_agents.extend(agents)
        return all_agents

    def get_project_agents(self, project_id: str) -> list[AgentConfig]:
        """Get all agents for a specific project.

        Args:
            project_id: Project identifier

        Returns:
            List of AgentConfig for the project
        """
        project_path = self._discovery.find_project_path(project_id)
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

    def get_agent_content(self, project_id: str, agent_id: str) -> tuple[AgentConfig | None, str]:
        """Get full content of an agent.

        Args:
            project_id: Project identifier
            agent_id: Agent identifier

        Returns:
            Tuple of (AgentConfig, content) or (None, "")
        """
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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

    def copy_agent(self, source_project_id: str, agent_id: str, target_project_id: str) -> bool:
        """Copy an agent to another project.

        Args:
            source_project_id: Source project identifier
            agent_id: Agent identifier to copy
            target_project_id: Target project identifier

        Returns:
            True if copied successfully
        """
        source_path = self._discovery.find_project_path(source_project_id)
        target_path = self._discovery.find_project_path(target_project_id)

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
