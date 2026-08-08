"""merge 관련 Git API 라우트."""

from fastapi import APIRouter, HTTPException, Query

from models.git import (
    ConflictFile,
    # Conflict resolution models
    ConflictResolutionRequest,
    ConflictResolutionResult,
    MergeAbortResult,
    MergeExecuteRequest,
    # Merge models
    MergePreview,
    MergeResult,
    ThreeWayDiff,
    # Permission helpers
    can_merge_to_branch,
)
from models.project import get_project

from ._shared import get_effective_git_path

router = APIRouter()


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
