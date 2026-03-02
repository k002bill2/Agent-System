"""Skill management for Claude Code projects.

Handles CRUD operations and parsing for SKILL.md files
within .claude/skills/ directories.
"""

import logging
import shutil
from datetime import datetime
from pathlib import Path

from models.project_config import SkillConfig
from services.frontmatter_parser import FrontmatterParser
from services.project_discovery import ProjectDiscovery

logger = logging.getLogger(__name__)


class SkillManager:
    """Manages Claude Code skill configurations."""

    def __init__(self, discovery: ProjectDiscovery):
        """Initialize with a ProjectDiscovery instance.

        Args:
            discovery: ProjectDiscovery for path resolution
        """
        self._discovery = discovery

    def get_all_skills(self) -> list[SkillConfig]:
        """Get all skills from all monitored projects.

        Returns:
            List of SkillConfig across all projects
        """
        all_skills = []
        for project_path in self._discovery.project_paths:
            skills = self.get_project_skills(self._discovery.encode_path(project_path))
            all_skills.extend(skills)
        return all_skills

    def get_project_skills(self, project_id: str) -> list[SkillConfig]:
        """Get all skills for a specific project.

        Args:
            project_id: Project identifier

        Returns:
            List of SkillConfig for the project
        """
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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

    def update_skill_content(self, project_id: str, skill_id: str, content: str) -> bool:
        """Update skill SKILL.md content.

        Args:
            project_id: Project identifier
            skill_id: Skill identifier (directory name)
            content: New SKILL.md content

        Returns:
            True if updated successfully
        """
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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
        project_path = self._discovery.find_project_path(project_id)
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

    def copy_skill(self, source_project_id: str, skill_id: str, target_project_id: str) -> bool:
        """Copy a skill to another project.

        Args:
            source_project_id: Source project identifier
            skill_id: Skill identifier to copy
            target_project_id: Target project identifier

        Returns:
            True if copied successfully
        """
        source_path = self._discovery.find_project_path(source_project_id)
        target_path = self._discovery.find_project_path(target_project_id)

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
