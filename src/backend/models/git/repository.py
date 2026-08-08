"""Git 저장소 레지스트리 모델과 인메모리 스토리지.

GIT_REPOSITORIES 는 모듈 레벨 가변 상태다. 이 딕셔너리를 읽고 쓰는 함수 6종을
다른 모듈로 가르면 global 재바인딩으로 사본이 분열되므로 함께 둔다."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from utils.time import utcnow


class GitRepository(BaseModel):
    """Registered Git repository."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., description="Display name for the repository")
    path: str = Field(..., description="Filesystem path to the repository")
    description: str = ""
    is_valid: bool = False  # Whether path is a valid Git repo
    default_branch: str | None = None
    remote_url: str | None = None  # e.g., git@github.com:owner/repo.git
    created_at: datetime = Field(default_factory=utcnow)


class GitRepositoryCreate(BaseModel):
    """Request to register a Git repository."""

    name: str = Field(..., description="Display name for the repository")
    path: str = Field(..., description="Filesystem path to the repository")
    description: str = ""


class GitRepositoryUpdate(BaseModel):
    """Request to update a Git repository."""

    name: str | None = None
    description: str | None = None
    path: str | None = None


class GitRepositoryListResponse(BaseModel):
    """Response for Git repository list endpoint."""

    repositories: list[GitRepository]
    total: int


GIT_REPOSITORIES: dict[str, GitRepository] = {}


def register_git_repository(name: str, path: str, description: str = "") -> GitRepository:
    """Register a new Git repository."""
    from pathlib import Path

    from services.git_service import get_git_service

    # Normalize path
    normalized_path = str(Path(path).resolve())

    # Check if valid Git repo
    service = get_git_service(normalized_path)
    is_valid = service is not None
    default_branch = None
    remote_url = None

    if service:
        default_branch = service.current_branch
        # Try to get remote URL
        try:
            import subprocess

            result = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=normalized_path,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                remote_url = result.stdout.strip()
        except Exception:
            pass

    repo = GitRepository(
        name=name,
        path=normalized_path,
        description=description,
        is_valid=is_valid,
        default_branch=default_branch,
        remote_url=remote_url,
    )

    GIT_REPOSITORIES[repo.id] = repo
    return repo


def get_git_repository(repo_id: str) -> GitRepository | None:
    """Get a Git repository by ID."""
    return GIT_REPOSITORIES.get(repo_id)


def list_git_repositories() -> list[GitRepository]:
    """List all registered Git repositories."""
    return list(GIT_REPOSITORIES.values())


def update_git_repository(
    repo_id: str,
    name: str | None = None,
    description: str | None = None,
    path: str | None = None,
) -> GitRepository | None:
    """Update a Git repository."""
    from pathlib import Path

    from services.git_service import get_git_service

    repo = GIT_REPOSITORIES.get(repo_id)
    if not repo:
        return None

    if name is not None:
        repo.name = name
    if description is not None:
        repo.description = description
    if path is not None:
        normalized_path = str(Path(path).resolve())
        repo.path = normalized_path

        # Re-validate
        service = get_git_service(normalized_path)
        repo.is_valid = service is not None
        if service:
            repo.default_branch = service.current_branch

    return repo


def delete_git_repository(repo_id: str) -> bool:
    """Delete a Git repository."""
    if repo_id in GIT_REPOSITORIES:
        del GIT_REPOSITORIES[repo_id]
        return True
    return False


def sync_git_repositories_from_projects() -> int:
    """Re-populate GIT_REPOSITORIES from registered projects.

    Iterates the project registry and registers the effective git path of each
    project (git_path if set, otherwise project path) as a Git repository, but
    only when the path is a valid Git working tree and not already registered.

    Since GIT_REPOSITORIES is an in-memory dict, this should be invoked at
    backend startup so the registry survives process restarts.

    Returns:
        Number of repositories newly registered during this sync.
    """
    from pathlib import Path as _Path

    # Import here to avoid circular dependency at module load.
    from models.project import list_projects

    known_paths = {repo.path for repo in GIT_REPOSITORIES.values()}
    added = 0

    for project in list_projects():
        raw_path = project.git_path or project.path
        if not raw_path:
            continue

        try:
            normalized = str(_Path(raw_path).resolve())
        except (OSError, RuntimeError):
            continue

        if normalized in known_paths:
            continue
        if not (_Path(normalized) / ".git").exists():
            continue

        register_git_repository(
            name=project.name,
            path=normalized,
            description=project.description or "",
        )
        known_paths.add(normalized)
        added += 1

    return added
