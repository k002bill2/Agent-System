"""모니터링 대상 관리·조회 라우트.

`/paths` · `/external-paths` (감시 경로 등록·해제), `/{project_id}/remove`
(모니터링에서 제외), `/stream` (설정 변경 SSE), `/by-path` · `/{project_id}`
(프로젝트 요약 조회).

**핸들러 선언 순서가 계약이다 (두 겹):**

  1. `GET /{project_id}`(맨 뒤)가 `/paths` · `/stream` · `/by-path` 를 삼킨다.
     원본대로 마지막에 두는 것이 유일한 방어다.
  2. `DELETE /external-paths/{path_encoded}` 가 `DELETE /{project_id}/remove`
     보다 **먼저**여야 한다. 둘은 서로를 완전히 가리지는 않지만 URL
     `/project-configs/external-paths/remove` 가 양쪽에 매칭돼 먼저 등록된
     쪽이 이긴다. `shadowing_pairs()` 는 이 부분 겹침을 못 잡으므로
     `test_external_paths_precedes_project_remove` 가 따로 고정한다."""

import logging
import os
from collections.abc import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.project_config import (
    ExternalPathRequest,
    ProjectConfigSummary,
)
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/paths")
async def list_monitored_paths() -> dict:
    """List all monitored project paths.

    Returns:
        All paths being monitored and external paths
    """
    monitor = get_project_config_monitor()

    return {
        "monitored_paths": monitor.get_monitored_paths(),
        "external_paths": monitor.get_external_paths(),
    }


@router.post("/external-paths")
async def add_external_path(request: ExternalPathRequest) -> dict:
    """Add an external project path at runtime.

    The path does not need to contain a .claude/ directory.
    Projects without .claude/ will show empty configuration.

    Args:
        request: Path to add

    Returns:
        Success status and updated paths
    """
    monitor = get_project_config_monitor()

    if monitor.add_external_project(request.path):
        return {
            "success": True,
            "message": f"Added external path: {request.path}",
            "monitored_paths": monitor.get_monitored_paths(),
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid path or already added: {request.path}. Path must exist and be a directory.",
        )


@router.delete("/external-paths/{path_encoded}")
async def remove_external_path(path_encoded: str) -> dict:
    """Remove an external project path.

    Note: Path should be URL-encoded (/ -> %2F)

    Args:
        path_encoded: URL-encoded path to remove

    Returns:
        Success status and updated paths
    """
    import urllib.parse

    monitor = get_project_config_monitor()
    path = urllib.parse.unquote(path_encoded)

    if monitor.remove_external_project(path):
        return {
            "success": True,
            "message": f"Removed external path: {path}",
            "monitored_paths": monitor.get_monitored_paths(),
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Path not found: {path}",
        )


@router.delete("/{project_id}/remove")
async def remove_project_from_monitoring(project_id: str) -> dict:
    """Remove any project from monitoring (auto-discovered or external).

    This removes the project from the monitoring list but does NOT delete
    any source files.

    Args:
        project_id: Project identifier (encoded path)

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    # Get the project info first
    summary = monitor.get_project_summary(project_id)
    if summary is None:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    path = summary.project.project_path

    if monitor.remove_project(path):
        return {
            "success": True,
            "message": f"Removed project from monitoring: {path}",
            "project_id": project_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to remove project: {project_id}",
        )


@router.get("/stream")
async def stream_config_changes():
    """Stream real-time configuration changes via SSE.

    Watches all monitored projects for changes to:
    - mcp.json
    - hooks.json
    - skills/*/SKILL.md
    - agents/*.md

    Returns:
        Server-Sent Events stream with ConfigChangeEvent
    """
    monitor = get_project_config_monitor()

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events for config changes."""
        # Send initial connection confirmation
        yield 'event: connected\ndata: {"message": "Connected to config stream"}\n\n'

        # Watch for changes
        async for change in monitor.watch_configs(interval_seconds=2.0):
            event_data = change.model_dump_json()
            yield f"event: config_change\ndata: {event_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/by-path")
async def get_project_by_path(path: str) -> ProjectConfigSummary:
    """Get project configuration by filesystem path.

    Resolves symlinks to find the actual project path.
    Returns empty configuration if .claude/ directory doesn't exist.

    Args:
        path: Filesystem path to project (can be symlink)

    Returns:
        Complete project configuration summary
    """
    from pathlib import Path as PathLib

    monitor = get_project_config_monitor()
    is_docker = bool(os.getenv("CLAUDE_HOME"))

    # In Docker, host paths aren't accessible - don't resolve or validate
    if is_docker:
        resolved_path = PathLib(path)
    else:
        try:
            resolved_path = PathLib(path).resolve()
        except (OSError, RuntimeError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid path: {e}")

        if not resolved_path.exists():
            raise HTTPException(status_code=404, detail=f"Path does not exist: {resolved_path}")

    # Generate project_id from path
    project_id = str(resolved_path).replace("/", "-").replace("\\", "-")

    # Try to get summary
    summary = monitor.get_project_summary(project_id)

    if summary is None:
        # Project not in monitor's list, try to add it
        monitor.add_external_project(str(resolved_path))
        summary = monitor.get_project_summary(project_id)

    if summary is None:
        raise HTTPException(status_code=404, detail=f"Project not found: {resolved_path}")

    return summary


@router.get("/{project_id}", response_model=ProjectConfigSummary)
async def get_project_summary(project_id: str) -> ProjectConfigSummary:
    """Get full configuration summary for a project.

    Args:
        project_id: Project identifier (encoded path)

    Returns:
        Complete project configuration summary
    """
    monitor = get_project_config_monitor()
    summary = monitor.get_project_summary(project_id)

    if summary is None:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return summary
