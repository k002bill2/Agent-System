"""Rules management for Claude Code projects.

Handles CRUD operations and parsing for rule .md files
in both project-level (.claude/rules/) and global (~/.claude/rules/) directories.
"""

import logging
import shutil
from datetime import datetime
from pathlib import Path

from models.project_config import RuleConfig
from services.frontmatter_parser import FrontmatterParser
from services.project_discovery import ProjectDiscovery

logger = logging.getLogger(__name__)

GLOBAL_RULES_DIR = Path.home() / ".claude" / "rules"


class RulesManager:
    """Manages Claude Code rule configurations."""

    def __init__(self, discovery: ProjectDiscovery):
        self._discovery = discovery

    def get_project_rules(self, project_id: str) -> list[RuleConfig]:
        """Get project-level rules from .claude/rules/*.md."""
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            return []

        rules_dir = project_path / ".claude" / "rules"
        if not rules_dir.exists():
            return []

        return self._scan_rules_dir(rules_dir, project_id, is_global=False)

    def get_global_rules(self) -> list[RuleConfig]:
        """Get global rules from ~/.claude/rules/*.md."""
        if not GLOBAL_RULES_DIR.exists():
            return []

        return self._scan_rules_dir(GLOBAL_RULES_DIR, project_id="global", is_global=True)

    def _scan_rules_dir(
        self, rules_dir: Path, project_id: str, is_global: bool
    ) -> list[RuleConfig]:
        """Scan a directory for rule .md files."""
        rules = []
        for md_file in rules_dir.glob("*.md"):
            if not md_file.is_file() or md_file.name.startswith("."):
                continue

            try:
                rule = self._parse_rule(md_file, project_id, is_global)
                if rule:
                    rules.append(rule)
            except Exception as e:
                logger.error(f"Error parsing rule {md_file}: {e}")
                continue

        rules.sort(key=lambda r: r.name.lower())
        return rules

    def _parse_rule(self, rule_file: Path, project_id: str, is_global: bool) -> RuleConfig | None:
        """Parse a rule .md file.

        Handles files with and without YAML frontmatter.
        For files without frontmatter, derives name from filename
        and description from the first heading or paragraph.
        """
        frontmatter, body = FrontmatterParser.parse_file(str(rule_file))

        rule_id = rule_file.stem
        stat = rule_file.stat()

        # Name: from frontmatter or derived from filename
        name = ""
        if frontmatter:
            name = FrontmatterParser.get_string_field(frontmatter, "name", "")
        if not name:
            name = rule_id.replace("-", " ").replace("_", " ").title()

        # Description: from frontmatter or first meaningful line
        description = ""
        if frontmatter:
            description = FrontmatterParser.get_string_field(frontmatter, "description", "")
        if not description and body:
            for line in body.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                # Strip markdown heading markers
                if line.startswith("#"):
                    line = line.lstrip("#").strip()
                description = line[:200]
                break

        return RuleConfig(
            rule_id=rule_id,
            project_id=project_id,
            name=name,
            description=description,
            file_path=str(rule_file),
            is_global=is_global,
            modified_at=datetime.fromtimestamp(stat.st_mtime),
        )

    def get_rule_content(
        self, project_id: str, rule_id: str, is_global: bool = False
    ) -> tuple[RuleConfig | None, str]:
        """Get full content of a rule."""
        rule_file = self._resolve_rule_path(project_id, rule_id, is_global)
        if not rule_file or not rule_file.exists():
            return None, ""

        pid = "global" if is_global else project_id
        rule = self._parse_rule(rule_file, pid, is_global)
        if not rule:
            return None, ""

        content = rule_file.read_text(encoding="utf-8")
        return rule, content

    def create_rule(
        self, project_id: str, rule_id: str, content: str, is_global: bool = False
    ) -> RuleConfig | None:
        """Create a new rule."""
        if is_global:
            rules_dir = GLOBAL_RULES_DIR
        else:
            project_path = self._discovery.find_project_path(project_id)
            if not project_path:
                logger.error(f"Project not found: {project_id}")
                return None
            rules_dir = project_path / ".claude" / "rules"

        rules_dir.mkdir(parents=True, exist_ok=True)
        rule_file = rules_dir / f"{rule_id}.md"

        if rule_file.exists():
            logger.error(f"Rule already exists: {rule_id}")
            return None

        try:
            with open(rule_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")

            pid = "global" if is_global else project_id
            logger.info(f"Created rule {rule_id} (global={is_global})")
            return self._parse_rule(rule_file, pid, is_global)
        except OSError as e:
            logger.error(f"Error creating rule: {e}")
            return None

    def update_rule_content(
        self, project_id: str, rule_id: str, content: str, is_global: bool = False
    ) -> bool:
        """Update a rule's content."""
        rule_file = self._resolve_rule_path(project_id, rule_id, is_global)
        if not rule_file or not rule_file.exists():
            logger.error(f"Rule not found: {rule_id}")
            return False

        try:
            with open(rule_file, "w", encoding="utf-8") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")
            logger.info(f"Updated rule {rule_id} (global={is_global})")
            return True
        except OSError as e:
            logger.error(f"Error updating rule: {e}")
            return False

    def delete_rule(self, project_id: str, rule_id: str, is_global: bool = False) -> bool:
        """Delete a rule."""
        rule_file = self._resolve_rule_path(project_id, rule_id, is_global)
        if not rule_file or not rule_file.exists():
            logger.error(f"Rule not found: {rule_id}")
            return False

        try:
            rule_file.unlink()
            logger.info(f"Deleted rule {rule_id} (global={is_global})")
            return True
        except OSError as e:
            logger.error(f"Error deleting rule: {e}")
            return False

    def copy_rule(self, source_project_id: str, rule_id: str, target_project_id: str) -> bool:
        """Copy a rule to another project."""
        source_file = self._resolve_rule_path(source_project_id, rule_id, is_global=False)
        if not source_file or not source_file.exists():
            logger.error(f"Source rule not found: {rule_id}")
            return False

        target_path = self._discovery.find_project_path(target_project_id)
        if not target_path:
            logger.error(f"Target project not found: {target_project_id}")
            return False

        target_rules_dir = target_path / ".claude" / "rules"
        target_rules_dir.mkdir(parents=True, exist_ok=True)

        target_file = target_rules_dir / f"{rule_id}.md"
        if target_file.exists():
            suffix = 1
            while (target_rules_dir / f"{rule_id}-{suffix}.md").exists():
                suffix += 1
            target_file = target_rules_dir / f"{rule_id}-{suffix}.md"

        try:
            shutil.copy2(str(source_file), str(target_file))
            logger.info(f"Copied rule {rule_id} to {target_project_id}")
            return True
        except OSError as e:
            logger.error(f"Error copying rule: {e}")
            return False

    def count_rules(self, project_id: str) -> int:
        """Count project-level rules."""
        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            return 0

        rules_dir = project_path / ".claude" / "rules"
        if not rules_dir.exists():
            return 0

        return sum(1 for f in rules_dir.glob("*.md") if f.is_file())

    def _resolve_rule_path(self, project_id: str, rule_id: str, is_global: bool) -> Path | None:
        """Resolve the filesystem path for a rule."""
        if is_global:
            return GLOBAL_RULES_DIR / f"{rule_id}.md"

        project_path = self._discovery.find_project_path(project_id)
        if not project_path:
            return None

        return project_path / ".claude" / "rules" / f"{rule_id}.md"
