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
    sort_by: SortField = "last_activity",
    sort_order: SortOrder = "desc",
    limit: int = 100000,
) -> ClaudeSessionResponse:
    """List all discovered Claude Code sessions.

    Args:
        status: Optional filter by session status
        sort_by: Field to sort by (last_activity, created_at, message_count, estimated_cost, project_name)
        sort_order: Sort order (asc, desc)
        limit: Maximum number of sessions to return

    Returns:
        List of sessions with counts
    """
    monitor = get_monitor()
    sessions = monitor.discover_sessions()

    # Filter by status if specified
    if status:
        sessions = [s for s in sessions if s.status == status]

    # Count active sessions (before sorting/limiting)
    active_count = sum(1 for s in sessions if s.status == SessionStatus.ACTIVE)

    # Sort sessions - use timestamp for datetime comparison to avoid timezone issues
    def get_timestamp(dt: datetime | None) -> float:
        if dt is None:
            return 0.0
        return dt.timestamp() if dt.tzinfo else dt.replace(tzinfo=timezone.utc).timestamp()

    reverse = sort_order == "desc"
    if sort_by == "last_activity":
        sessions.sort(key=lambda s: get_timestamp(s.last_activity), reverse=reverse)
    elif sort_by == "created_at":
        sessions.sort(key=lambda s: get_timestamp(s.created_at), reverse=reverse)
    elif sort_by == "message_count":
        sessions.sort(key=lambda s: s.message_count or 0, reverse=reverse)
    elif sort_by == "estimated_cost":
        sessions.sort(key=lambda s: s.estimated_cost or 0.0, reverse=reverse)
    elif sort_by == "project_name":
        sessions.sort(key=lambda s: s.project_name or "", reverse=reverse)

    # Apply limit
    sessions = sessions[:limit]

    # Add cached summaries to sessions
    for session in sessions:
        cached_summary = monitor.get_cached_summary(session.session_id)
        if cached_summary:
            session.summary = cached_summary

    return ClaudeSessionResponse(
        sessions=sessions,
        total_count=len(sessions),
        active_count=active_count,
    )


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

    # Find session file
    session_file = None
    for project_dir in monitor.projects_dir.iterdir():
        if not project_dir.is_dir():
            continue
        candidate = project_dir / f"{session_id}.jsonl"
        if candidate.exists():
            session_file = candidate
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
