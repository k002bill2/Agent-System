"""Git API 모듈들이 공유하는 의존성.

`_legacy.py` 분할 과정에서 여러 모듈이 함께 쓰게 된 이름을 여기로 승격한다.
순환 import 를 막기 위해 이 모듈은 형제 모듈(`._legacy` 포함)을 import 하지
않는다 — 의존은 항상 한 방향(형제 → `_shared`)이다.
"""

import os

from fastapi import Depends, HTTPException, Request

from api.deps import get_current_user, get_db_session, require_project_role
from db.models import ProjectModel, UserModel
from models.project import get_project

# =============================================================================
# Authorization
# =============================================================================

# 읽기는 viewer, 그 외(생성·삭제·checkout·merge·remote 조작)는 editor.
# `api/project_configs/access.py` 의 filesystem 분기와 같은 규칙이다.
_READ_METHODS = {"GET", "HEAD", "OPTIONS"}


async def require_git_project_access(
    request: Request,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db_session),
) -> UserModel:
    """Authenticate every git route, and authorize the project-scoped ones.

    Mounted on the package router so no route can be added without a gate.

    `project_id` here is the in-memory registry key (a path-derived string such
    as ``-Users-me-work-repo``), while `require_project_role` looks projects up
    by ``ProjectModel.id`` (a UUID). Rather than translating between the two ID
    spaces, this joins on the one field both sides agree on: the filesystem
    path. The registry entry carries it, and so does the DB row.

    Routes without a `project_id` (the ``/github/...`` family) get
    authentication only -- there is no project to authorize against.
    """
    project_id = request.path_params.get("project_id")
    if project_id is None:
        return current_user

    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    min_role = "viewer" if request.method in _READ_METHODS else "editor"

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        # Memory mode: the registry key is the project identity everywhere.
        await require_project_role(project_id, current_user, db, min_role=min_role)
        return current_user

    from sqlalchemy import select

    result = await db.execute(
        select(ProjectModel).where(
            ProjectModel.is_active == True,  # noqa: E712
            ProjectModel.path == project.path,
        )
    )
    registered = result.scalars().first()
    if registered is None:
        # In database mode the DB registry is the authority on which projects
        # exist. A path that is only on disk is not a project here -- this is
        # the gap `7ed7c46` opened when it let filesystem discovery populate
        # the registry in database mode.
        raise HTTPException(status_code=404, detail="Project not found")

    await require_project_role(str(registered.id), current_user, db, min_role=min_role)
    return current_user


# =============================================================================
# Service Factories & Path Helpers
# =============================================================================


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


def get_mr_service_for_project(project_id: str, db_session=None):
    """Get MergeRequestService for a project."""
    from services.merge_service import MergeRequestService, get_merge_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    git_path = get_effective_git_path(project)
    merge_service = get_merge_service(git_path)
    return MergeRequestService(project_id, merge_service, db_session=db_session)


# =============================================================================
# DB Session
# =============================================================================


async def _get_db_session():
    """Get optional DB session (returns None if DB not configured)."""
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return None
    try:
        from db.database import async_session_factory

        return async_session_factory()
    except Exception:
        return None
