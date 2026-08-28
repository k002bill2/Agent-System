"""remotes 관련 Git API 라우트."""

from fastapi import APIRouter, HTTPException

from models.git import (
    RemoteAddRequest,
    RemoteListResponse,
    RemoteOperationResult,
    RemoteUpdateRequest,
)

from ._shared import get_git_service_for_project

router = APIRouter()


# =============================================================================
# Remote Management Endpoints
# =============================================================================


@router.get("/projects/{project_id}/remotes", response_model=RemoteListResponse)
async def list_remotes(project_id: str):
    """List all remotes for a project."""
    git_service = await get_git_service_for_project(project_id)
    remotes = git_service.list_remotes()
    return RemoteListResponse(remotes=remotes)


@router.post("/projects/{project_id}/remotes", response_model=RemoteOperationResult)
async def add_remote(project_id: str, request: RemoteAddRequest):
    """Add a new remote."""
    git_service = await get_git_service_for_project(project_id)
    result = git_service.add_remote(name=request.name, url=request.url)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)
    return result


@router.delete("/projects/{project_id}/remotes/{remote_name}", response_model=RemoteOperationResult)
async def remove_remote(project_id: str, remote_name: str):
    """Remove a remote."""
    git_service = await get_git_service_for_project(project_id)
    result = git_service.remove_remote(name=remote_name)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)
    return result


@router.put("/projects/{project_id}/remotes/{remote_name}", response_model=RemoteOperationResult)
async def update_remote(project_id: str, remote_name: str, request: RemoteUpdateRequest):
    """Update a remote (rename or change URL)."""
    git_service = await get_git_service_for_project(project_id)

    # Update URL first if provided
    if request.url:
        result = git_service.set_remote_url(name=remote_name, url=request.url)
        if not result.success:
            raise HTTPException(status_code=400, detail=result.message)

    # Then rename if provided
    if request.new_name:
        result = git_service.rename_remote(name=remote_name, new_name=request.new_name)
        if not result.success:
            raise HTTPException(status_code=400, detail=result.message)
        return result

    if request.url:
        return RemoteOperationResult(success=True, message=f"Remote '{remote_name}' updated")

    return RemoteOperationResult(success=True, message="No changes requested")
