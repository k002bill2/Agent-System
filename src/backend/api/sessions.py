"""Session & Task API routes.

Handles session lifecycle (create, get, delete, sync, refresh) and
task operations (submit, cancel, retry, pause, resume, delete, tree).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.deps import get_engine
from models.task import TaskCreate, TaskTree
from orchestrator import OrchestrationEngine

router = APIRouter(tags=["orchestration"])


# ─────────────────────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────────────────────


class SessionCreate(BaseModel):
    """Session creation request."""

    project_id: str | None = Field(None, description="Optional project context")
    organization_id: str | None = Field(
        None, description="Optional organization context for quota enforcement"
    )


class SessionResponse(BaseModel):
    """Session creation response."""

    session_id: str
    project_id: str | None = None
    organization_id: str | None = None
    message: str = "Session created successfully"


class TaskResponse(BaseModel):
    """Task submission response."""

    session_id: str
    root_task_id: str | None
    message: str


class StateResponse(BaseModel):
    """State query response."""

    session_id: str
    tasks: dict
    agents: dict
    current_task_id: str | None
    iteration_count: int


class PauseTaskRequest(BaseModel):
    """Request body for pausing a task."""

    reason: str | None = Field(None, description="Optional reason for pausing")


# ─────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "agent-orchestrator"}


# ─────────────────────────────────────────────────────────────
# Session CRUD
# ─────────────────────────────────────────────────────────────


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    request: SessionCreate = None,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Create a new orchestration session with optional project context."""
    from models.project import get_project

    project_id = request.project_id if request else None
    organization_id = request.organization_id if request else None

    # Validate project if specified
    project = None
    if project_id:
        project = get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # Create session with quota enforcement
    try:
        session_id = await engine.create_session(
            project=project,
            organization_id=organization_id,
        )
    except ValueError as e:
        # Quota exceeded
        raise HTTPException(status_code=429, detail=str(e))

    return SessionResponse(
        session_id=session_id,
        project_id=project_id,
        organization_id=organization_id,
    )


@router.get("/sessions/{session_id}", response_model=StateResponse)
async def get_session(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Get session state."""
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    return StateResponse(
        session_id=session_id,
        tasks={
            k: v.model_dump() if hasattr(v, "model_dump") else v
            for k, v in state.get("tasks", {}).items()
        },
        agents=state.get("agents", {}),
        current_task_id=state.get("current_task_id"),
        iteration_count=state.get("iteration_count", 0),
    )


@router.get("/sessions/{session_id}/info")
async def get_session_info(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Get session metadata info including TTL status.

    Returns session info for checking expiration and activity.
    """
    from services.session_service import get_session_service

    service = get_session_service()
    info = await service.get_session_info(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    return info


@router.post("/sessions/{session_id}/refresh")
async def refresh_session(
    session_id: str,
    extend_days: int | None = None,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Refresh session expiration time.

    Call this on page load or when the user returns to extend the session.
    """
    from services.session_service import get_session_service

    service = get_session_service()
    if not await service.refresh_session(session_id, extend_days):
        raise HTTPException(status_code=404, detail="Session not found or expired")

    # Get updated info
    info = await service.get_session_info(session_id)
    return {
        "message": "Session refreshed",
        "session_id": session_id,
        "expires_at": info.get("expires_at") if info else None,
        "ttl_remaining_hours": info.get("ttl_remaining_hours") if info else None,
    }


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Delete a session."""
    if not await engine.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}


@router.get("/sessions/{session_id}/sync")
async def sync_session(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Synchronize session state with the client.

    Returns the full session state including tasks, which the client
    can use to validate and sync its local state.

    If session is not found, returns 404 so client knows to clear local state.
    """
    from services.session_service import get_session_service

    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    # Get session metadata
    service = get_session_service()
    session_info = await service.get_session_info(session_id)

    # Transform tasks for client
    tasks = {}
    for task_id, task in state.get("tasks", {}).items():
        if hasattr(task, "model_dump"):
            task_dict = task.model_dump()
        else:
            task_dict = task
        # Only include non-deleted tasks
        if not task_dict.get("is_deleted", False):
            tasks[task_id] = task_dict

    return {
        "session_id": session_id,
        "session_info": session_info,
        "tasks": tasks,
        "root_task_id": state.get("root_task_id"),
        "agents": state.get("agents", {}),
        "pending_approvals": state.get("pending_approvals", {}),
        "waiting_for_approval": state.get("waiting_for_approval", False),
        "token_usage": state.get("token_usage", {}),
        "total_cost": state.get("total_cost", 0),
        "project": state.get("project"),
    }


# ─────────────────────────────────────────────────────────────
# Task Operations
# ─────────────────────────────────────────────────────────────


@router.post("/sessions/{session_id}/tasks", response_model=TaskResponse)
async def submit_task(
    session_id: str,
    task: TaskCreate,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Submit a task for orchestration."""
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    # Run orchestration
    final_state = await engine.run(session_id, task.description)

    return TaskResponse(
        session_id=session_id,
        root_task_id=final_state.get("root_task_id"),
        message="Task submitted for orchestration",
    )


@router.post("/sessions/{session_id}/cancel")
async def cancel_orchestration(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Cancel an active orchestration."""
    if not await engine.cancel(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Orchestration cancelled"}


@router.get("/sessions/{session_id}/tasks/{task_id}")
async def get_task(
    session_id: str,
    task_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Get a specific task."""
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    tasks = state.get("tasks", {})
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]
    return task.model_dump() if hasattr(task, "model_dump") else task


@router.delete("/sessions/{session_id}/tasks/{task_id}")
async def delete_task(
    session_id: str,
    task_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Soft delete a task and its children.

    Rules:
    - Cannot delete in_progress tasks (cancel first)
    - Cannot delete if any child is in_progress
    - Deletes cascade to all children
    """
    from services.task_service import TaskService

    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    tasks = state.get("tasks", {})

    # Validate deletion
    validation = TaskService.validate_deletion(task_id, tasks)
    if not validation.can_delete:
        raise HTTPException(
            status_code=400,
            detail={
                "message": validation.reason,
                "in_progress_task_ids": validation.in_progress_task_ids,
            },
        )

    # Perform soft delete
    result = TaskService.soft_delete_task(task_id, tasks, include_children=True)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)

    return {
        "success": True,
        "deleted_task_ids": result.deleted_task_ids,
        "message": f"Deleted {len(result.deleted_task_ids)} task(s)",
    }


@router.get("/sessions/{session_id}/tasks/{task_id}/deletion-info")
async def get_task_deletion_info(
    session_id: str,
    task_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Get information about what would happen if a task is deleted.

    Returns:
    - children_count: number of child tasks that would be deleted
    - in_progress_count: number of in_progress tasks blocking deletion
    - can_delete: whether deletion is possible
    """
    from services.task_service import TaskService

    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    tasks = state.get("tasks", {})
    info = TaskService.get_deletion_info(task_id, tasks)

    if not info.get("exists"):
        raise HTTPException(status_code=404, detail="Task not found")

    return info


@router.post("/sessions/{session_id}/tasks/{task_id}/cancel")
async def cancel_single_task(
    session_id: str,
    task_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Cancel a single task if it's in progress.

    This changes the task status from in_progress to cancelled,
    allowing it to be deleted.
    """
    from services.task_service import TaskService

    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    tasks = state.get("tasks", {})
    result = TaskService.cancel_task(task_id, tasks)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)

    return {
        "success": True,
        "task_id": result.task_id,
        "previous_status": result.previous_status,
        "new_status": "cancelled",
        "message": "Task cancelled successfully",
    }


@router.post("/sessions/{session_id}/tasks/{task_id}/retry")
async def retry_task(
    session_id: str,
    task_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Retry a failed or cancelled task.

    This resets the task status to pending, clears the error,
    and increments retry_count for tracking. The orchestrator will
    automatically pick up the task for re-execution.
    """
    from services.task_service import TaskService

    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    tasks = state.get("tasks", {})
    result = TaskService.retry_task(task_id, tasks)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)

    return {
        "success": True,
        "task_id": result.task_id,
        "previous_status": result.previous_status,
        "new_status": "pending",
        "retry_count": result.retry_count,
        "message": "Task queued for retry",
    }


@router.post("/sessions/{session_id}/tasks/{task_id}/pause")
async def pause_task(
    session_id: str,
    task_id: str,
    request: PauseTaskRequest | None = None,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Pause a task that is pending or in progress.

    Paused tasks are skipped by the orchestrator and can be resumed later.
    """
    from services.task_service import TaskService

    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    tasks = state.get("tasks", {})
    reason = request.reason if request else None
    result = TaskService.pause_task(task_id, tasks, reason)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)

    return {
        "success": True,
        "task_id": result.task_id,
        "previous_status": result.previous_status,
        "new_status": "paused",
        "paused_at": result.paused_at.isoformat() if result.paused_at else None,
        "message": "Task paused successfully",
    }


@router.post("/sessions/{session_id}/tasks/{task_id}/resume")
async def resume_task(
    session_id: str,
    task_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Resume a paused task.

    Sets the task back to pending so the orchestrator will pick it up.
    """
    from services.task_service import TaskService

    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    tasks = state.get("tasks", {})
    result = TaskService.resume_task(task_id, tasks)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)

    return {
        "success": True,
        "task_id": result.task_id,
        "previous_status": result.previous_status,
        "new_status": result.resumed_to,
        "message": "Task resumed successfully",
    }


# ─────────────────────────────────────────────────────────────
# Task Tree
# ─────────────────────────────────────────────────────────────


@router.get("/sessions/{session_id}/tree", response_model=TaskTree | None)
async def get_task_tree(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Get the task tree structure."""
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    root_task_id = state.get("root_task_id")
    if not root_task_id:
        return None

    tasks = state.get("tasks", {})

    def build_tree(task_id: str, depth: int = 0) -> TaskTree | None:
        if task_id not in tasks:
            return None

        task = tasks[task_id]
        children = [
            build_tree(child_id, depth + 1)
            for child_id in (task.children if hasattr(task, "children") else [])
        ]

        return TaskTree(
            id=task_id,
            title=task.title if hasattr(task, "title") else str(task),
            status=task.status if hasattr(task, "status") else "unknown",
            children=[c for c in children if c],
            depth=depth,
        )

    return build_tree(root_task_id)
