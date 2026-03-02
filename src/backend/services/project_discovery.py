"""Project discovery and path management.

Discovers Claude Code projects from filesystem, manages monitored project paths,
and scans projects for configuration metadata.
"""

import json
import logging
import os
from datetime import datetime
from pathlib import Path

from models.project_config import ProjectInfo
from utils.time import utcnow

logger = logging.getLogger(__name__)


class ProjectDiscovery:
    """Discovers and manages Claude Code project paths."""

    def __init__(
        self,
        project_paths: list[str] | None = None,
        include_current: bool = True,
    ):
        """Initialize the discovery service.

        Args:
            project_paths: List of project root paths to monitor
            include_current: Whether to include current working directory
        """
        self._project_paths: list[Path] = []
        self._external_paths: list[str] = []
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

    @property
    def project_paths(self) -> list[Path]:
        """Access to internal project paths list."""
        return self._project_paths

    @property
    def is_docker(self) -> bool:
        """Whether running in Docker environment."""
        return self._is_docker

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

        # Cache clearing is handled by the monitor

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

        logger.info(f"Removed project from monitoring: {target}")
        return True

    def get_external_paths(self) -> list[str]:
        """Get list of runtime-added external paths."""
        return self._external_paths.copy()

    def get_monitored_paths(self) -> list[str]:
        """Get all monitored project paths."""
        return [str(p) for p in self._project_paths]

    def encode_path(self, path: Path) -> str:
        """Encode path to project ID.

        Converts /Users/user/Work/Project to -Users-user-Work-Project
        """
        return str(path).replace("/", "-").replace("\\", "-")

    def decode_path(self, project_id: str) -> str:
        """Decode project ID back to path (lossy for Windows paths)."""
        # Best effort - may not be exact on Windows
        if project_id.startswith("-"):
            return "/" + project_id[1:].replace("-", "/")
        return project_id.replace("-", "/")

    def refresh_project_paths(self) -> None:
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
        self.refresh_project_paths()

        projects = []

        for project_path in self._project_paths:
            try:
                project_info = self.scan_project(project_path)
                if project_info:
                    projects.append(project_info)
            except Exception as e:
                logger.error(f"Error scanning project {project_path}: {e}")
                continue

        # Sort by project name
        projects.sort(key=lambda p: p.project_name.lower())
        return projects

    def scan_project(self, project_path: Path) -> ProjectInfo | None:
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

        project_id = self.encode_path(project_path)
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
                last_modified=utcnow(),
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
            # Count only direct .md files (glob("*.md") does not recurse into subdirectories)
            agent_count = sum(
                1 for f in agents_dir.glob("*.md") if f.is_file() and not f.name.startswith(".")
            )
            # Add shared agents count
            shared_dir = agents_dir / "shared"
            if shared_dir.exists():
                agent_count += sum(1 for f in shared_dir.glob("*.md") if f.is_file())

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
        last_modified = utcnow()
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

    def find_project_path(self, project_id: str) -> Path | None:
        """Find project path by ID.

        Args:
            project_id: Project identifier

        Returns:
            Path to project or None
        """
        for project_path in self._project_paths:
            if self.encode_path(project_path) == project_id:
                return project_path
        return None
