"""Monitoring API routes.

Project health checks: typecheck, lint, test, build via SSE streaming.
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
    CheckType,
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


class CheckConfigEntry(BaseModel):
    """Config for a single check type."""

    label: str
    command: str


class CheckConfigResponse(BaseModel):
    """Response for project health check config."""

    project_id: str
    checks: dict[str, CheckConfigEntry]


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
