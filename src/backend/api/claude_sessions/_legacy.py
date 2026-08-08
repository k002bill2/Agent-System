"""Claude Code external session monitoring API."""

import asyncio
import logging
from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from models.claude_session import (
    ClaudeSessionResponse,
    SessionStatus,
)
from services.claude_session_monitor import (
    cleanup_stale_processes,
    get_monitor,
    kill_process,
    list_claude_processes,
)

from .sync import _sync_sessions_to_db

router = APIRouter(prefix="/claude-sessions", tags=["claude-sessions"])


from typing import Literal

SortField = Literal[
    "last_activity", "created_at", "message_count", "estimated_cost", "project_name"
]
SortOrder = Literal["asc", "desc"]


@router.get("", response_model=ClaudeSessionResponse)
async def list_sessions(
    status: SessionStatus | None = None,
    project: str | None = None,
    source_user: str | None = None,
    sort_by: SortField = "last_activity",
    sort_order: SortOrder = "desc",
    offset: int = 0,
    limit: int = 30,
) -> ClaudeSessionResponse:
    """List all discovered Claude Code sessions with pagination.

    Args:
        status: Optional filter by session status
        project: Optional filter by project name
        source_user: Optional filter by source user (who owns the session)
        sort_by: Field to sort by (last_activity, created_at, message_count, estimated_cost, project_name)
        sort_order: Sort order (asc, desc)
        offset: Starting offset for pagination
        limit: Maximum number of sessions to return (default: 30)

    Returns:
        List of sessions with counts and pagination info
    """
    monitor = get_monitor()
    all_sessions = monitor.discover_sessions(source_user=source_user)

    # Count total before any filtering
    total_count = len(all_sessions)

    # Filter by status if specified
    if status:
        all_sessions = [s for s in all_sessions if s.status == status]

    # Filter by project if specified
    if project:
        all_sessions = [s for s in all_sessions if s.project_name == project]

    # Count after filtering (for pagination)
    filtered_count = len(all_sessions)

    # Count active sessions (before sorting/limiting)
    active_count = sum(1 for s in all_sessions if s.status == SessionStatus.ACTIVE)

    # Sort sessions - use timestamp for datetime comparison to avoid timezone issues
    def get_timestamp(dt: datetime | None) -> float:
        if dt is None:
            return 0.0
        return dt.timestamp() if dt.tzinfo else dt.replace(tzinfo=UTC).timestamp()

    reverse = sort_order == "desc"
    if sort_by == "last_activity":
        all_sessions.sort(key=lambda s: get_timestamp(s.last_activity), reverse=reverse)
    elif sort_by == "created_at":
        all_sessions.sort(key=lambda s: get_timestamp(s.created_at), reverse=reverse)
    elif sort_by == "message_count":
        all_sessions.sort(key=lambda s: s.message_count or 0, reverse=reverse)
    elif sort_by == "estimated_cost":
        all_sessions.sort(key=lambda s: s.estimated_cost or 0.0, reverse=reverse)
    elif sort_by == "project_name":
        all_sessions.sort(key=lambda s: s.project_name or "", reverse=reverse)

    # Apply pagination (offset + limit)
    paginated_sessions = all_sessions[offset : offset + limit]

    # Check if more sessions are available
    has_more = offset + len(paginated_sessions) < filtered_count

    # Add cached summaries to sessions
    for session in paginated_sessions:
        cached_summary = monitor.get_cached_summary(session.session_id)
        if cached_summary:
            session.summary = cached_summary

    # Background sync: save discovered sessions to DB (non-blocking)
    asyncio.create_task(_sync_sessions_to_db(all_sessions))

    return ClaudeSessionResponse(
        sessions=paginated_sessions,
        total_count=total_count,
        filtered_count=filtered_count,
        active_count=active_count,
        has_more=has_more,
        offset=offset,
        limit=limit,
    )


# ========================================
# Process Management Endpoints
# ========================================


class ProcessInfo(BaseModel):
    """Process information for API response."""

    pid: int
    version: str
    terminal: str
    state: str
    started: str
    cpu_time: str
    memory_mb: float
    is_foreground: bool
    is_current: bool
    command: str


class ProcessListResponse(BaseModel):
    """Response for process list."""

    processes: list[ProcessInfo]
    total_count: int
    foreground_count: int
    background_count: int


class ProcessKillRequest(BaseModel):
    """Request to kill processes."""

    pids: list[int]
    force: bool = False


class ProcessKillResponse(BaseModel):
    """Response for process kill operation."""

    success: bool
    killed: list[int]
    failed: list[dict]
    protected: list[int]
    message: str


@router.get("/processes", response_model=ProcessListResponse)
async def list_processes() -> ProcessListResponse:
    """List all running Claude Code processes.

    Returns:
        List of processes with metadata
    """
    processes = list_claude_processes()

    foreground_count = sum(1 for p in processes if p.is_foreground)
    background_count = len(processes) - foreground_count

    return ProcessListResponse(
        processes=[
            ProcessInfo(
                pid=p.pid,
                version=p.version,
                terminal=p.terminal,
                state=p.state,
                started=p.started,
                cpu_time=p.cpu_time,
                memory_mb=p.memory_mb,
                is_foreground=p.is_foreground,
                is_current=p.is_current,
                command=p.command,
            )
            for p in processes
        ],
        total_count=len(processes),
        foreground_count=foreground_count,
        background_count=background_count,
    )


@router.post("/processes/kill", response_model=ProcessKillResponse)
async def kill_processes(request: ProcessKillRequest) -> ProcessKillResponse:
    """Kill specific Claude Code processes.

    Args:
        request: List of PIDs to kill

    Returns:
        Result with killed/failed/protected PIDs
    """
    killed = []
    failed = []
    protected = []

    import os

    current_pid = os.getpid()
    parent_pid = os.getppid()

    for pid in request.pids:
        # Protect current session
        if pid == current_pid or pid == parent_pid:
            protected.append(pid)
            continue

        success, message = kill_process(pid, force=request.force)
        if success:
            killed.append(pid)
        else:
            failed.append({"pid": pid, "error": message})

    return ProcessKillResponse(
        success=len(killed) > 0 or len(failed) == 0,
        killed=killed,
        failed=failed,
        protected=protected,
        message=f"Killed {len(killed)} process(es), {len(failed)} failed, {len(protected)} protected",
    )


@router.post("/processes/cleanup-stale", response_model=ProcessKillResponse)
async def cleanup_stale(include_foreground: bool = False) -> ProcessKillResponse:
    """Kill stale Claude Code processes.

    By default only kills background processes.
    With include_foreground=True, also kills foreground processes
    (e.g. zombie AOS-spawned sessions stuck in terminal tabs).

    Args:
        include_foreground: Also kill foreground processes (except current)

    Returns:
        Result with killed/failed/protected PIDs
    """
    result = cleanup_stale_processes(
        protect_foreground=not include_foreground,
        protect_current=True,
    )

    return ProcessKillResponse(
        success=len(result.killed) > 0 or len(result.failed) == 0,
        killed=result.killed,
        failed=[{"pid": pid, "error": msg} for pid, msg in result.failed],
        protected=result.protected,
        message=f"Cleaned up {len(result.killed)} stale process(es)",
    )


@router.get("/summaries/pending-count")
async def get_pending_summary_count(project: str | None = None) -> dict:
    """Get count of sessions without summaries.

    Args:
        project: Optional project name to filter sessions

    Returns:
        Count of sessions that need summary generation
    """
    monitor = get_monitor()
    all_sessions = monitor.discover_sessions()

    pending_count = 0
    total_filtered = 0
    for session in all_sessions:
        # Filter by project if specified
        if project and getattr(session, "project_name", None) != project:
            continue
        total_filtered += 1
        # Skip empty and ghost sessions
        if session.message_count == 0:
            continue
        if session.user_message_count == 0 and session.assistant_message_count == 0:
            continue
        # Check if summary exists
        cached = monitor.get_cached_summary(session.session_id)
        if not cached:
            pending_count += 1

    return {
        "pending_count": pending_count,
        "total_sessions": total_filtered if project else len(all_sessions),
    }


@router.post("/summaries/generate-batch")
async def generate_batch_summaries(
    limit: int = 50,
    skip_existing: bool = True,
) -> dict:
    """Generate summaries for multiple sessions without summaries.

    Processes sessions in order of last activity (most recent first).
    Uses Ollama for cost-efficient batch processing.

    Args:
        limit: Maximum number of sessions to process (default: 50)
        skip_existing: Skip sessions that already have cached summaries (default: True)

    Returns:
        Processing results with success/failure counts
    """
    import asyncio

    monitor = get_monitor()
    all_sessions = monitor.discover_sessions()

    # Filter sessions without summaries
    sessions_to_process = []
    for session in all_sessions:
        if skip_existing:
            cached = monitor.get_cached_summary(session.session_id)
            if cached:
                continue
        # Skip empty and ghost sessions
        if session.message_count == 0:
            continue
        if session.user_message_count == 0 and session.assistant_message_count == 0:
            continue
        sessions_to_process.append(session)
        if len(sessions_to_process) >= limit:
            break

    # Process sessions
    results = {
        "total_processed": 0,
        "success_count": 0,
        "failed_count": 0,
        "skipped_count": len(all_sessions) - len(sessions_to_process),
        "generated_summaries": [],
        "errors": [],
    }

    max_retries = 3
    retry_delay = 5.0  # seconds
    between_requests_delay = 2.0  # seconds

    for idx, session in enumerate(sessions_to_process):
        # Log progress every 10 sessions
        if idx > 0 and idx % 10 == 0:
            logger.info(f"Batch summary progress: {idx}/{len(sessions_to_process)} processed")

        summary = None
        last_error = None

        # Retry loop for transient failures
        for attempt in range(max_retries):
            try:
                summary = await monitor.generate_summary(session.session_id)
                if summary and summary != "요약 생성 실패":
                    break  # Success, exit retry loop
                # If failed, wait before retry
                if attempt < max_retries - 1:
                    logger.warning(
                        f"Retry {attempt + 1}/{max_retries} for session {session.session_id}"
                    )
                    await asyncio.sleep(retry_delay)
            except Exception as e:
                last_error = str(e)
                if attempt < max_retries - 1:
                    logger.warning(
                        f"Retry {attempt + 1}/{max_retries} for session {session.session_id}: {e}"
                    )
                    await asyncio.sleep(retry_delay)

        results["total_processed"] += 1
        if summary and summary != "요약 생성 실패" and summary != "대화 내용 없음":
            results["success_count"] += 1
            results["generated_summaries"].append(
                {
                    "session_id": session.session_id,
                    "summary": summary,
                }
            )
        else:
            results["failed_count"] += 1
            results["errors"].append(
                {
                    "session_id": session.session_id,
                    "error": last_error or summary or "Unknown error",
                }
            )

        # Longer delay between requests to avoid overwhelming Ollama
        await asyncio.sleep(between_requests_delay)

    logger.info(
        f"Batch summary complete: {results['success_count']}/{results['total_processed']} succeeded"
    )
    return results


@router.delete("")
async def delete_empty_sessions() -> dict:
    """Delete all sessions with 0 messages.

    Returns:
        List of deleted session IDs and count
    """
    monitor = get_monitor()
    deleted_ids = monitor.delete_empty_sessions()

    return {
        "success": True,
        "deleted_count": len(deleted_ids),
        "deleted_ids": deleted_ids,
    }
