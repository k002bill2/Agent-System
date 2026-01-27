"""REST API routes."""

import os
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json

# Docker mode: skip host filesystem validations
IS_DOCKER = bool(os.getenv("CLAUDE_HOME"))

from models.task import Task, TaskCreate, TaskTree
from models.agent_state import AgentState, TaskStatus
from models.hitl import ApprovalStatus, ApprovalResponse
from models.context_usage import ContextUsage, get_context_limit
from models.permissions import (
    AgentPermission,
    SessionPermissions,
    SessionPermissionsResponse,
    UpdatePermissionsRequest,
    PermissionInfo,
    get_permission_info,
    PERMISSION_DESCRIPTIONS,
)
from models.project import (
    Project,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    ProjectLinkRequest,
    ProjectCreateFromTemplate,
    register_project,
    get_project,
    list_projects,
    unregister_project,
    get_projects_dir,
    update_project,
    normalize_path,
)
from models.monitoring import (
    CheckType,
    CheckStatus,
    CheckResult,
    ProjectHealth,
    CheckStartedPayload,
    CheckProgressPayload,
    CheckCompletedPayload,
)
from services.project_runner import ProjectRunner, get_runner
from services.warp_service import get_warp_service
from api.deps import get_engine
from orchestrator import OrchestrationEngine


router = APIRouter(tags=["orchestration"])


class SessionCreate(BaseModel):
    """Session creation request."""

    project_id: str | None = Field(None, description="Optional project context")


class SessionResponse(BaseModel):
    """Session creation response."""

    session_id: str
    project_id: str | None = None
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


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "agent-orchestrator"}


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    request: SessionCreate = None,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """Create a new orchestration session with optional project context."""
    project_id = request.project_id if request else None

    # Validate project if specified
    project = None
    if project_id:
        project = get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    session_id = await engine.create_session(project=project)
    return SessionResponse(session_id=session_id, project_id=project_id)


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


class PauseTaskRequest(BaseModel):
    """Request body for pausing a task."""

    reason: str | None = Field(None, description="Optional reason for pausing")


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


# ─────────────────────────────────────────────────────────────
# Project API
# ─────────────────────────────────────────────────────────────


@router.get("/projects", response_model=list[ProjectResponse])
async def get_projects():
    """List all registered projects."""
    projects = list_projects()

    # Try to get RAG stats if available
    try:
        from services.rag_service import get_vector_store
        store = get_vector_store()
        rag_available = True
    except ImportError:
        rag_available = False

    result = []
    for p in projects:
        # ChromaDB에서 실제 인덱스 상태 조회 (if available)
        if rag_available:
            stats = store.get_collection_stats(p.id)
            vector_initialized = stats.get("indexed", False)
        else:
            vector_initialized = False

        result.append(ProjectResponse(
            id=p.id,
            name=p.name,
            path=p.path,
            description=p.description,
            has_claude_md=p.claude_md is not None,
            vector_store_initialized=vector_initialized,
            indexed_at=p.indexed_at,
        ))
    return result


@router.get("/projects/templates")
async def list_templates():
    """List available project templates."""
    from services.project_template_service import get_templates
    return get_templates()


@router.post("/projects/link", response_model=ProjectResponse)
async def link_project(request: ProjectLinkRequest):
    """
    Link an external project by creating a symlink.

    Creates a symbolic link in the projects/ directory pointing to the source.
    """
    from pathlib import Path

    # Normalize path to remove shell escape characters (e.g., "Mobile\ Documents" -> "Mobile Documents")
    normalized_path = normalize_path(request.source_path)
    source_path = Path(normalized_path)

    # Validate source path exists (skip in Docker - host paths not accessible)
    if not IS_DOCKER:
        if not source_path.exists():
            raise HTTPException(status_code=400, detail=f"Source path does not exist: {normalized_path}")
        if not source_path.is_dir():
            raise HTTPException(status_code=400, detail=f"Source path is not a directory: {request.source_path}")

    # Check if project ID already exists
    if get_project(request.id):
        raise HTTPException(status_code=400, detail=f"Project ID '{request.id}' already exists")

    # Create symlink in projects/ directory (skip in Docker)
    if not IS_DOCKER:
        projects_dir = get_projects_dir()
        projects_dir.mkdir(parents=True, exist_ok=True)

        symlink_path = projects_dir / request.id

        if symlink_path.exists():
            raise HTTPException(status_code=400, detail=f"Path already exists: {symlink_path}")

        # Create symbolic link
        symlink_path.symlink_to(source_path.resolve())

    # Register the project
    project = register_project(request.id, str(normalized_path))

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
    )


@router.post("/projects/create", response_model=ProjectResponse)
async def create_project_from_template(request: ProjectCreateFromTemplate):
    """
    Create a new project from a template.

    Available templates:
    - default: Basic project with CLAUDE.md and README
    - react-native: React Native Expo project
    - python: Python package with pyproject.toml
    - fastapi: FastAPI service
    """
    from pathlib import Path
    from services.project_template_service import create_project_from_template as create_from_template, get_template

    # Validate template exists
    template = get_template(request.template)
    if not template:
        raise HTTPException(status_code=400, detail=f"Unknown template: {request.template}")

    # Check if project ID already exists
    if get_project(request.id):
        raise HTTPException(status_code=400, detail=f"Project ID '{request.id}' already exists")

    # Create project in projects/ directory
    projects_dir = get_projects_dir()
    projects_dir.mkdir(parents=True, exist_ok=True)

    project_path = projects_dir / request.id

    if project_path.exists():
        raise HTTPException(status_code=400, detail=f"Path already exists: {project_path}")

    # Create project from template
    success = create_from_template(
        project_path=project_path,
        template_id=request.template,
        project_id=request.id,
        project_name=request.name,
        description=request.description,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to create project from template")

    # Register the project
    project = register_project(request.id, str(project_path))

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
    )


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project_by_id(project_id: str):
    """Get a specific project."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
    )


@router.post("/projects", response_model=ProjectResponse)
async def create_project(request: ProjectCreate):
    """Register a new project."""
    from pathlib import Path

    # Normalize path to remove shell escape characters
    normalized_path = normalize_path(request.path)

    # Validate path exists (skip in Docker - host paths not accessible)
    if not IS_DOCKER and not Path(normalized_path).exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {normalized_path}")

    project = register_project(request.id, normalized_path)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
    )


@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project_endpoint(project_id: str, request: ProjectUpdate):
    """Update project name, description, or path."""
    try:
        project = update_project(project_id, request.name, request.description, request.path)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return ProjectResponse(
        id=project.id,
        name=project.name,
        path=project.path,
        description=project.description,
        has_claude_md=project.claude_md is not None,
        vector_store_initialized=project.vector_store_initialized,
        indexed_at=project.indexed_at,
    )


@router.get("/projects/{project_id}/deletion-preview")
async def get_deletion_preview(project_id: str):
    """
    Get preview of what will be deleted when removing a project.

    Returns counts of:
    - Sessions, tasks, messages (DB records)
    - RAG index chunks
    - Symlink status

    IMPORTANT: Source files are NEVER deleted.
    """
    from services.project_cleanup_service import get_cleanup_service

    service = get_cleanup_service()
    preview = await service.get_deletion_preview(project_id)

    if not preview:
        raise HTTPException(status_code=404, detail="Project not found")

    return preview.model_dump()


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """
    Delete a project with cascade cleanup.

    This removes:
    - All DB records (sessions, tasks, messages, approvals, feedbacks)
    - The RAG vector index
    - Health cache
    - Config monitor cache
    - The symlink in projects/ directory
    - The project from registry

    IMPORTANT: Source files are NEVER deleted, only the symlink.
    """
    from services.project_cleanup_service import get_cleanup_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    service = get_cleanup_service()
    summary = await service.cascade_delete(project_id)

    if not summary.success:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Project deletion failed",
                "errors": summary.errors,
            }
        )

    return {
        "message": f"Project '{project_id}' removed successfully",
        "cleanup_summary": summary.model_dump(),
    }


# ─────────────────────────────────────────────────────────────
# Monitoring API
# ─────────────────────────────────────────────────────────────

# In-memory storage for project health (could be replaced with DB)
_project_health: dict[str, ProjectHealth] = {}


class CheckResponse(BaseModel):
    """Response for check result."""

    project_id: str
    check_type: CheckType
    status: CheckStatus
    exit_code: int | None
    duration_ms: int | None
    stdout: str
    stderr: str


class ProjectHealthResponse(BaseModel):
    """Response for project health."""

    project_id: str
    project_name: str
    project_path: str
    checks: dict[str, CheckResponse]
    last_updated: str


@router.get("/projects/{project_id}/health", response_model=ProjectHealthResponse)
async def get_project_health(project_id: str):
    """Get the health status of a project."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Initialize health if not exists
    if project_id not in _project_health:
        _project_health[project_id] = ProjectHealth(
            project_id=project_id,
            project_name=project.name,
            project_path=project.path,
        )

    health = _project_health[project_id]

    return ProjectHealthResponse(
        project_id=health.project_id,
        project_name=health.project_name,
        project_path=health.project_path,
        checks={
            ct.value: CheckResponse(
                project_id=project_id,
                check_type=ct,
                status=health.checks.get(ct, CheckResult(check_type=ct)).status,
                exit_code=health.checks.get(ct, CheckResult(check_type=ct)).exit_code,
                duration_ms=health.checks.get(ct, CheckResult(check_type=ct)).duration_ms,
                stdout=health.checks.get(ct, CheckResult(check_type=ct)).stdout,
                stderr=health.checks.get(ct, CheckResult(check_type=ct)).stderr,
            )
            for ct in CheckType
        },
        last_updated=health.last_updated.isoformat(),
    )


@router.get("/projects/{project_id}/checks/run-all")
async def run_all_checks(project_id: str):
    """
    Run all checks on a project sequentially.

    Returns a streaming response with SSE events for all checks.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Initialize health if not exists
    if project_id not in _project_health:
        _project_health[project_id] = ProjectHealth(
            project_id=project_id,
            project_name=project.name,
            project_path=project.path,
        )

    async def event_stream():
        """Generate SSE events for all checks."""
        runner = get_runner(project.path)

        for check_type in CheckType:
            try:
                async for event in runner.stream_check(project_id, check_type):
                    if isinstance(event, CheckStartedPayload):
                        _project_health[project_id].update_check(
                            CheckResult(
                                check_type=check_type,
                                status=CheckStatus.RUNNING,
                                started_at=event.started_at,
                            )
                        )
                        yield f"event: check_started\ndata: {event.model_dump_json()}\n\n"

                    elif isinstance(event, CheckProgressPayload):
                        yield f"event: check_progress\ndata: {event.model_dump_json()}\n\n"

                    elif isinstance(event, CheckCompletedPayload):
                        _project_health[project_id].update_check(
                            CheckResult(
                                check_type=check_type,
                                status=event.status,
                                exit_code=event.exit_code,
                                stdout=event.stdout,
                                stderr=event.stderr,
                                duration_ms=event.duration_ms,
                                completed_at=_project_health[project_id].last_updated,
                            )
                        )
                        yield f"event: check_completed\ndata: {event.model_dump_json()}\n\n"

            except Exception as e:
                error_data = json.dumps({"error": str(e), "check_type": check_type.value})
                yield f"event: error\ndata: {error_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/projects/{project_id}/checks/{check_type}")
async def run_check(project_id: str, check_type: CheckType):
    """
    Run a specific check on a project.

    Returns a streaming response with SSE events:
    - check_started: Check has started
    - check_progress: Output line from the check
    - check_completed: Check has finished
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Initialize health if not exists
    if project_id not in _project_health:
        _project_health[project_id] = ProjectHealth(
            project_id=project_id,
            project_name=project.name,
            project_path=project.path,
        )

    async def event_stream():
        """Generate SSE events."""
        try:
            runner = get_runner(project.path)

            async for event in runner.stream_check(project_id, check_type):
                if isinstance(event, CheckStartedPayload):
                    # Mark as running
                    _project_health[project_id].update_check(
                        CheckResult(
                            check_type=check_type,
                            status=CheckStatus.RUNNING,
                            started_at=event.started_at,
                        )
                    )
                    yield f"event: check_started\ndata: {event.model_dump_json()}\n\n"

                elif isinstance(event, CheckProgressPayload):
                    yield f"event: check_progress\ndata: {event.model_dump_json()}\n\n"

                elif isinstance(event, CheckCompletedPayload):
                    # Update health with final result
                    _project_health[project_id].update_check(
                        CheckResult(
                            check_type=check_type,
                            status=event.status,
                            exit_code=event.exit_code,
                            stdout=event.stdout,
                            stderr=event.stderr,
                            duration_ms=event.duration_ms,
                            completed_at=_project_health[project_id].last_updated,
                        )
                    )
                    yield f"event: check_completed\ndata: {event.model_dump_json()}\n\n"

        except Exception as e:
            error_data = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {error_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─────────────────────────────────────────────────────────────
# Project Context API
# ─────────────────────────────────────────────────────────────


class DevDocFile(BaseModel):
    """A file in dev/active folder."""

    name: str
    path: str
    content: str
    modified_at: str


class ProjectContextResponse(BaseModel):
    """Full project context response."""

    project_id: str
    project_name: str
    project_path: str
    claude_md: str | None
    dev_docs: list[DevDocFile]
    session_info: dict | None = None


@router.get("/projects/{project_id}/context", response_model=ProjectContextResponse)
async def get_project_context(
    project_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Get full project context including:
    - CLAUDE.md content
    - Dev docs from dev/active folder
    - Current session info (if active)
    """
    from pathlib import Path
    from datetime import datetime

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get dev docs from dev/active folder
    dev_docs: list[DevDocFile] = []
    project_path = Path(project.path)
    dev_active_path = project_path / "dev" / "active"

    if dev_active_path.exists():
        for file_path in dev_active_path.glob("*.md"):
            try:
                stat = file_path.stat()
                content = file_path.read_text(encoding="utf-8")
                dev_docs.append(
                    DevDocFile(
                        name=file_path.name,
                        path=str(file_path),
                        content=content,
                        modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    )
                )
            except Exception:
                pass  # Skip files that can't be read

    # Sort by modified time, most recent first
    dev_docs.sort(key=lambda x: x.modified_at, reverse=True)

    # Get current session info if available
    session_info = None
    # Check if there's an active session for this project
    for session_id, state in engine._sessions.items():
        if state.get("project_id") == project_id:
            session_info = {
                "session_id": session_id,
                "tasks_count": len(state.get("tasks", {})),
                "agents_count": len(state.get("agents", {})),
                "iteration_count": state.get("iteration_count", 0),
                "current_task_id": state.get("current_task_id"),
            }
            break

    return ProjectContextResponse(
        project_id=project.id,
        project_name=project.name,
        project_path=project.path,
        claude_md=project.claude_md,
        dev_docs=dev_docs,
        session_info=session_info,
    )


@router.get("/projects/{project_id}/claude-md")
async def get_project_claude_md(project_id: str):
    """Get raw CLAUDE.md content for a project."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.claude_md:
        raise HTTPException(status_code=404, detail="No CLAUDE.md found for this project")

    return {"content": project.claude_md}


# ─────────────────────────────────────────────────────────────
# HITL (Human-in-the-Loop) API
# ─────────────────────────────────────────────────────────────


class ApprovalRequestResponse(BaseModel):
    """Response for pending approval requests."""

    approval_id: str
    task_id: str
    tool_name: str
    tool_args: dict
    risk_level: str
    risk_description: str
    created_at: str
    status: str


@router.get("/sessions/{session_id}/approvals")
async def get_pending_approvals(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
) -> list[ApprovalRequestResponse]:
    """Get all pending approval requests for a session."""
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    pending_approvals = state.get("pending_approvals", {})
    return [
        ApprovalRequestResponse(
            approval_id=approval["id"],
            task_id=approval["task_id"],
            tool_name=approval["tool_name"],
            tool_args=approval["tool_args"],
            risk_level=approval["risk_level"],
            risk_description=approval["risk_description"],
            created_at=approval["created_at"],
            status=approval["status"],
        )
        for approval in pending_approvals.values()
        if approval["status"] == ApprovalStatus.PENDING.value
    ]


@router.post("/sessions/{session_id}/approve/{approval_id}")
async def approve_operation(
    session_id: str,
    approval_id: str,
    response: ApprovalResponse | None = None,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Approve a pending operation.

    This will update the approval status and resume execution.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    pending_approvals = state.get("pending_approvals", {})
    if approval_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found")

    approval = pending_approvals[approval_id]
    if approval["status"] != ApprovalStatus.PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Approval already resolved: {approval['status']}"
        )

    # Update approval status
    approval["status"] = ApprovalStatus.APPROVED.value
    approval["resolver_note"] = response.note if response else None
    state["pending_approvals"] = pending_approvals
    state["waiting_for_approval"] = False

    # Resume execution
    try:
        final_state = await engine.run(session_id, "")
        return {
            "message": "Operation approved",
            "approval_id": approval_id,
            "task_id": approval["task_id"],
            "resumed": True,
        }
    except Exception as e:
        return {
            "message": "Operation approved but execution failed",
            "approval_id": approval_id,
            "error": str(e),
        }


@router.post("/sessions/{session_id}/deny/{approval_id}")
async def deny_operation(
    session_id: str,
    approval_id: str,
    response: ApprovalResponse | None = None,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Deny a pending operation.

    This will mark the task as failed and stop execution.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    pending_approvals = state.get("pending_approvals", {})
    if approval_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found")

    approval = pending_approvals[approval_id]
    if approval["status"] != ApprovalStatus.PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Approval already resolved: {approval['status']}"
        )

    # Update approval status
    approval["status"] = ApprovalStatus.DENIED.value
    approval["resolver_note"] = response.note if response else "Denied by user"
    state["pending_approvals"] = pending_approvals
    state["waiting_for_approval"] = False

    # Update the task status
    task_id = approval["task_id"]
    tasks = state.get("tasks", {})
    if task_id in tasks:
        task = tasks[task_id]
        task.status = TaskStatus.FAILED
        task.error = f"Operation denied: {approval['resolver_note']}"
        task.pending_approval_id = None

    return {
        "message": "Operation denied",
        "approval_id": approval_id,
        "task_id": task_id,
    }


# ─────────────────────────────────────────────────────────────
# Warp Terminal Integration API
# ─────────────────────────────────────────────────────────────


class WarpOpenRequest(BaseModel):
    """Request to open a project in Warp terminal."""

    project_id: str = Field(..., description="Project ID to open")
    command: str | None = Field(None, description="Optional command to execute")
    title: str | None = Field(None, description="Optional tab title")
    new_window: bool = Field(True, description="Open in new window (default) or new tab")
    use_claude_cli: bool = Field(False, description="Wrap command with claude --dangerously-skip-permissions")


class WarpOpenResponse(BaseModel):
    """Response from Warp open request."""

    success: bool
    message: str | None = None
    error: str | None = None
    uri: str | None = None
    open_via_frontend: bool = False


@router.post("/warp/open", response_model=WarpOpenResponse)
async def open_in_warp(request: WarpOpenRequest):
    """
    Open a project in Warp terminal.

    If use_claude_cli is True, the command (or interactive mode) will be wrapped
    with `claude --dangerously-skip-permissions`.

    If a command is provided without use_claude_cli, it will be executed directly.
    Without any command, Warp will simply open a new window/tab at the project path.
    """
    # Get project
    project = get_project(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{request.project_id}' not found")

    warp = get_warp_service()

    # Check if Warp is installed
    if not warp.is_warp_installed():
        return WarpOpenResponse(
            success=False,
            error="Warp terminal is not installed. Please install from https://warp.dev",
        )

    # Build the actual command
    if request.use_claude_cli:
        # Two-phase: start Claude interactively, then inject task via expect
        actual_command = warp.build_claude_command(
            task=request.command,  # None → interactive mode, string → expect inject
        )
        tab_title = request.title or "Claude CLI"
    else:
        actual_command = request.command
        tab_title = request.title

    # Open Warp with or without command
    if actual_command:
        result = warp.open_with_command(
            path=project.path,
            command=actual_command,
            title=tab_title,
            new_window=request.new_window,
        )
    else:
        result = warp.open_path(
            path=project.path,
            new_window=request.new_window,
        )

    return WarpOpenResponse(
        success=result.get("success", False),
        message=result.get("message"),
        error=result.get("error"),
        uri=result.get("uri"),
        open_via_frontend=result.get("open_via_frontend", False),
    )


@router.get("/warp/status")
async def warp_status():
    """Check Warp terminal installation status."""
    warp = get_warp_service()
    installed = warp.is_warp_installed()

    return {
        "installed": installed,
        "message": "Warp is installed" if installed else "Warp is not installed",
        "docker_mode": IS_DOCKER,
    }


@router.post("/warp/cleanup")
async def warp_cleanup(max_age_hours: int = 24):
    """
    Clean up old AOS launch configurations.

    Args:
        max_age_hours: Remove configs older than this many hours (default: 24)
    """
    warp = get_warp_service()
    removed = warp.cleanup_old_configs(max_age_hours)

    return {
        "success": True,
        "removed_count": removed,
        "message": f"Removed {removed} old launch configuration(s)",
    }


# ─────────────────────────────────────────────────────────────
# Context Window Meter API
# ─────────────────────────────────────────────────────────────


def _estimate_tokens(text: str) -> int:
    """Estimate token count from text (~4 characters per token)."""
    if not text:
        return 0
    return len(text) // 4


def _calculate_session_context_usage(
    state: dict,
    provider: str = "unknown",
    model: str = "unknown",
) -> ContextUsage:
    """Calculate context usage from session state."""
    max_tokens = get_context_limit(provider, model)

    # Estimate tokens for different components
    system_tokens = 1000  # Base system prompt estimate
    message_tokens = 0
    task_tokens = 0
    rag_tokens = 0

    # Messages
    messages = state.get("messages", [])
    for msg in messages:
        if isinstance(msg, dict):
            content = msg.get("content", "")
            if isinstance(content, str):
                message_tokens += _estimate_tokens(content)
        elif hasattr(msg, "content"):
            message_tokens += _estimate_tokens(str(msg.content))

    # Tasks
    tasks = state.get("tasks", {})
    for task in tasks.values():
        if hasattr(task, "title"):
            task_tokens += _estimate_tokens(task.title)
            task_tokens += _estimate_tokens(task.description)
            if task.result:
                task_tokens += _estimate_tokens(str(task.result))
            if task.error:
                task_tokens += _estimate_tokens(task.error)
        elif isinstance(task, dict):
            task_tokens += _estimate_tokens(task.get("title", ""))
            task_tokens += _estimate_tokens(task.get("description", ""))
            if task.get("result"):
                task_tokens += _estimate_tokens(str(task["result"]))
            if task.get("error"):
                task_tokens += _estimate_tokens(task["error"])

    # RAG context
    context = state.get("context", {})
    rag_context = context.get("rag_context", "")
    if rag_context:
        rag_tokens = _estimate_tokens(str(rag_context))

    current_tokens = system_tokens + message_tokens + task_tokens + rag_tokens

    return ContextUsage.calculate(
        current_tokens=current_tokens,
        max_tokens=max_tokens,
        provider=provider,
        model=model,
        system_tokens=system_tokens,
        message_tokens=message_tokens,
        task_tokens=task_tokens,
        rag_tokens=rag_tokens,
    )


@router.get("/sessions/{session_id}/context-usage", response_model=ContextUsage)
async def get_context_usage(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Get context window usage for a session.

    Returns:
    - current_tokens: Current tokens in context
    - max_tokens: Maximum context window size
    - percentage: Usage percentage (0-100)
    - level: Warning level (normal, warning, critical)
    - Breakdown by component (system, messages, tasks, RAG)
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get provider/model from environment
    provider = os.getenv("LLM_PROVIDER", "google")

    if provider == "google":
        model = os.getenv("GOOGLE_MODEL", "gemini-2.0-flash-exp")
    elif provider == "anthropic":
        model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
    elif provider == "openai":
        model = os.getenv("OPENAI_MODEL", "gpt-4o")
    elif provider == "ollama":
        model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
    else:
        model = "unknown"

    return _calculate_session_context_usage(state, provider, model)


# ─────────────────────────────────────────────────────────────
# Permission Toggles API
# ─────────────────────────────────────────────────────────────

# In-memory storage for session permissions
_session_permissions: dict[str, SessionPermissions] = {}


def _get_session_permissions(session_id: str) -> SessionPermissions:
    """Get or create session permissions."""
    if session_id not in _session_permissions:
        _session_permissions[session_id] = SessionPermissions()
    return _session_permissions[session_id]


@router.get("/sessions/{session_id}/permissions", response_model=SessionPermissionsResponse)
async def get_session_permissions(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Get current permission settings for a session.

    Returns all available permissions with their enabled/disabled state.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    perms = _get_session_permissions(session_id)

    # Build permission info list
    permission_infos = []
    for perm in AgentPermission:
        enabled = perm in perms.enabled_permissions
        permission_infos.append(get_permission_info(perm, enabled))

    return SessionPermissionsResponse(
        session_id=session_id,
        permissions=permission_infos,
        disabled_agents=list(perms.disabled_agents),
        agent_overrides={
            agent_id: list(perms_set)
            for agent_id, perms_set in perms.permission_overrides.items()
        },
    )


@router.put("/sessions/{session_id}/permissions", response_model=SessionPermissionsResponse)
async def update_session_permissions(
    session_id: str,
    request: UpdatePermissionsRequest,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Update permission settings for a session.

    Allows enabling/disabling specific permissions and agents.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    perms = _get_session_permissions(session_id)

    # Update enabled permissions
    if request.enabled_permissions is not None:
        perms.enabled_permissions = set(request.enabled_permissions)

    # Update disabled agents
    if request.disabled_agents is not None:
        perms.disabled_agents = set(request.disabled_agents)

    # Update agent overrides
    if request.agent_overrides is not None:
        perms.permission_overrides = {
            agent_id: set(perms_list)
            for agent_id, perms_list in request.agent_overrides.items()
        }

    # Build response
    permission_infos = []
    for perm in AgentPermission:
        enabled = perm in perms.enabled_permissions
        permission_infos.append(get_permission_info(perm, enabled))

    return SessionPermissionsResponse(
        session_id=session_id,
        permissions=permission_infos,
        disabled_agents=list(perms.disabled_agents),
        agent_overrides={
            agent_id: list(perms_set)
            for agent_id, perms_set in perms.permission_overrides.items()
        },
    )


@router.post("/sessions/{session_id}/permissions/toggle/{permission}")
async def toggle_permission(
    session_id: str,
    permission: AgentPermission,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Toggle a specific permission on/off.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    perms = _get_session_permissions(session_id)

    if permission in perms.enabled_permissions:
        perms.disable_permission(permission)
        enabled = False
    else:
        perms.enable_permission(permission)
        enabled = True

    return {
        "success": True,
        "permission": permission.value,
        "enabled": enabled,
    }


@router.post("/sessions/{session_id}/permissions/agents/{agent_id}/toggle")
async def toggle_agent(
    session_id: str,
    agent_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Enable/disable a specific agent.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    perms = _get_session_permissions(session_id)

    if agent_id in perms.disabled_agents:
        perms.enable_agent(agent_id)
        enabled = True
    else:
        perms.disable_agent(agent_id)
        enabled = False

    return {
        "success": True,
        "agent_id": agent_id,
        "enabled": enabled,
    }
