"""Memory management for Claude Code projects.

Handles CRUD operations and parsing for memory .md files
stored in ~/.claude/projects/{encoded_path}/memory/.
"""

import logging
from datetime import datetime
from pathlib import Path

from models.project_config import MemoryConfig
from services.frontmatter_parser import FrontmatterParser
from services.project_discovery import ProjectDiscovery

logger = logging.getLogger(__name__)


class MemoryManager:
    """Manages Claude Code memory entries."""

    def __init__(self, discovery: ProjectDiscovery):
        self._discovery = discovery

    def _get_memory_dir(self, project_id: str) -> Path | None:
        """Resolve memory directory for a project.

        Memory is stored at ~/.claude/projects/{encoded_path}/memory/
        not inside the project's .claude/ directory.
        """
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            return None

        encoded = self._discovery.encode_path(project_path)
        memory_dir = Path.home() / ".claude" / "projects" / encoded / "memory"
        return memory_dir if memory_dir.exists() else None

    def _get_or_create_memory_dir(self, project_id: str) -> Path | None:
        """Resolve memory directory, creating it if needed."""
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            return None

        encoded = self._discovery.encode_path(project_path)
        memory_dir = Path.home() / ".claude" / "projects" / encoded / "memory"
        memory_dir.mkdir(parents=True, exist_ok=True)
        return memory_dir

    def get_project_memories(self, project_id: str) -> list[MemoryConfig]:
        """Get all memory entries for a project (excludes MEMORY.md index)."""
        memory_dir = self._get_memory_dir(project_id)
        if not memory_dir:
            return []

        memories = []
        for md_file in memory_dir.glob("*.md"):
            if not md_file.is_file() or md_file.name == "MEMORY.md":
                continue

            try:
                memory = self._parse_memory(md_file, project_id)
                if memory:
                    memories.append(memory)
            except Exception as e:
                logger.error(f"Error parsing memory {md_file}: {e}")
                continue

        memories.sort(key=lambda m: m.name.lower())
        return memories

    def _parse_memory(self, memory_file: Path, project_id: str) -> MemoryConfig | None:
        """Parse a memory .md file with frontmatter."""
        frontmatter, _body = FrontmatterParser.parse_file(str(memory_file))

        memory_id = memory_file.stem
        stat = memory_file.stat()

        name = FrontmatterParser.get_string_field(frontmatter, "name", "") if frontmatter else ""
        if not name:
            name = memory_id.replace("-", " ").replace("_", " ").title()

        description = FrontmatterParser.get_string_field(frontmatter, "description", "") if frontmatter else ""

        memory_type = FrontmatterParser.get_string_field(frontmatter, "type", "user") if frontmatter else "user"

        return MemoryConfig(
            memory_id=memory_id,
            project_id=project_id,
            name=name,
            description=description,
            file_path=str(memory_file),
            memory_type=memory_type,
            modified_at=datetime.fromtimestamp(stat.st_mtime),
        )

    def get_memory_content(
        self, project_id: str, memory_id: str
    ) -> tuple[MemoryConfig | None, str]:
        """Get full content of a memory entry."""
        memory_dir = self._get_memory_dir(project_id)
        if not memory_dir:
            return None, ""

        memory_file = memory_dir / f"{memory_id}.md"
        if not memory_file.exists():
            return None, ""

        memory = self._parse_memory(memory_file, project_id)
        if not memory:
            return None, ""

        content = memory_file.read_text(encoding="utf-8")
        return memory, content

    def get_memory_index(self, project_id: str) -> str:
        """Get MEMORY.md index content."""
        memory_dir = self._get_memory_dir(project_id)
        if not memory_dir:
            return ""

        index_file = memory_dir / "MEMORY.md"
        if not index_file.exists():
            return ""

        return index_file.read_text(encoding="utf-8")

    def update_memory_index(self, project_id: str, content: str) -> bool:
        """Update MEMORY.md index content."""
        memory_dir = self._get_or_create_memory_dir(project_id)
        if not memory_dir:
            return False

        index_file = memory_dir / "MEMORY.md"
        try:
            with open(index_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")
            logger.info(f"Updated memory index for project {project_id}")
            return True
        except OSError as e:
            logger.error(f"Error updating memory index: {e}")
            return False

    def create_memory(
        self, project_id: str, memory_id: str, content: str
    ) -> MemoryConfig | None:
        """Create a new memory entry."""
        memory_dir = self._get_or_create_memory_dir(project_id)
        if not memory_dir:
            logger.error(f"Cannot resolve memory dir for project {project_id}")
            return None

        memory_file = memory_dir / f"{memory_id}.md"
        if memory_file.exists():
            logger.error(f"Memory already exists: {memory_id}")
            return None

        try:
            with open(memory_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")

            logger.info(f"Created memory {memory_id} for project {project_id}")
            return self._parse_memory(memory_file, project_id)
        except OSError as e:
            logger.error(f"Error creating memory: {e}")
            return None

    def update_memory_content(
        self, project_id: str, memory_id: str, content: str
    ) -> bool:
        """Update a memory entry's content."""
        memory_dir = self._get_memory_dir(project_id)
        if not memory_dir:
            return False

        memory_file = memory_dir / f"{memory_id}.md"
        if not memory_file.exists():
            logger.error(f"Memory not found: {memory_id}")
            return False

        try:
            with open(memory_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")
            logger.info(f"Updated memory {memory_id} for project {project_id}")
            return True
        except OSError as e:
            logger.error(f"Error updating memory: {e}")
            return False

    def delete_memory(self, project_id: str, memory_id: str) -> bool:
        """Delete a memory entry."""
        memory_dir = self._get_memory_dir(project_id)
        if not memory_dir:
            return False

        memory_file = memory_dir / f"{memory_id}.md"
        if not memory_file.exists():
            logger.error(f"Memory not found: {memory_id}")
            return False

        try:
            memory_file.unlink()
            logger.info(f"Deleted memory {memory_id} from project {project_id}")
            return True
        except OSError as e:
            logger.error(f"Error deleting memory: {e}")
            return False

    def count_memories(self, project_id: str) -> int:
        """Count memory entries (excluding MEMORY.md)."""
        memory_dir = self._get_memory_dir(project_id)
        if not memory_dir:
            return 0

        return sum(
            1
            for f in memory_dir.glob("*.md")
            if f.is_file() and f.name != "MEMORY.md"
        )
