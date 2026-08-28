"""Workflow automation API router."""

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, normalize_project_id
from api.workflow_authz import (
    authorize_run,
    authorize_workflow,
    authorize_workflow_project,
    workflow_project_id,
)
from db.database import get_db
from db.models import UserModel
from models.workflow import (
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRunTrigger,
    WorkflowUpdate,
)
from services.workflow_engine import get_workflow_engine
from services.workflow_service import USE_DATABASE, WorkflowService, get_workflow_service
from services.workflow_yaml_parser import workflow_to_yaml

router = APIRouter(
    prefix="/workflows",
    tags=["workflows"],
    dependencies=[Depends(get_current_user)],
)


def _to_workflow_response(w: dict) -> dict:
    """Convert internal workflow dict to API response."""
    return {
        "id": w["id"],
        "name": w["name"],
        "description": w["description"],
        "status": w["status"],
        "project_id": w.get("project_id"),
        "definition": w["definition"],
        "yaml_content": w.get("yaml_content"),
        "version": w["version"],
        "created_by": w.get("created_by"),
        "created_at": w["created_at"],
        "updated_at": w["updated_at"],
        "last_run_at": w.get("last_run_at"),
        "last_run_status": w.get("last_run_status"),
    }


def _to_run_response(r: dict) -> dict:
    """Convert internal run dict to API response."""
    return {
        "id": r["id"],
        "workflow_id": r["workflow_id"],
        "workflow_name": r.get("workflow_name", ""),
        "trigger_type": r["trigger_type"],
        "trigger_payload": r.get("trigger_payload", {}),
        "status": r["status"],
        "started_at": r["started_at"],
        "completed_at": r.get("completed_at"),
        "duration_seconds": r.get("duration_seconds"),
        "total_cost": r.get("total_cost", 0.0),
        "error_summary": r.get("error_summary"),
        "jobs": r.get("jobs", []),
    }


# ── Workflow CRUD ───────────────────────────────────────────


@router.get("", response_model=WorkflowListResponse)
async def list_workflows(
    project_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """List workflows visible to the authenticated project member."""
    if project_id is not None:
        # A blank identifier is rejected rather than normalized: both listing
        # backends treat a falsy project_id as "no filter" and would return
        # every workflow in the deployment.
        project_id = normalize_project_id(project_id)
    await authorize_workflow_project(project_id, current_user, db)
    service = get_workflow_service()
    if USE_DATABASE:
        workflows = await WorkflowService.list_workflows_async(db, project_id=project_id)
    else:
        workflows = service.list_workflows(project_id=project_id)
    if project_id is not None:
        # Defensive: the authorized scope is exactly one project, so the
        # response must never carry a global or foreign workflow.
        workflows = [w for w in workflows if w.get("project_id") == project_id]
    return {
        "workflows": [_to_workflow_response(w) for w in workflows],
        "total": len(workflows),
    }


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Get a workflow definition by ID."""
    workflow = await authorize_workflow(workflow_id, current_user, db)
    return _to_workflow_response(workflow)


@router.post("", status_code=201)
async def create_workflow(
    data: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Create a new workflow definition."""
    if data.project_id is not None:
        data = data.model_copy(update={"project_id": normalize_project_id(data.project_id)})
    await authorize_workflow_project(data.project_id, current_user, db, min_role="editor")
    try:
        service = get_workflow_service()
        if USE_DATABASE:
            workflow = await WorkflowService.create_workflow_async(db, data)
        else:
            workflow = service.create_workflow(data)
        return _to_workflow_response(workflow)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    data: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Update a workflow definition."""
    service = get_workflow_service()
    # Authorize the source project before anything else, then — when the update
    # relocates the workflow — the destination project independently. Checking
    # only one side lets an editor of project A move a workflow into project B
    # (or into the privileged global scope) that they cannot write to.
    existing = await authorize_workflow(workflow_id, current_user, db, min_role="editor")
    if "project_id" in data.model_fields_set:
        target_project_id = data.project_id
        if target_project_id is not None:
            target_project_id = normalize_project_id(target_project_id)
            data = data.model_copy(update={"project_id": target_project_id})
        if target_project_id != workflow_project_id(existing):
            # ``require_project_role`` also validates that the target project is
            # registered and active (database mode is authoritative).
            await authorize_workflow_project(target_project_id, current_user, db, min_role="editor")
    try:
        if USE_DATABASE:
            workflow = await WorkflowService.update_workflow_async(db, workflow_id, data)
        else:
            workflow = service.update_workflow(workflow_id, data)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return _to_workflow_response(workflow)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Delete a workflow definition."""
    service = get_workflow_service()
    await authorize_workflow(workflow_id, current_user, db, min_role="editor")
    if USE_DATABASE:
        success = await WorkflowService.delete_workflow_async(db, workflow_id)
    else:
        success = service.delete_workflow(workflow_id)
    if not success:
        raise HTTPException(status_code=404, detail="Workflow not found")


# ── Workflow Runs ───────────────────────────────────────────


@router.get("/{workflow_id}/runs")
async def list_runs(
    workflow_id: str,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """List runs for an authorized workflow."""
    service = get_workflow_service()
    await authorize_workflow(workflow_id, current_user, db)
    if USE_DATABASE:
        runs = await WorkflowService.list_runs_async(db, workflow_id=workflow_id, limit=limit)
    else:
        runs = service.list_runs(workflow_id=workflow_id, limit=limit)
    return {
        "runs": [_to_run_response(r) for r in runs],
        "total": len(runs),
    }


@router.post("/{workflow_id}/runs", status_code=201)
async def trigger_run(
    workflow_id: str,
    data: WorkflowRunTrigger | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Trigger a new workflow run for an authorized workflow."""
    service = get_workflow_service()
    await authorize_workflow(workflow_id, current_user, db, min_role="editor")
    try:
        trigger = data or WorkflowRunTrigger()
        if USE_DATABASE:
            run = await service.trigger_run_async(db, workflow_id, trigger)
        else:
            run = await service.trigger_run(workflow_id, trigger)
        return _to_run_response(run)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Get a workflow run by ID."""
    run = await authorize_run(run_id, current_user, db)
    return _to_run_response(run)


@router.post("/runs/{run_id}/cancel")
async def cancel_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Cancel a running workflow."""
    service = get_workflow_service()
    await authorize_run(run_id, current_user, db, min_role="editor")
    if USE_DATABASE:
        run = await service.cancel_run_async(db, run_id)
    else:
        run = service.cancel_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _to_run_response(run)


@router.post("/runs/{run_id}/retry", status_code=201)
async def retry_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Retry a failed workflow run."""
    service = get_workflow_service()
    await authorize_run(run_id, current_user, db, min_role="editor")
    if USE_DATABASE:
        workflow_id = await WorkflowService.retry_run_async(db, run_id)
    else:
        workflow_id = service.retry_run(run_id)
    if not workflow_id:
        raise HTTPException(status_code=404, detail="Run not found")

    trigger = WorkflowRunTrigger()
    if USE_DATABASE:
        run = await service.trigger_run_async(db, workflow_id, trigger)
    else:
        run = await service.trigger_run(workflow_id, trigger)
    return _to_run_response(run)


# ── SSE Log Stream ──────────────────────────────────────────


@router.get("/runs/{run_id}/stream")
async def stream_run_logs(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Stream real-time logs for an authorized workflow run via SSE."""
    service = get_workflow_service()
    await authorize_run(run_id, current_user, db)
    engine = get_workflow_engine()

    async def event_stream():
        log_index = 0
        while True:
            # Get new logs
            new_logs = engine.get_logs(run_id, since_index=log_index)
            for log in new_logs:
                yield f"event: log\ndata: {json.dumps(log)}\n\n"
                log_index += 1

            # Check the active in-memory run first. In database mode a run may
            # outlive the process-local cache, so fall back to the authoritative
            # DB snapshot; otherwise a terminal run would leave this stream open
            # forever without a final snapshot/EOF.
            current_run = service.get_run(run_id)
            if current_run is None and USE_DATABASE:
                current_run = await WorkflowService.get_run_async(db, run_id)
            if current_run:
                status = current_run["status"]
                if isinstance(status, str):
                    status_value = status
                else:
                    status_value = status.value if hasattr(status, "value") else str(status)

                if status_value in ("completed", "failed", "cancelled"):
                    yield f"event: status\ndata: {json.dumps({'status': status_value})}\n\n"
                    yield f"event: done\ndata: {json.dumps(_to_run_response(current_run), default=str)}\n\n"
                    break
                else:
                    yield f"event: status\ndata: {json.dumps({'status': status_value})}\n\n"

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── YAML Export ─────────────────────────────────────────────


@router.get("/{workflow_id}/yaml")
async def export_yaml(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Export workflow definition as YAML."""
    workflow = await authorize_workflow(workflow_id, current_user, db)

    if workflow.get("yaml_content"):
        return {"yaml": workflow["yaml_content"]}

    yaml_str = workflow_to_yaml(workflow["definition"])
    return {"yaml": yaml_str}
