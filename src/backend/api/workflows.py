"""Workflow automation API router."""

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from models.workflow import (
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRunTrigger,
    WorkflowUpdate,
)
from services.workflow_engine import get_workflow_engine
from services.workflow_service import USE_DATABASE, WorkflowService, get_workflow_service
from services.workflow_yaml_parser import workflow_to_yaml

router = APIRouter(prefix="/workflows", tags=["workflows"])


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
):
    """List all workflow definitions."""
    service = get_workflow_service()
    if USE_DATABASE:
        workflows = await WorkflowService.list_workflows_async(db, project_id=project_id)
    else:
        workflows = service.list_workflows(project_id=project_id)
    return {
        "workflows": [_to_workflow_response(w) for w in workflows],
        "total": len(workflows),
    }


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    """Get a workflow definition by ID."""
    service = get_workflow_service()
    if USE_DATABASE:
        workflow = await WorkflowService.get_workflow_async(db, workflow_id)
    else:
        workflow = service.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _to_workflow_response(workflow)


@router.post("", status_code=201)
async def create_workflow(data: WorkflowCreate, db: AsyncSession = Depends(get_db)):
    """Create a new workflow definition."""
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
):
    """Update a workflow definition."""
    try:
        service = get_workflow_service()
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
async def delete_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a workflow definition."""
    service = get_workflow_service()
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
):
    """List runs for a workflow."""
    service = get_workflow_service()
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
):
    """Trigger a new workflow run."""
    try:
        service = get_workflow_service()
        trigger = data or WorkflowRunTrigger()
        if USE_DATABASE:
            run = await service.trigger_run_async(db, workflow_id, trigger)
        else:
            run = await service.trigger_run(workflow_id, trigger)
        return _to_run_response(run)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/runs/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """Get a workflow run by ID."""
    service = get_workflow_service()
    if USE_DATABASE:
        # Check in-memory first (active runs for SSE)
        run = service.get_run(run_id)
        if not run:
            run = await WorkflowService.get_run_async(db, run_id)
    else:
        run = service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _to_run_response(run)


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """Cancel a running workflow."""
    service = get_workflow_service()
    if USE_DATABASE:
        run = await service.cancel_run_async(db, run_id)
    else:
        run = service.cancel_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _to_run_response(run)


@router.post("/runs/{run_id}/retry", status_code=201)
async def retry_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """Retry a failed workflow run."""
    service = get_workflow_service()
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
async def stream_run_logs(run_id: str, db: AsyncSession = Depends(get_db)):
    """Stream real-time logs for a workflow run via SSE."""
    service = get_workflow_service()
    # Check in-memory first (active runs); fallback to DB for completed
    run = service.get_run(run_id)
    if not run and USE_DATABASE:
        run = await WorkflowService.get_run_async(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    engine = get_workflow_engine()

    async def event_stream():
        log_index = 0
        while True:
            # Get new logs
            new_logs = engine.get_logs(run_id, since_index=log_index)
            for log in new_logs:
                yield f"event: log\ndata: {json.dumps(log)}\n\n"
                log_index += 1

            # Check run status (in-memory is authoritative for active runs)
            current_run = service.get_run(run_id)
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
async def export_yaml(workflow_id: str, db: AsyncSession = Depends(get_db)):
    """Export workflow definition as YAML."""
    service = get_workflow_service()
    if USE_DATABASE:
        workflow = await WorkflowService.get_workflow_async(db, workflow_id)
    else:
        workflow = service.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if workflow.get("yaml_content"):
        return {"yaml": workflow["yaml_content"]}

    yaml_str = workflow_to_yaml(workflow["definition"])
    return {"yaml": yaml_str}
