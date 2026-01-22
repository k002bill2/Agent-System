"""Claude Code external session monitoring API."""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.claude_session import (
    ClaudeSessionInfo,
    ClaudeSessionDetail,
    ClaudeSessionResponse,
    ClaudeSessionSaveRequest,
    ClaudeSessionSaveResponse,
    SessionStatus,
)
from services.claude_session_monitor import get_monitor

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

    for session in sessions_to_process:
        try:
            summary = await monitor.generate_summary(session.session_id)
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
                    "error": summary,
                })
        except Exception as e:
            results["total_processed"] += 1
            results["failed_count"] += 1
            results["errors"].append({
                "session_id": session.session_id,
                "error": str(e),
            })

        # Small delay to avoid overwhelming Ollama
        await asyncio.sleep(0.1)

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
