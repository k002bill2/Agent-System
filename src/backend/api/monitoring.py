"""Monitoring API routes.

Obsidian vault health checks: links, frontmatter, orphans, images via SSE streaming.
"""

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from models.monitoring import (
    CheckCompletedPayload,
    CheckProgressPayload,
    CheckResult,
    CheckStartedPayload,
    CheckStatus,
    ProjectHealth,
)
from models.project import get_project
from services.project_runner import get_check_config, get_runner

router = APIRouter(tags=["orchestration"])

# In-memory storage for project health (could be replaced with DB)
_project_health: dict[str, ProjectHealth] = {}


class CheckResponse(BaseModel):
    """Response for check result."""

    project_id: str
    check_type: str
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


class CheckConfigEntry(BaseModel):
    """Config for a single check type."""

    label: str
    command: str


class CheckConfigResponse(BaseModel):
    """Response for project health check config."""

    project_id: str
    checks: dict[str, CheckConfigEntry]
    check_types: list[str] = []


@router.get("/projects/{project_id}/health-config", response_model=CheckConfigResponse)
async def get_health_config(project_id: str):
    """Get the health check configuration (labels & commands) for a project."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    config = get_check_config(project.path)
    return CheckConfigResponse(
        project_id=project_id,
        checks={k: CheckConfigEntry(**v) for k, v in config.items()},
        check_types=list(config.keys()),
    )


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

    config = get_check_config(project.path)
    return ProjectHealthResponse(
        project_id=health.project_id,
        project_name=health.project_name,
        project_path=health.project_path,
        checks={
            check_id: CheckResponse(
                project_id=project_id,
                check_type=check_id,
                status=health.checks.get(check_id, CheckResult(check_type=check_id)).status,
                exit_code=health.checks.get(check_id, CheckResult(check_type=check_id)).exit_code,
                duration_ms=health.checks.get(
                    check_id, CheckResult(check_type=check_id)
                ).duration_ms,
                stdout=health.checks.get(check_id, CheckResult(check_type=check_id)).stdout,
                stderr=health.checks.get(check_id, CheckResult(check_type=check_id)).stderr,
            )
            for check_id in config
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
        config = get_check_config(project.path)

        for check_id in config:
            try:
                async for event in runner.stream_check(project_id, check_id):
                    if isinstance(event, CheckStartedPayload):
                        _project_health[project_id].update_check(
                            CheckResult(
                                check_type=check_id,
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
                                check_type=check_id,
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
                error_data = json.dumps({"error": str(e), "check_type": check_id})
                yield f"event: error\ndata: {error_data}\n\n"

        yield "event: all_checks_done\ndata: {}\n\n"

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
async def run_check(project_id: str, check_type: str):
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

    config = get_check_config(project.path)
    if check_type not in config:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid check type: {check_type}. Valid types: {list(config.keys())}",
        )

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
