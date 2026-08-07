"""Git API endpoints for team collaboration management."""

import logging

from fastapi import APIRouter, HTTPException, Query

from models.git import (
    AddRequest,
    AddResult,
    CommitCreateRequest,
    CommitCreateResult,
    ConflictFile,
    # Conflict resolution models
    ConflictResolutionRequest,
    ConflictResolutionResult,
    # Remote operation models
    FetchResult,
    # Staging area enhancement models
    FileDiffResponse,
    FileHunksResponse,
    # Working directory models (NEW)
    GitWorkingStatus,
    # Worktree models
    GitWorktreeListResponse,
    MergeAbortResult,
    MergeExecuteRequest,
    # Merge models
    MergePreview,
    # Merge Request models
    MergeRequest,
    MergeRequestCreate,
    MergeRequestListResponse,
    MergeRequestStatus,
    MergeRequestUpdate,
    MergeResult,
    PullResult,
    PushResult,
    StageHunksRequest,
    ThreeWayDiff,
    UnstageRequest,
    # Permission helpers
    can_merge_to_branch,
)
from models.project import get_project

from ._shared import (
    _get_db_session,
    get_effective_git_path,
    get_git_service_for_project,
    get_mr_service_for_project,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/git", tags=["git"])


# =============================================================================
# Dependencies
# =============================================================================


def get_merge_service_for_project(project_id: str):
    """Get MergeService for a project."""
    from services.merge_service import get_merge_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    git_path = get_effective_git_path(project)
    service = get_merge_service(git_path)
    if not service:
        raise HTTPException(
            status_code=400, detail=f"Project '{project_id}' is not a Git repository"
        )

    return service


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

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

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

    from models.project import normalize_path, update_project
    from services.git_service import get_git_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

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
        updated_project = update_project(project_id, git_path=git_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not updated_project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

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
    git_service = get_git_service_for_project(project_id)
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
    git_service = get_git_service_for_project(project_id, worktree_path=worktree_path)
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
    git_service = get_git_service_for_project(project_id, worktree_path=worktree_path)
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
    git_service = get_git_service_for_project(project_id, worktree_path=worktree_path)
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
    git_service = get_git_service_for_project(project_id, worktree_path=worktree_path)
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
    git_service = get_git_service_for_project(project_id, worktree_path=worktree_path)
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
    git_service = get_git_service_for_project(project_id, worktree_path=worktree_path)
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
    git_service = get_git_service_for_project(project_id, worktree_path=worktree_path)
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
    git_service = get_git_service_for_project(project_id, worktree_path=worktree_path)
    result = git_service.stage_hunks(
        file_path=request.file_path,
        hunk_indices=request.hunk_indices,
    )

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


# =============================================================================
# Merge Preview & Execution Endpoints
# =============================================================================


@router.post("/projects/{project_id}/merge/preview", response_model=MergePreview)
async def preview_merge(
    project_id: str,
    source_branch: str = Query(..., description="Source branch to merge"),
    target_branch: str = Query("main", description="Target branch"),
):
    """Preview merge and check for conflicts (dry-run)."""
    from services.merge_service import MergeServiceError

    merge_service = get_merge_service_for_project(project_id)

    try:
        preview = merge_service.check_merge_conflicts(
            source_branch=source_branch,
            target_branch=target_branch,
        )
        return preview
    except MergeServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/merge/conflicts", response_model=list[ConflictFile])
async def get_conflicts(
    project_id: str,
    source_branch: str = Query(..., description="Source branch"),
    target_branch: str = Query("main", description="Target branch"),
):
    """Get detailed conflict information."""
    merge_service = get_merge_service_for_project(project_id)

    conflicts = merge_service.get_conflict_details(
        source_branch=source_branch,
        target_branch=target_branch,
    )
    return conflicts


@router.get("/projects/{project_id}/merge/three-way-diff", response_model=ThreeWayDiff)
async def get_three_way_diff(
    project_id: str,
    file_path: str = Query(..., description="File path"),
    source_branch: str = Query(..., description="Source branch"),
    target_branch: str = Query("main", description="Target branch"),
):
    """Get three-way diff for a file."""
    merge_service = get_merge_service_for_project(project_id)

    diff = merge_service.get_three_way_diff(
        file_path=file_path,
        source_branch=source_branch,
        target_branch=target_branch,
    )
    return diff


@router.post("/projects/{project_id}/merge", response_model=MergeResult)
async def execute_merge(
    project_id: str,
    request: MergeExecuteRequest,
    user_role: str = Query("member", description="User role for permission check"),
):
    """Execute merge operation.

    Requires 'merge_main' permission for protected branches.
    """
    from services.merge_service import MergeServiceError

    # Check permissions for protected branches
    if not can_merge_to_branch(user_role, request.target_branch):
        raise HTTPException(
            status_code=403,
            detail=f"Insufficient permissions to merge to '{request.target_branch}'",
        )

    merge_service = get_merge_service_for_project(project_id)

    try:
        result = merge_service.merge_branch(
            source_branch=request.source_branch,
            target_branch=request.target_branch,
            message=request.message,
        )
        return result
    except MergeServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/projects/{project_id}/merge/resolve", response_model=ConflictResolutionResult)
async def resolve_conflict(
    project_id: str,
    request: ConflictResolutionRequest,
):
    """Resolve a single file conflict.

    Use this endpoint to resolve conflicts one file at a time during a merge.
    Supported strategies:
    - ours: Keep target branch version
    - theirs: Keep source branch version
    - custom: Provide resolved content manually
    """
    merge_service = get_merge_service_for_project(project_id)

    result = merge_service.resolve_conflict(request)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


@router.post("/projects/{project_id}/merge/abort", response_model=MergeAbortResult)
async def abort_merge(project_id: str):
    """Abort an ongoing merge operation.

    Use this endpoint to cancel a merge that has conflicts.
    All changes will be reverted to the pre-merge state.
    """
    merge_service = get_merge_service_for_project(project_id)

    result = merge_service.abort_merge()

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


@router.get("/projects/{project_id}/merge/status")
async def get_merge_status(project_id: str):
    """Get current merge status.

    Returns information about whether a merge is in progress,
    which files still have unresolved conflicts, and whether
    the merge can be completed.
    """
    merge_service = get_merge_service_for_project(project_id)
    return merge_service.get_merge_status()


@router.post("/projects/{project_id}/merge/complete", response_model=MergeResult)
async def complete_merge(
    project_id: str,
    message: str | None = Query(None, description="Commit message for the merge"),
):
    """Complete an ongoing merge after all conflicts are resolved.

    Use this endpoint after resolving all conflicts to create the merge commit.
    """
    merge_service = get_merge_service_for_project(project_id)

    result = merge_service.complete_merge(message)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


# =============================================================================
# Internal Merge Request Endpoints
# =============================================================================


@router.get("/projects/{project_id}/merge-requests", response_model=MergeRequestListResponse)
async def list_merge_requests(
    project_id: str,
    status: MergeRequestStatus | None = Query(None, description="Filter by status"),
):
    """List merge requests for a project."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mrs = await mr_service.list_merge_requests_async(status=status)
                await db_session.commit()
        else:
            mrs = mr_service.list_merge_requests(status=status)
        return MergeRequestListResponse(merge_requests=mrs, total=len(mrs))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list merge requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/merge-requests/{mr_id}", response_model=MergeRequest)
async def get_merge_request(
    project_id: str,
    mr_id: str,
):
    """Get a merge request by ID."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.get_merge_request_async(mr_id)
                await db_session.commit()
        else:
            mr = mr_service.get_merge_request(mr_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/merge-requests", response_model=MergeRequest)
async def create_merge_request(
    project_id: str,
    request: MergeRequestCreate,
    author_id: str = Query("system", description="Author user ID"),
    author_name: str = Query("System", description="Author name"),
    author_email: str = Query("system@example.com", description="Author email"),
):
    """Create a new merge request."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.create_merge_request_async(
                    title=request.title,
                    source_branch=request.source_branch,
                    target_branch=request.target_branch,
                    description=request.description,
                    reviewers=request.reviewers,
                    author_id=author_id,
                    author_name=author_name,
                    author_email=author_email,
                    auto_merge=request.auto_merge,
                )
                await db_session.commit()
        else:
            mr = mr_service.create_merge_request(
                title=request.title,
                source_branch=request.source_branch,
                target_branch=request.target_branch,
                description=request.description,
                reviewers=request.reviewers,
                author_id=author_id,
                author_name=author_name,
                author_email=author_email,
                auto_merge=request.auto_merge,
            )
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/projects/{project_id}/merge-requests/{mr_id}", response_model=MergeRequest)
async def update_merge_request(
    project_id: str,
    mr_id: str,
    request: MergeRequestUpdate,
):
    """Update a merge request."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.update_merge_request_async(
                    mr_id=mr_id,
                    title=request.title,
                    description=request.description,
                    status=request.status,
                    reviewers=request.reviewers,
                    auto_merge=request.auto_merge,
                )
                await db_session.commit()
        else:
            mr = mr_service.update_merge_request(
                mr_id=mr_id,
                title=request.title,
                description=request.description,
                status=request.status,
                reviewers=request.reviewers,
            )

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/merge-requests/{mr_id}/approve", response_model=MergeRequest)
async def approve_merge_request(
    project_id: str,
    mr_id: str,
    user_id: str = Query(..., description="Approving user ID"),
):
    """Approve a merge request. Triggers auto-merge if conditions met."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.approve_merge_request_async(mr_id=mr_id, user_id=user_id)
                await db_session.commit()
        else:
            mr = mr_service.approve_merge_request(mr_id=mr_id, user_id=user_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to approve merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/merge-requests/{mr_id}/merge")
async def merge_merge_request(
    project_id: str,
    mr_id: str,
    user_id: str = Query(..., description="User ID performing the merge"),
    user_role: str = Query("member", description="User role for permission check"),
):
    """Merge a merge request."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)

        if db_session:
            async with db_session:
                mr = await mr_service.get_merge_request_async(mr_id)
                if not mr:
                    raise HTTPException(status_code=404, detail="Merge request not found")

                if not can_merge_to_branch(user_role, mr.target_branch):
                    raise HTTPException(
                        status_code=403,
                        detail=f"Insufficient permissions to merge to '{mr.target_branch}'",
                    )

                mr, result = await mr_service.merge_merge_request_async(
                    mr_id=mr_id, merged_by=user_id
                )
                await db_session.commit()

                # Trigger auto-deploy after successful merge
                if result and result.success:
                    await mr_service._try_auto_deploy(mr)
        else:
            mr = mr_service.get_merge_request(mr_id)
            if not mr:
                raise HTTPException(status_code=404, detail="Merge request not found")

            if not can_merge_to_branch(user_role, mr.target_branch):
                raise HTTPException(
                    status_code=403,
                    detail=f"Insufficient permissions to merge to '{mr.target_branch}'",
                )

            mr, result = mr_service.merge_merge_request(mr_id=mr_id, merged_by=user_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")

        if result and not result.success:
            raise HTTPException(status_code=409, detail=result.message)

        return {"merge_request": mr, "merge_result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to merge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/merge-requests/{mr_id}/close", response_model=MergeRequest)
async def close_merge_request(
    project_id: str,
    mr_id: str,
    user_id: str = Query(..., description="User ID closing the MR"),
):
    """Close a merge request without merging."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.close_merge_request_async(mr_id=mr_id, closed_by=user_id)
                await db_session.commit()
        else:
            mr = mr_service.close_merge_request(mr_id=mr_id, closed_by=user_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to close merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/projects/{project_id}/merge-requests/{mr_id}", status_code=204)
async def delete_merge_request(
    project_id: str,
    mr_id: str,
):
    """Permanently delete a merge request record (metadata only — git refs are untouched)."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                deleted = await mr_service.delete_merge_request_async(mr_id)
                await db_session.commit()
        else:
            deleted = mr_service.delete_merge_request(mr_id)

        if not deleted:
            raise HTTPException(status_code=404, detail="Merge request not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/projects/{project_id}/merge-requests/{mr_id}/refresh-conflicts", response_model=MergeRequest
)
async def refresh_mr_conflicts(
    project_id: str,
    mr_id: str,
):
    """Refresh conflict status for a merge request."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.refresh_conflict_status_async(mr_id)
                await db_session.commit()
        else:
            mr = mr_service.refresh_conflict_status(mr_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to refresh conflict status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Remote Operation Endpoints
# =============================================================================


@router.post("/projects/{project_id}/fetch", response_model=FetchResult)
async def fetch_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
):
    """Fetch from remote."""
    git_service = get_git_service_for_project(project_id)
    result = git_service.fetch(remote=remote)
    return result


@router.post("/projects/{project_id}/pull", response_model=PullResult)
async def pull_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
    branch: str | None = Query(None, description="Branch to pull"),
):
    """Pull from remote."""
    git_service = get_git_service_for_project(project_id)
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
    git_service = get_git_service_for_project(project_id, worktree_path=worktree_path)
    result = git_service.push(remote=remote, branch=branch, set_upstream=set_upstream)
    return result
