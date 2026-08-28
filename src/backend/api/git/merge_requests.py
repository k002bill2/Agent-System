"""merge_requests 관련 Git API 라우트."""

import logging

from fastapi import APIRouter, HTTPException, Query

from models.git import (
    MergeRequest,
    MergeRequestCreate,
    MergeRequestListResponse,
    MergeRequestStatus,
    MergeRequestUpdate,
    can_merge_to_branch,
)

from ._shared import _get_db_session, get_mr_service_for_project

logger = logging.getLogger(__name__)

router = APIRouter()


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
        mr_service = await get_mr_service_for_project(project_id, db_session=db_session)
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
        mr_service = await get_mr_service_for_project(project_id, db_session=db_session)
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
        mr_service = await get_mr_service_for_project(project_id, db_session=db_session)
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
        mr_service = await get_mr_service_for_project(project_id, db_session=db_session)
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
        mr_service = await get_mr_service_for_project(project_id, db_session=db_session)
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
        mr_service = await get_mr_service_for_project(project_id, db_session=db_session)

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
        mr_service = await get_mr_service_for_project(project_id, db_session=db_session)
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
        mr_service = await get_mr_service_for_project(project_id, db_session=db_session)
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
        mr_service = await get_mr_service_for_project(project_id, db_session=db_session)
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
