"""Git API 모듈들이 공유하는 의존성.

`_legacy.py` 분할 과정에서 여러 모듈이 함께 쓰게 된 이름을 여기로 승격한다.
순환 import 를 막기 위해 이 모듈은 형제 모듈(`._legacy` 포함)을 import 하지
않는다 — 의존은 항상 한 방향(형제 → `_shared`)이다.
"""

from fastapi import HTTPException

from models.project import get_project


def get_github_service():
    """Get GitHubService instance."""
    from services.github_service import get_github_service as factory

    service = factory()
    if not service:
        raise HTTPException(
            status_code=503,
            detail="GitHub service not available. Check GITHUB_TOKEN environment variable.",
        )

    return service


def get_effective_git_path(project) -> str:
    """Get the effective Git path for a project."""
    return project.git_path or project.path


def get_git_service_for_project(project_id: str, worktree_path: str | None = None):
    """Get GitService for a project, optionally targeting a specific worktree.

    Args:
        project_id: Project identifier
        worktree_path: Optional worktree path. Validated against actual worktree list.
    """
    from pathlib import Path

    from services.git_service import get_git_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    git_path = get_effective_git_path(project)
    service = get_git_service(git_path)
    if not service:
        raise HTTPException(
            status_code=400, detail=f"Project '{project_id}' is not a Git repository"
        )

    if worktree_path:
        # Security: validate worktree_path against actual worktree list
        resolved_requested = str(Path(worktree_path).resolve())
        valid_paths = {str(Path(wt.path).resolve()) for wt in service.list_worktrees()}
        if resolved_requested not in valid_paths:
            raise HTTPException(
                status_code=403,
                detail="Invalid worktree path: not a registered worktree",
            )
        # Return a GitService instance pointing to the worktree
        wt_service = get_git_service(resolved_requested)
        if not wt_service:
            raise HTTPException(
                status_code=400,
                detail="Worktree path is not a valid Git working directory",
            )
        return wt_service

    return service
