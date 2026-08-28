"""working_tree 관련 Git API 라우트.

작업 트리 상태(status·working-status·worktrees), 스테이징(add·unstage·
stage-hunks·file-diff·staged-diff·file-hunks·commit), 원격 동기화
(fetch·pull·push)를 한 모듈에 둔다. 계획은 800줄 초과 시 staging.py 와
sync.py 로 더 가르라고 하지만, 실측 결과 그 한도에 미치지 않는다.
"""

from fastapi import APIRouter, HTTPException, Query

from models.git import (
    AddRequest,
    AddResult,
    CommitCreateRequest,
    CommitCreateResult,
    # Remote operation models
    FetchResult,
    # Staging area enhancement models
    FileDiffResponse,
    FileHunksResponse,
    # Working directory models (NEW)
    GitWorkingStatus,
    # Worktree models
    GitWorktreeListResponse,
    PullResult,
    PushResult,
    StageHunksRequest,
    UnstageRequest,
)

from ._shared import get_effective_git_path, get_git_service_for_project, resolve_project

router = APIRouter()


# =============================================================================
# Project Git Status Endpoints
# =============================================================================

from pydantic import BaseModel


class GitStatusResponse(BaseModel):
    """Git status response for a project."""

    project_id: str
    git_enabled: bool
    git_path: str | None
    effective_git_path: str
    is_valid_repo: bool
    current_branch: str | None = None
    error: str | None = None


class GitPathUpdateRequest(BaseModel):
    """Request to update git path for a project."""

    git_path: str | None = None  # None to use project path


@router.get("/projects/{project_id}/status", response_model=GitStatusResponse)
async def get_project_git_status(project_id: str):
    """Get Git status for a project."""
    from services.git_service import get_git_service

    project = await resolve_project(project_id)

    effective_path = get_effective_git_path(project)
    service = get_git_service(effective_path)

    return GitStatusResponse(
        project_id=project_id,
        git_enabled=project.git_enabled,
        git_path=project.git_path,
        effective_git_path=effective_path,
        is_valid_repo=service is not None,
        current_branch=service.current_branch if service else None,
    )


@router.put("/projects/{project_id}/git-path", response_model=GitStatusResponse)
async def update_project_git_path(
    project_id: str,
    request: GitPathUpdateRequest,
):
    """Update Git path for a project."""
    from pathlib import Path

    from models.project import normalize_path, set_project_git_path
    from services.git_service import get_git_service

    project = await resolve_project(project_id)

    # Normalize and validate git_path
    git_path = request.git_path
    if git_path:
        git_path = normalize_path(git_path)
        if not Path(git_path).exists():
            raise HTTPException(status_code=400, detail=f"Path does not exist: {git_path}")
        if not Path(git_path).is_dir():
            raise HTTPException(status_code=400, detail=f"Path is not a directory: {git_path}")

    # Update project
    try:
        updated_project = set_project_git_path(project, git_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Get git service for the new path
    effective_path = get_effective_git_path(updated_project)
    service = get_git_service(effective_path)

    return GitStatusResponse(
        project_id=project_id,
        git_enabled=updated_project.git_enabled,
        git_path=updated_project.git_path,
        effective_git_path=effective_path,
        is_valid_repo=service is not None,
        current_branch=service.current_branch if service else None,
        error=None if service else "Path is not a valid Git repository",
    )


# =============================================================================
# Worktree Endpoints
# =============================================================================


@router.get("/projects/{project_id}/worktrees", response_model=GitWorktreeListResponse)
async def list_worktrees(project_id: str):
    """List all git worktrees for a project."""
    git_service = await get_git_service_for_project(project_id)
    worktrees = git_service.list_worktrees()
    return GitWorktreeListResponse(worktrees=worktrees, total=len(worktrees))


# =============================================================================
# Working Directory Endpoints (status, add, commit)
# =============================================================================


@router.get("/projects/{project_id}/working-status", response_model=GitWorkingStatus)
async def get_working_status(
    project_id: str,
    worktree_path: str | None = Query(None, description="Worktree path to target"),
):
    """Get working directory status (staged, unstaged, untracked files)."""
    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)
    return git_service.status()


@router.post("/projects/{project_id}/add", response_model=AddResult)
async def stage_files(
    project_id: str,
    request: AddRequest,
    worktree_path: str | None = Query(None, description="Worktree path to target"),
):
    """Stage files for commit (git add).

    - Empty paths with all=False: stages current directory (git add .)
    - all=True: stages all changes including deletions (git add -A)
    - Specific paths: stages only those files
    """
    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)
    result = git_service.add(paths=request.paths, all=request.all)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


@router.post("/projects/{project_id}/commit", response_model=CommitCreateResult)
async def create_commit(
    project_id: str,
    request: CommitCreateRequest,
    worktree_path: str | None = Query(None, description="Worktree path to target"),
):
    """Create a commit with staged changes.

    Requires files to be staged first using the add endpoint.
    """
    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)
    result = git_service.commit(
        message=request.message,
        author_name=request.author_name,
        author_email=request.author_email,
    )

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


# =============================================================================
# Staging Area Enhancement Endpoints
# =============================================================================


@router.post("/projects/{project_id}/unstage", response_model=AddResult)
async def unstage_files(
    project_id: str,
    request: UnstageRequest,
    worktree_path: str | None = Query(None, description="Worktree path to target"),
):
    """Unstage files (git reset HEAD).

    - Empty paths with all=False: unstage all files
    - all=True: unstage all files
    - Specific paths: unstage only those files
    """
    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)
    result = git_service.unstage(paths=request.paths or None, all=request.all)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


@router.get("/projects/{project_id}/file-diff", response_model=FileDiffResponse)
async def get_file_diff(
    project_id: str,
    file_path: str = Query(..., description="File path relative to repo root"),
    staged: bool = Query(False, description="Get staged diff instead of unstaged"),
    worktree_path: str | None = Query(None, description="Worktree path to target"),
):
    """Get diff for a single file."""
    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)
    try:
        return git_service.get_file_diff(file_path=file_path, staged=staged)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/staged-diff")
async def get_staged_diff(
    project_id: str,
    worktree_path: str | None = Query(None, description="Worktree path to target"),
):
    """Get the full staged diff (git diff --staged)."""
    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)
    try:
        diff = git_service.get_working_diff(staged_only=True)
        return {"diff": diff}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/file-hunks", response_model=FileHunksResponse)
async def get_file_hunks(
    project_id: str,
    file_path: str = Query(..., description="File path relative to repo root"),
    staged: bool = Query(False, description="Get staged hunks"),
    worktree_path: str | None = Query(None, description="Worktree path to target"),
):
    """Get diff hunks for a single file."""
    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)
    try:
        return git_service.get_file_hunks(file_path=file_path, staged=staged)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/projects/{project_id}/stage-hunks", response_model=AddResult)
async def stage_hunks(
    project_id: str,
    request: StageHunksRequest,
    worktree_path: str | None = Query(None, description="Worktree path to target"),
):
    """Stage specific hunks of a file."""
    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)
    result = git_service.stage_hunks(
        file_path=request.file_path,
        hunk_indices=request.hunk_indices,
    )

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


# =============================================================================
# Remote Operation Endpoints
# =============================================================================


@router.post("/projects/{project_id}/fetch", response_model=FetchResult)
async def fetch_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
):
    """Fetch from remote."""
    git_service = await get_git_service_for_project(project_id)
    result = git_service.fetch(remote=remote)
    return result


@router.post("/projects/{project_id}/pull", response_model=PullResult)
async def pull_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
    branch: str | None = Query(None, description="Branch to pull"),
):
    """Pull from remote."""
    git_service = await get_git_service_for_project(project_id)
    result = git_service.pull(remote=remote, branch=branch)
    return result


@router.post("/projects/{project_id}/push", response_model=PushResult)
async def push_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
    branch: str | None = Query(None, description="Branch to push"),
    set_upstream: bool = Query(False, description="Set upstream tracking"),
    worktree_path: str | None = Query(None, description="Worktree path to target"),
):
    """Push to remote."""
    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)
    result = git_service.push(remote=remote, branch=branch, set_upstream=set_upstream)
    return result
