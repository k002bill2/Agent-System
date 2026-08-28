"""Monitoring API routes.

Obsidian vault health checks: links, frontmatter, orphans, images via SSE streaming.
"""

import json
import os
from pathlib import Path
from typing import Literal, NamedTuple

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.deps import (
    get_current_user,
    get_db_session,
    reject_legacy_project_operation_in_database_mode,
    require_project_role,
)
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

# Returned when an authorized database-mode project carries no inspectable
# directory. Kept distinct from the generic dependency-failure detail so the
# two 503 causes stay separable by callers and by tests.
NO_MONITORED_PATH_DETAIL = "Project has no registered filesystem path for health monitoring"


class MonitoredProject(NamedTuple):
    """The one project this request may inspect, and the identity to report.

    ``project_id`` is the public identity echoed back to the client;
    ``path`` is the only filesystem location the request is allowed to touch.
    Both come from the same authoritative record, so a path-derived or
    client-supplied identifier can never widen the inspected location.
    """

    project_id: str
    name: str
    path: str


def _use_database() -> bool:
    return os.getenv("USE_DATABASE", "false").lower() == "true"


async def _resolve_database_project(project_id: str, db) -> MonitoredProject | None:
    """Resolve the canonical DB project row into an inspectable target.

    Only ``ProjectModel.id`` is matched — the path-derived identifiers used by
    the legacy filesystem registry and by ProjectConfigMonitor are deliberately
    not accepted here, so they cannot reach the filesystem through monitoring.

    Returns ``None`` when the registration has no usable directory. The caller
    keeps that fail-closed instead of guessing a path.
    """
    from sqlalchemy import select

    from db.models import ProjectModel

    try:
        result = await db.execute(
            select(ProjectModel).where(
                ProjectModel.id == project_id,
                ProjectModel.is_active == True,  # noqa: E712
            )
        )
        row = result.scalar_one_or_none()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project monitoring is temporarily unavailable",
        ) from exc

    if row is None:
        return None
    path = str(row.path or "").strip()
    if not path or not Path(path).is_dir():
        return None
    return MonitoredProject(project_id=str(row.id), name=str(row.name or ""), path=path)


async def _monitored_project(project_id: str, db) -> MonitoredProject:
    """Resolve the inspection target *after* the caller has authorized access.

    Database mode reads the DB registry, which is authoritative for both
    identity and path. Filesystem mode keeps the legacy registry lookup behind
    ``reject_legacy_project_operation_in_database_mode`` — that guard is
    unreachable from here in database mode by construction, and is kept as a
    standing assertion that the legacy branch never runs in that mode.
    """
    if _use_database():
        project = await _resolve_database_project(project_id, db)
        if project is None:
            raise HTTPException(status_code=503, detail=NO_MONITORED_PATH_DETAIL)
        return project

    reject_legacy_project_operation_in_database_mode()
    legacy = get_project(project_id)
    if not legacy:
        raise HTTPException(status_code=404, detail="Project not found")
    return MonitoredProject(project_id=project_id, name=legacy.name, path=legacy.path)


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


class MonitoringCapabilitiesResponse(BaseModel):
    """Capabilities exposed by the active project-monitoring backend."""

    project_id: str
    mode: Literal["filesystem", "database"]
    health_config: Literal["available", "disabled"]
    health: Literal["available", "disabled"]
    checks: Literal["available", "disabled"]
    reason: str | None = None


@router.get(
    "/projects/{project_id}/monitoring-capabilities",
    response_model=MonitoringCapabilitiesResponse,
)
async def get_monitoring_capabilities(
    project_id: str, current_user=Depends(get_current_user), db=Depends(get_db_session)
):
    """Report which monitoring operations this project supports.

    Database mode is served by the DB-backed handlers below, which inspect only
    the path registered on the project row. A project whose registration has no
    usable directory stays disabled — the endpoint never falls back to the
    legacy filesystem registry, so it cannot weaken the authorization boundary.
    """
    await require_project_role(project_id, current_user, db, min_role="viewer")
    if not _use_database():
        return MonitoringCapabilitiesResponse(
            project_id=project_id,
            mode="filesystem",
            health_config="available",
            health="available",
            checks="available",
        )

    project = await _resolve_database_project(project_id, db)
    if project is None:
        return MonitoringCapabilitiesResponse(
            project_id=project_id,
            mode="database",
            health_config="disabled",
            health="disabled",
            checks="disabled",
            reason=NO_MONITORED_PATH_DETAIL,
        )

    return MonitoringCapabilitiesResponse(
        project_id=project.project_id,
        mode="database",
        health_config="available",
        health="available",
        checks="available",
    )


@router.get("/projects/{project_id}/health-config", response_model=CheckConfigResponse)
async def get_health_config(
    project_id: str, current_user=Depends(get_current_user), db=Depends(get_db_session)
):
    """Get the health check configuration (labels & commands) for a project."""
    await require_project_role(project_id, current_user, db, min_role="viewer")
    project = await _monitored_project(project_id, db)

    config = get_check_config(project.path)
    return CheckConfigResponse(
        project_id=project.project_id,
        checks={k: CheckConfigEntry(**v) for k, v in config.items()},
        check_types=list(config.keys()),
    )


@router.get("/projects/{project_id}/health", response_model=ProjectHealthResponse)
async def get_project_health(
    project_id: str, current_user=Depends(get_current_user), db=Depends(get_db_session)
):
    """Get the health status of a project."""
    await require_project_role(project_id, current_user, db, min_role="viewer")
    project = await _monitored_project(project_id, db)
    project_id = project.project_id

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
async def run_all_checks(
    project_id: str, current_user=Depends(get_current_user), db=Depends(get_db_session)
):
    """
    Run all checks on a project sequentially.

    Returns a streaming response with SSE events for all checks.
    """
    await require_project_role(project_id, current_user, db, min_role="editor")
    project = await _monitored_project(project_id, db)
    project_id = project.project_id

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
async def run_check(
    project_id: str,
    check_type: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
):
    """
    Run a specific check on a project.

    Returns a streaming response with SSE events:
    - check_started: Check has started
    - check_progress: Output line from the check
    - check_completed: Check has finished
    """
    await require_project_role(project_id, current_user, db, min_role="editor")
    project = await _monitored_project(project_id, db)
    project_id = project.project_id

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
