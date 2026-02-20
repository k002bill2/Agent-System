"""Project model for context-aware orchestration."""

import json
import logging
import re
from pathlib import Path

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Metadata file name stored in project root
AOS_METADATA_FILE = ".aos-project.json"


def normalize_path(path: str) -> str:
    """Normalize filesystem path by removing shell escape characters.

    When users copy paths from terminal, they may include shell escape characters
    like backslashes before spaces or special characters:
    - "Mobile\\ Documents" -> "Mobile Documents"
    - "iCloud\\~md\\~obsidian" -> "iCloud~md~obsidian"

    Args:
        path: Path string potentially containing shell escapes

    Returns:
        Normalized path without escape characters
    """
    if not path:
        return path

    # Remove backslash escapes (\ followed by space, ~, or other chars)
    # Pattern: backslash followed by a character that would be escaped in shell
    normalized = re.sub(r"\\(.)", r"\1", path)

    return normalized


class Project(BaseModel):
    """Project configuration."""

    id: str
    name: str
    path: str
    description: str = ""
    claude_md: str | None = None
    vector_store_initialized: bool = False
    indexed_at: str | None = None  # ISO timestamp of last indexing
    git_path: str | None = None  # Separate Git repository path (if different from project path)
    git_enabled: bool = False  # Whether Git is configured for this project
    sort_order: int = 0  # Display order (lower numbers first)
    organization_id: str | None = None  # Organization this project belongs to

    @classmethod
    def from_path(cls, project_id: str, project_path: str) -> "Project":
        """Create project from filesystem path."""
        path = Path(project_path)

        # Load CLAUDE.md if exists
        claude_md_path = path / "CLAUDE.md"
        claude_md = None
        if claude_md_path.exists():
            claude_md = claude_md_path.read_text(encoding="utf-8")

        # Try to get name from package.json or use folder name
        name = path.name
        description = ""
        git_path = None

        package_json = path / "package.json"
        if package_json.exists():
            try:
                pkg = json.loads(package_json.read_text())
                # Note: pkg "name" is npm package name, NOT project display name
                # Only use description as fallback
                description = pkg.get("description", "")
            except json.JSONDecodeError:
                pass

        # Load saved metadata from .aos-project.json (takes priority)
        metadata = _load_project_metadata(path)
        sort_order = 0
        organization_id = None
        if metadata:
            name = metadata.get("name", name)
            description = metadata.get("description", description)
            git_path = metadata.get("git_path")
            sort_order = metadata.get("sort_order", 0)
            organization_id = metadata.get("organization_id")

        # Determine effective Git path and check if it's a valid repo
        effective_git_path = git_path or str(path.resolve())
        git_enabled = _check_git_repository(effective_git_path)

        return cls(
            id=project_id,
            name=name,
            path=str(path.resolve()),
            description=description,
            claude_md=claude_md,
            git_path=git_path,
            git_enabled=git_enabled,
            sort_order=sort_order,
            organization_id=organization_id,
        )


class ProjectCreate(BaseModel):
    """Project registration request."""

    id: str = Field(..., description="Unique project identifier")
    path: str = Field(..., description="Filesystem path to project")
    organization_id: str | None = Field(None, description="Organization ID")


class ProjectResponse(BaseModel):
    """Project API response."""

    id: str
    name: str
    path: str
    description: str
    has_claude_md: bool
    vector_store_initialized: bool = False
    indexed_at: str | None = None
    git_path: str | None = None
    git_enabled: bool = False
    sort_order: int = 0
    organization_id: str | None = None
    is_active: bool = True


class ProjectUpdate(BaseModel):
    """Project update request."""

    name: str | None = None
    description: str | None = None
    path: str | None = None  # 프로젝트 경로 수정
    git_path: str | None = None  # Git 저장소 경로 설정


class ProjectLinkRequest(BaseModel):
    """Request to link an external project via symlink."""

    id: str = Field(..., description="Unique project identifier")
    source_path: str = Field(..., description="Absolute path to source project")


class ProjectCreateFromTemplate(BaseModel):
    """Request to create a new project from template."""

    id: str = Field(..., description="Unique project identifier")
    name: str = Field(..., description="Project display name")
    description: str = ""
    template: str = Field(
        "default", description="Template name: default, react-native, python, fastapi"
    )


# ========================================
# DB-managed Project Models (for projects table)
# ========================================


class DBProjectCreate(BaseModel):
    """Request to create a DB-managed project."""

    name: str = Field(..., description="Unique project name", min_length=1, max_length=255)
    description: str | None = Field(None, description="Project description")
    path: str | None = Field(None, description="Filesystem path for config scanning")
    settings: dict | None = Field(None, description="Extra settings (JSON)")
    organization_id: str | None = Field(None, description="조직 ID (자동 감지 또는 명시)")


class DBProjectUpdate(BaseModel):
    """Request to update a DB-managed project."""

    name: str | None = Field(None, description="Project name", max_length=255)
    description: str | None = Field(None, description="Project description")
    path: str | None = Field(None, description="Filesystem path for config scanning")
    settings: dict | None = Field(None, description="Extra settings (JSON)")


class DBProjectResponse(BaseModel):
    """Response for a DB-managed project."""

    id: str
    name: str
    slug: str
    description: str | None = None
    path: str | None = None
    is_active: bool = True
    settings: dict = Field(default_factory=dict)
    organization_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    created_by: str | None = None


class DBProjectListResponse(BaseModel):
    """Response for projects list."""

    projects: list[DBProjectResponse]
    total_count: int


# ========================================
# Project Member Models
# ========================================


class ProjectMemberAdd(BaseModel):
    """Request to add a member to a project."""

    user_id: str = Field(..., description="User UUID to add")
    role: str = Field("viewer", description="Role: owner, editor, viewer")


class ProjectMemberUpdate(BaseModel):
    """Request to update a member's role."""

    role: str = Field(..., description="New role: owner, editor, viewer")


class ProjectMemberResponse(BaseModel):
    """Single project member response."""

    user_id: str
    role: str
    email: str | None = None
    name: str | None = None
    granted_by: str | None = None
    created_at: str | None = None


class ProjectMemberListResponse(BaseModel):
    """Response for project members list."""

    members: list[ProjectMemberResponse]
    total_count: int


class OrgMemberForProject(BaseModel):
    """조직 멤버 중 프로젝트에 추가 가능한 사람."""

    user_id: str
    email: str
    name: str | None = None
    org_role: str  # owner, admin, member, viewer


class OrgMemberListResponse(BaseModel):
    """Available org members response."""

    members: list[OrgMemberForProject]
    total_count: int


# Registry of known projects
PROJECTS_REGISTRY: dict[str, Project] = {}


def register_project(project_id: str, project_path: str) -> Project:
    """Register a project in the registry."""
    # Normalize path to remove shell escape characters
    project_path = normalize_path(project_path)
    project = Project.from_path(project_id, project_path)
    PROJECTS_REGISTRY[project_id] = project
    return project


def get_project(project_id: str) -> Project | None:
    """Get project from registry."""
    return PROJECTS_REGISTRY.get(project_id)


def list_projects() -> list[Project]:
    """List all registered projects, sorted by sort_order."""
    projects = list(PROJECTS_REGISTRY.values())
    return sorted(projects, key=lambda p: (p.sort_order, p.name.lower()))


def unregister_project(project_id: str) -> bool:
    """Remove a project from the registry."""
    if project_id in PROJECTS_REGISTRY:
        del PROJECTS_REGISTRY[project_id]
        return True
    return False


def get_projects_dir() -> Path:
    """Get the projects directory path."""
    base_path = Path(__file__).parent.parent.parent.parent
    return base_path / "projects"


def _load_project_metadata(project_path: Path) -> dict | None:
    """Load project metadata from .aos-project.json if exists."""
    metadata_file = project_path / AOS_METADATA_FILE
    if metadata_file.exists():
        try:
            return json.loads(metadata_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to load project metadata from {metadata_file}: {e}")
    return None


def _save_project_metadata(
    project_path: Path,
    name: str,
    description: str,
    git_path: str | None = None,
    sort_order: int | None = None,
    organization_id: str | None = None,
) -> bool:
    """Save project metadata to .aos-project.json."""
    metadata_file = project_path / AOS_METADATA_FILE
    try:
        # Load existing metadata first to preserve other fields
        existing = _load_project_metadata(project_path) or {}
        metadata = {"name": name, "description": description}
        if git_path:
            metadata["git_path"] = git_path
        if sort_order is not None:
            metadata["sort_order"] = sort_order
        elif "sort_order" in existing:
            metadata["sort_order"] = existing["sort_order"]
        if organization_id is not None:
            metadata["organization_id"] = organization_id
        elif "organization_id" in existing:
            metadata["organization_id"] = existing["organization_id"]
        metadata_file.write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        logger.info(f"Saved project metadata to {metadata_file}")
        return True
    except OSError as e:
        logger.error(f"Failed to save project metadata to {metadata_file}: {e}")
        return False


def _check_git_repository(path: str) -> bool:
    """Check if a path is a valid Git repository."""
    git_dir = Path(path) / ".git"
    return git_dir.exists() and git_dir.is_dir()


def update_project(
    project_id: str,
    name: str | None = None,
    description: str | None = None,
    path: str | None = None,
    git_path: str | None = None,
) -> Project | None:
    """Update project metadata and optionally update path/symlink."""
    import os

    project = PROJECTS_REGISTRY.get(project_id)
    if not project:
        return None

    metadata_changed = False
    if name is not None:
        project.name = name
        metadata_changed = True
    if description is not None:
        project.description = description
        metadata_changed = True
    if git_path is not None:
        # Normalize and validate git_path
        git_path = normalize_path(git_path)
        if git_path and not Path(git_path).exists():
            raise ValueError(f"Git path does not exist: {git_path}")
        project.git_path = git_path if git_path else None
        # Update git_enabled based on new path
        effective_git_path = project.git_path or project.path
        project.git_enabled = _check_git_repository(effective_git_path)
        metadata_changed = True

    # Save metadata to file for persistence
    if metadata_changed:
        _save_project_metadata(
            Path(project.path), project.name, project.description, project.git_path
        )

    # 경로 변경 처리
    if path is not None:
        # Normalize path to remove shell escape characters (e.g., "Mobile\ Documents" -> "Mobile Documents")
        path = normalize_path(path)

        if path != project.path:
            new_path = Path(path)
            if not new_path.exists():
                raise ValueError(f"Path does not exist: {path}")

            # projects/ 디렉토리의 심볼릭 링크 업데이트
            projects_dir = get_projects_dir()
            symlink_path = projects_dir / project_id

            if symlink_path.is_symlink():
                # 기존 심볼릭 링크 제거 후 새로 생성
                symlink_path.unlink()
                os.symlink(str(new_path.resolve()), str(symlink_path))
            elif symlink_path.exists():
                # 심볼릭 링크가 아닌 실제 디렉토리인 경우 (드문 케이스)
                # 경로만 업데이트하고 파일시스템은 수정하지 않음
                pass

            project.path = str(new_path.resolve())

            # CLAUDE.md 다시 로드
            claude_md_path = new_path / "CLAUDE.md"
            if claude_md_path.exists():
                project.claude_md = claude_md_path.read_text(encoding="utf-8")
            else:
                project.claude_md = None

    return project


def update_project_sort_order(project_id: str, sort_order: int) -> Project | None:
    """Update a project's sort order."""
    project = PROJECTS_REGISTRY.get(project_id)
    if not project:
        return None

    project.sort_order = sort_order

    # Save to metadata file
    _save_project_metadata(
        Path(project.path), project.name, project.description, project.git_path, sort_order
    )

    return project


def reorder_projects(project_ids: list[str]) -> list[Project]:
    """
    Reorder all projects based on the provided list of IDs.

    Args:
        project_ids: List of project IDs in the desired order

    Returns:
        List of updated projects in the new order
    """
    updated_projects = []

    for index, project_id in enumerate(project_ids):
        project = update_project_sort_order(project_id, index)
        if project:
            updated_projects.append(project)

    return updated_projects


# Auto-register projects from projects/ directory
def init_projects(base_path: str = None):
    """Initialize projects from projects/ directory."""
    if base_path is None:
        # Default to Agent System root
        base_path = Path(__file__).parent.parent.parent.parent

    projects_dir = Path(base_path) / "projects"
    if projects_dir.exists():
        for item in projects_dir.iterdir():
            if item.is_dir() or item.is_symlink():
                # Resolve symlinks
                real_path = item.resolve()
                if real_path.is_dir():
                    register_project(item.name, str(real_path))
