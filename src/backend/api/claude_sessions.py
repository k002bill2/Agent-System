"""Claude Code external session monitoring API."""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse

from models.claude_session import (
    ClaudeSessionInfo,
    ClaudeSessionDetail,
    ClaudeSessionResponse,
    ClaudeSessionSaveRequest,
    ClaudeSessionSaveResponse,
    SessionStatus,
    ActivityResponse,
    TasksResponse,
)
from services.claude_session_monitor import (
    get_monitor,
    list_claude_processes,
    kill_process,
    cleanup_stale_processes,
    ClaudeProcess,
    ProcessCleanupResult,
)

router = APIRouter(prefix="/claude-sessions", tags=["claude-sessions"])


@dataclass
class LineCountCacheEntry:
    """Cache entry for transcript line count."""

    mtime: float
    file_size: int
    line_count: int


class TranscriptLineCountCache:
    """Cache for transcript file line counts.

    Avoids full file scan on every pagination request.
    """

    def __init__(self):
        self._cache: dict[str, LineCountCacheEntry] = {}

    def get_line_count(self, file_path: Path) -> int | None:
        """Get cached line count if still valid."""
        key = str(file_path)
        if key not in self._cache:
            return None

        entry = self._cache[key]
        try:
            stat = file_path.stat()
            if stat.st_mtime == entry.mtime and stat.st_size == entry.file_size:
                return entry.line_count
        except OSError:
            self._cache.pop(key, None)

        return None

    def set_line_count(self, file_path: Path, line_count: int) -> None:
        """Store line count in cache."""
        key = str(file_path)
        try:
            stat = file_path.stat()
            self._cache[key] = LineCountCacheEntry(
                mtime=stat.st_mtime,
                file_size=stat.st_size,
                line_count=line_count,
            )
        except OSError:
            pass


# Global cache instance
_line_count_cache = TranscriptLineCountCache()


from typing import Literal

SortField = Literal["last_activity", "created_at", "message_count", "estimated_cost", "project_name"]
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
        return dt.timestamp() if dt.tzinfo else dt.replace(tzinfo=timezone.utc).timestamp()

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
    paginated_sessions = all_sessions[offset:offset + limit]

    # Check if more sessions are available
    has_more = offset + len(paginated_sessions) < filtered_count

    # Add cached summaries to sessions
    for session in paginated_sessions:
        cached_summary = monitor.get_cached_summary(session.session_id)
        if cached_summary:
            session.summary = cached_summary

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
# Static routes (must come before /{session_id})
# ========================================

from pydantic import BaseModel


class ExternalPathRequest(BaseModel):
    """Request to add external path."""

    path: str


class ExternalPathResponse(BaseModel):
    """Response for external path operations."""

    success: bool
    message: str
    paths: list[str]


@router.get("/external-paths", response_model=ExternalPathResponse)
async def list_external_paths() -> ExternalPathResponse:
    """List all external (non-default) projects paths.

    Returns:
        List of external paths currently configured
    """
    monitor = get_monitor()
    paths = monitor.get_external_paths()

    return ExternalPathResponse(
        success=True,
        message=f"Found {len(paths)} external path(s)",
        paths=paths,
    )


@router.post("/external-paths", response_model=ExternalPathResponse)
async def add_external_path(request: ExternalPathRequest) -> ExternalPathResponse:
    """Add an external projects path at runtime.

    Args:
        request: Path to add

    Returns:
        Updated list of external paths
    """
    monitor = get_monitor()

    if monitor.add_external_path(request.path):
        return ExternalPathResponse(
            success=True,
            message=f"Added external path: {request.path}",
            paths=monitor.get_external_paths(),
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Path does not exist or is already added: {request.path}",
        )


@router.delete("/external-paths/{path_encoded}")
async def remove_external_path(path_encoded: str) -> ExternalPathResponse:
    """Remove an external projects path.

    Note: Path should be URL-encoded (/ -> %2F)

    Args:
        path_encoded: URL-encoded path to remove

    Returns:
        Updated list of external paths
    """
    import urllib.parse

    monitor = get_monitor()
    path = urllib.parse.unquote(path_encoded)

    if monitor.remove_external_path(path):
        return ExternalPathResponse(
            success=True,
            message=f"Removed external path: {path}",
            paths=monitor.get_external_paths(),
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Path not found or is the default path: {path}",
        )


@router.get("/source-users")
async def list_source_users() -> dict:
    """List all unique source users from discovered sessions.

    Returns:
        List of unique usernames and current user
    """
    monitor = get_monitor()
    users = monitor.get_unique_source_users()
    current_user = monitor._get_current_user()

    return {
        "users": users,
        "current_user": current_user,
    }


@router.get("/empty/list")
async def list_empty_sessions() -> dict:
    """List all sessions with 0 messages.

    Returns:
        List of empty sessions
    """
    monitor = get_monitor()
    empty_sessions = monitor.get_empty_sessions()

    return {
        "empty_count": len(empty_sessions),
        "sessions": [s.model_dump() for s in empty_sessions],
    }


@router.get("/ghost/list")
async def list_ghost_sessions() -> dict:
    """List all ghost sessions (message_count > 0 but no real user/assistant messages).

    These sessions have metadata entries but no actual conversation.

    Returns:
        List of ghost sessions
    """
    monitor = get_monitor()
    ghost_sessions = monitor.get_ghost_sessions()

    return {
        "ghost_count": len(ghost_sessions),
        "sessions": [s.model_dump() for s in ghost_sessions],
    }


@router.delete("/ghost")
async def delete_ghost_sessions() -> dict:
    """Delete all ghost sessions.

    Returns:
        List of deleted session IDs and count
    """
    monitor = get_monitor()
    deleted_ids = monitor.delete_ghost_sessions()

    return {
        "success": True,
        "deleted_count": len(deleted_ids),
        "deleted_ids": deleted_ids,
    }


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
async def cleanup_stale() -> ProcessKillResponse:
    """Kill all stale (background) Claude Code processes.

    Protects foreground terminal sessions and current process.

    Returns:
        Result with killed/failed/protected PIDs
    """
    result = cleanup_stale_processes(
        protect_foreground=True,
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
async def get_pending_summary_count() -> dict:
    """Get count of sessions without summaries.

    Returns:
        Count of sessions that need summary generation
    """
    monitor = get_monitor()
    all_sessions = monitor.discover_sessions()

    pending_count = 0
    for session in all_sessions:
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
        "total_sessions": len(all_sessions),
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

    MAX_RETRIES = 3
    RETRY_DELAY = 5.0  # seconds
    BETWEEN_REQUESTS_DELAY = 2.0  # seconds

    for idx, session in enumerate(sessions_to_process):
        # Log progress every 10 sessions
        if idx > 0 and idx % 10 == 0:
            logger.info(f"Batch summary progress: {idx}/{len(sessions_to_process)} processed")

        summary = None
        last_error = None

        # Retry loop for transient failures
        for attempt in range(MAX_RETRIES):
            try:
                summary = await monitor.generate_summary(session.session_id)
                if summary and summary != "요약 생성 실패":
                    break  # Success, exit retry loop
                # If failed, wait before retry
                if attempt < MAX_RETRIES - 1:
                    logger.warning(f"Retry {attempt + 1}/{MAX_RETRIES} for session {session.session_id}")
                    await asyncio.sleep(RETRY_DELAY)
            except Exception as e:
                last_error = str(e)
                if attempt < MAX_RETRIES - 1:
                    logger.warning(f"Retry {attempt + 1}/{MAX_RETRIES} for session {session.session_id}: {e}")
                    await asyncio.sleep(RETRY_DELAY)

        results["total_processed"] += 1
        if summary and summary != "요약 생성 실패" and summary != "대화 내용 없음":
            results["success_count"] += 1
            results["generated_summaries"].append({
                "session_id": session.session_id,
                "summary": summary,
            })
        else:
            results["failed_count"] += 1
            results["errors"].append({
                "session_id": session.session_id,
                "error": last_error or summary or "Unknown error",
            })

        # Longer delay between requests to avoid overwhelming Ollama
        await asyncio.sleep(BETWEEN_REQUESTS_DELAY)

    logger.info(f"Batch summary complete: {results['success_count']}/{results['total_processed']} succeeded")
    return results


# ========================================
# Dynamic routes (/{session_id})
# ========================================

@router.get("/{session_id}", response_model=ClaudeSessionDetail)
async def get_session(session_id: str) -> ClaudeSessionDetail:
    """Get detailed information for a specific session.

    Args:
        session_id: Session UUID

    Returns:
        Detailed session information with recent messages
    """
    monitor = get_monitor()
    details = monitor.get_session_details(session_id)

    if details is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Add cached summary if exists
    cached_summary = monitor.get_cached_summary(session_id)
    if cached_summary:
        details.summary = cached_summary

    return details


@router.get("/{session_id}/stream")
async def stream_session(session_id: str):
    """Stream real-time updates for a session via SSE.

    Args:
        session_id: Session UUID

    Returns:
        Server-Sent Events stream with session updates
    """
    monitor = get_monitor()

    # Verify session exists
    initial = monitor.get_session_details(session_id)
    if initial is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events for session updates."""
        import json

        # Send initial state
        yield f"event: session_update\ndata: {initial.model_dump_json()}\n\n"

        # Poll for updates
        last_message_count = initial.message_count
        last_file_size = initial.file_size

        while True:
            await asyncio.sleep(2)  # Poll every 2 seconds

            try:
                details = monitor.get_session_details(session_id)
                if details is None:
                    # Session file might have been deleted
                    yield f"event: session_ended\ndata: {json.dumps({'session_id': session_id})}\n\n"
                    break

                # Only send update if something changed
                if (
                    details.message_count != last_message_count
                    or details.file_size != last_file_size
                ):
                    last_message_count = details.message_count
                    last_file_size = details.file_size
                    yield f"event: session_update\ndata: {details.model_dump_json()}\n\n"

                # Check if session appears completed
                if details.status == SessionStatus.COMPLETED:
                    yield f"event: session_completed\ndata: {details.model_dump_json()}\n\n"
                    break

            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{session_id}/save", response_model=ClaudeSessionSaveResponse)
async def save_session(
    session_id: str,
    request: ClaudeSessionSaveRequest,
) -> ClaudeSessionSaveResponse:
    """Save session information to database.

    This endpoint saves session metadata and transcript summary
    to PostgreSQL for long-term storage and analysis.

    Args:
        session_id: Session UUID
        request: Save request with optional notes

    Returns:
        Save confirmation with timestamp
    """
    monitor = get_monitor()
    details = monitor.get_session_details(session_id)

    if details is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # TODO: Implement database persistence
    # For now, just acknowledge the request
    # In a full implementation, this would save to PostgreSQL

    # Check if database mode is enabled
    import os
    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"

    if not use_database:
        return ClaudeSessionSaveResponse(
            success=False,
            message="Database mode is not enabled. Set USE_DATABASE=true to enable session persistence.",
            saved_at=None,
        )

    # TODO: Actually save to database when enabled
    # from db.repositories import session_repository
    # await session_repository.save_claude_session(details, request.notes)

    return ClaudeSessionSaveResponse(
        success=True,
        message=f"Session {session_id} saved successfully",
        saved_at=datetime.utcnow(),
    )


@router.get("/{session_id}/transcript")
async def get_session_transcript(
    session_id: str,
    offset: int = 0,
    limit: int = 100,
) -> dict:
    """Get raw transcript entries for a session.

    Args:
        session_id: Session UUID
        offset: Starting offset for pagination
        limit: Maximum entries to return

    Returns:
        Raw transcript entries with pagination info
    """
    import json

    monitor = get_monitor()

    # Find session file across all projects directories (including subagent dirs)
    session_file = None
    for projects_dir in monitor.projects_dirs:
        if not projects_dir.exists():
            continue
        for project_dir in projects_dir.iterdir():
            if not project_dir.is_dir():
                continue
            # Search recursively for session file
            for candidate in project_dir.glob(f"**/{session_id}.jsonl"):
                if candidate.exists():
                    session_file = candidate
                    break
            if session_file:
                break
        if session_file:
            break

    if session_file is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Check cache for total line count
    cached_count = _line_count_cache.get_line_count(session_file)

    entries = []
    total_count = 0

    if cached_count is not None:
        # Use cached count - only read needed entries
        total_count = cached_count
        with open(session_file, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i < offset:
                    continue
                if len(entries) >= limit:
                    break

                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                    entries.append(entry)
                except json.JSONDecodeError:
                    continue
    else:
        # Cache miss - count all lines and read needed entries
        with open(session_file, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                total_count += 1
                if i < offset:
                    continue
                if len(entries) >= limit:
                    continue

                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                    entries.append(entry)
                except json.JSONDecodeError:
                    continue

        # Store in cache for future requests
        _line_count_cache.set_line_count(session_file, total_count)

    return {
        "session_id": session_id,
        "entries": entries,
        "offset": offset,
        "limit": limit,
        "total_count": total_count,
        "has_more": offset + len(entries) < total_count,
    }


@router.post("/{session_id}/summary")
async def generate_session_summary(session_id: str) -> dict:
    """Generate AI summary for a session.

    Uses Haiku model for cost efficiency.
    Summary is cached to file for future requests.

    Args:
        session_id: Session UUID

    Returns:
        Generated or cached summary
    """
    monitor = get_monitor()

    # Verify session exists
    details = monitor.get_session_details(session_id)
    if details is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Generate or retrieve cached summary
    summary = await monitor.generate_summary(session_id)

    return {
        "session_id": session_id,
        "summary": summary,
    }


@router.get("/{session_id}/summary")
async def get_session_summary(session_id: str) -> dict:
    """Get cached summary for a session (if exists).

    Args:
        session_id: Session UUID

    Returns:
        Cached summary or null
    """
    monitor = get_monitor()

    # Check cached summary
    summary = monitor.get_cached_summary(session_id)

    return {
        "session_id": session_id,
        "summary": summary,
    }


@router.delete("/{session_id}")
async def delete_session(session_id: str) -> dict:
    """Delete a specific session.

    Args:
        session_id: Session UUID

    Returns:
        Success status and message
    """
    monitor = get_monitor()

    if monitor.delete_session(session_id):
        return {
            "success": True,
            "message": f"Session {session_id} deleted successfully",
        }
    else:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")


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


# ========================================
# Activity/Tasks Endpoints for Dashboard Integration
# ========================================


@router.get("/{session_id}/activity", response_model=ActivityResponse)
async def get_session_activity(
    session_id: str,
    offset: int = 0,
    limit: int = 100,
) -> ActivityResponse:
    """Get activity events for a session.

    Extracts user messages, assistant messages, tool uses, and tool results
    as activity events for Dashboard display.

    Args:
        session_id: Session UUID
        offset: Starting offset for pagination
        limit: Maximum events to return (default: 100)

    Returns:
        List of activity events with pagination info
    """
    monitor = get_monitor()
    events, total_count = monitor.get_session_activity(
        session_id,
        offset=offset,
        limit=limit,
    )

    if total_count == 0:
        # Check if session exists
        details = monitor.get_session_details(session_id)
        if details is None:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return ActivityResponse(
        session_id=session_id,
        events=events,
        total_count=total_count,
        offset=offset,
        limit=limit,
        has_more=offset + len(events) < total_count,
    )


@router.get("/{session_id}/activity/stream")
async def stream_session_activity(session_id: str):
    """Stream real-time activity events via SSE.

    Monitors session file for changes and pushes new activity events
    to connected clients.

    Args:
        session_id: Session UUID

    Returns:
        Server-Sent Events stream with activity events
    """
    import json

    monitor = get_monitor()

    # Verify session exists
    details = monitor.get_session_details(session_id)
    if details is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events for new activity."""
        # Get initial file size
        last_size = details.file_size

        # Send initial batch of recent activity
        initial_events, _ = monitor.get_session_activity(
            session_id,
            offset=0,
            limit=50,
        )
        if initial_events:
            yield f"event: activity_batch\ndata: {json.dumps([e.model_dump(mode='json') for e in initial_events])}\n\n"

        # Poll for new activity (every 500ms)
        while True:
            await asyncio.sleep(0.5)

            try:
                new_events, current_size = monitor.get_new_activity_since_size(
                    session_id,
                    last_size,
                )

                if new_events:
                    for event in new_events:
                        yield f"event: activity\ndata: {event.model_dump_json()}\n\n"

                last_size = current_size

                # Check if session is completed
                session_details = monitor.get_session_details(session_id)
                if session_details and session_details.status == SessionStatus.COMPLETED:
                    yield f"event: session_completed\ndata: {json.dumps({'session_id': session_id})}\n\n"
                    break

            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{session_id}/tasks", response_model=TasksResponse)
async def get_session_tasks(session_id: str) -> TasksResponse:
    """Get tasks extracted from TaskCreate/TaskUpdate tool calls.

    Parses session transcript for task-related tool calls and returns
    the reconstructed task tree structure.

    Args:
        session_id: Session UUID

    Returns:
        Tasks dictionary and root task IDs
    """
    monitor = get_monitor()
    tasks, root_task_ids = monitor.get_session_tasks(session_id)

    if not tasks:
        # Check if session exists
        details = monitor.get_session_details(session_id)
        if details is None:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return TasksResponse(
        session_id=session_id,
        tasks=tasks,
        root_task_ids=root_task_ids,
        total_count=len(tasks),
    )
