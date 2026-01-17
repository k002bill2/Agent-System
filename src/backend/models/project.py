"""Project model for context-aware orchestration."""

from pathlib import Path
from pydantic import BaseModel, Field


class Project(BaseModel):
    """Project configuration."""

    id: str
    name: str
    path: str
    description: str = ""
    claude_md: str | None = None
    vector_store_initialized: bool = False
    indexed_at: str | None = None  # ISO timestamp of last indexing

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

        package_json = path / "package.json"
        if package_json.exists():
            import json
            try:
                pkg = json.loads(package_json.read_text())
                name = pkg.get("name", name)
                description = pkg.get("description", "")
            except json.JSONDecodeError:
                pass

        return cls(
            id=project_id,
            name=name,
            path=str(path.resolve()),
            description=description,
            claude_md=claude_md,
        )


class ProjectCreate(BaseModel):
    """Project registration request."""

    id: str = Field(..., description="Unique project identifier")
    path: str = Field(..., description="Filesystem path to project")


class ProjectResponse(BaseModel):
    """Project API response."""

    id: str
    name: str
    path: str
    description: str
    has_claude_md: bool
    vector_store_initialized: bool = False
    indexed_at: str | None = None


class ProjectUpdate(BaseModel):
    """Project update request."""

    name: str | None = None
    description: str | None = None
    path: str | None = None  # 프로젝트 경로 수정


class ProjectLinkRequest(BaseModel):
    """Request to link an external project via symlink."""

    id: str = Field(..., description="Unique project identifier")
    source_path: str = Field(..., description="Absolute path to source project")


class ProjectCreateFromTemplate(BaseModel):
    """Request to create a new project from template."""

    id: str = Field(..., description="Unique project identifier")
    name: str = Field(..., description="Project display name")
    description: str = ""
    template: str = Field("default", description="Template name: default, react-native, python, fastapi")


# Registry of known projects
PROJECTS_REGISTRY: dict[str, Project] = {}


def register_project(project_id: str, project_path: str) -> Project:
    """Register a project in the registry."""
    project = Project.from_path(project_id, project_path)
    PROJECTS_REGISTRY[project_id] = project
    return project


def get_project(project_id: str) -> Project | None:
    """Get project from registry."""
    return PROJECTS_REGISTRY.get(project_id)


def list_projects() -> list[Project]:
    """List all registered projects."""
    return list(PROJECTS_REGISTRY.values())


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


def update_project(
    project_id: str,
    name: str | None = None,
    description: str | None = None,
    path: str | None = None
) -> Project | None:
    """Update project metadata and optionally update path/symlink."""
    import os
    import shutil

    project = PROJECTS_REGISTRY.get(project_id)
    if not project:
        return None

    if name is not None:
        project.name = name
    if description is not None:
        project.description = description

    # 경로 변경 처리
    if path is not None and path != project.path:
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
