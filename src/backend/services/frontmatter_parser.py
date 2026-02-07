"""YAML frontmatter parser for SKILL.md and agent .md files.

Parses YAML frontmatter between --- delimiters at the start of markdown files.
"""

import re
from typing import Any

import yaml


class FrontmatterParser:
    """Parse YAML frontmatter from markdown files."""

    # Pattern to match frontmatter: starts with ---, ends with ---
    FRONTMATTER_PATTERN = re.compile(
        r"^---\s*\n(.*?)\n---\s*\n",
        re.DOTALL,
    )

    @classmethod
    def parse(cls, content: str) -> tuple[dict[str, Any], str]:
        """Parse frontmatter and body from markdown content.

        Args:
            content: Full markdown file content

        Returns:
            Tuple of (frontmatter dict, body content)
        """
        match = cls.FRONTMATTER_PATTERN.match(content)
        if not match:
            return {}, content

        yaml_content = match.group(1)
        body = content[match.end() :]

        try:
            frontmatter = yaml.safe_load(yaml_content) or {}
        except yaml.YAMLError:
            frontmatter = {}

        return frontmatter, body

    @classmethod
    def parse_file(cls, file_path: str) -> tuple[dict[str, Any], str]:
        """Parse frontmatter from a file.

        Args:
            file_path: Path to the markdown file

        Returns:
            Tuple of (frontmatter dict, body content)
        """
        with open(file_path, encoding="utf-8") as f:
            content = f.read()
        return cls.parse(content)

    @classmethod
    def extract_tools(cls, frontmatter: dict[str, Any]) -> list[str]:
        """Extract tools list from frontmatter.

        Handles both string (comma-separated) and list formats.

        Args:
            frontmatter: Parsed frontmatter dict

        Returns:
            List of tool names
        """
        tools = frontmatter.get("tools", [])
        if isinstance(tools, str):
            # Handle comma-separated string: "read, grep, glob"
            return [t.strip() for t in tools.split(",") if t.strip()]
        elif isinstance(tools, list):
            return [str(t) for t in tools]
        return []

    @classmethod
    def get_string_field(cls, frontmatter: dict[str, Any], key: str, default: str = "") -> str:
        """Get string field from frontmatter with default.

        Args:
            frontmatter: Parsed frontmatter dict
            key: Field name to get
            default: Default value if not found

        Returns:
            String value or default
        """
        value = frontmatter.get(key)
        if value is None:
            return default
        return str(value)

    @classmethod
    def get_nested_dict(cls, frontmatter: dict[str, Any], key: str) -> dict[str, Any] | None:
        """Get nested dictionary field from frontmatter.

        Args:
            frontmatter: Parsed frontmatter dict
            key: Field name to get

        Returns:
            Dict value or None
        """
        value = frontmatter.get(key)
        if isinstance(value, dict):
            return value
        return None
