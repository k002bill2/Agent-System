"""개별 Claude 세션 라우트 (`/{session_id}`).

조회·SSE 스트림·DB 저장·트랜스크립트·요약·삭제 7개 라우트.

**이 모듈은 `__init__.py` 에서 마지막에 가까운 순서로 include 해야 한다.**
`GET /{session_id}` 와 `DELETE /{session_id}` 는 2세그먼트 파라미터 경로라
`sources`·`discovery` 의 구체 경로(`/external-paths` · `/source-users` ·
`/projects` · `/processes` · `/ghost`)를 전부 가린다. 실측으로 5쌍 확인됐다.
`test_no_shadowing_route_pairs` 가 이 계약을 강제한다.

트랜스크립트 줄 수 캐시는 `get_session_transcript` 단독 소비자라 여기 둔다
(`_shared.py` 로 승격하지 않는다 — 소비자가 하나면 공용이 아니다).
"""

import asyncio
import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from api.deps import get_current_admin_or_manager_user
from models.claude_session import (
    ClaudeSessionDetail,
    ClaudeSessionSaveRequest,
    ClaudeSessionSaveResponse,
    SessionStatus,
)
from services.claude_session_monitor import get_monitor
from utils.time import utcnow

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_admin_or_manager_user)])


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

    # Check if database mode is enabled
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"

    if not use_database:
        return ClaudeSessionSaveResponse(
            success=False,
            message="Database mode is not enabled. Set USE_DATABASE=true to enable session persistence.",
            saved_at=None,
        )

    # Save session snapshot to database
    from sqlalchemy import select

    from db.database import get_db
    from db.models.claude_session import ClaudeSessionSnapshotModel

    try:
        async with get_db() as db:
            # Upsert: update if exists, create if not
            existing = await db.execute(
                select(ClaudeSessionSnapshotModel).where(
                    ClaudeSessionSnapshotModel.id == session_id
                )
            )
            snapshot = existing.scalar_one_or_none()

            now = utcnow()
            snapshot_data = {
                "slug": details.get("slug"),
                "model": details.get("model"),
                "project_path": details.get("project_path"),
                "project_name": details.get("project_name"),
                "git_branch": details.get("git_branch"),
                "cwd": details.get("cwd"),
                "version": details.get("version"),
                "status": details.get("status"),
                "source_user": details.get("source_user"),
                "source_path": details.get("source_path"),
                "message_count": details.get("message_count", 0),
                "user_message_count": details.get("user_message_count", 0),
                "assistant_message_count": details.get("assistant_message_count", 0),
                "tool_call_count": details.get("tool_call_count", 0),
                "total_input_tokens": details.get("total_input_tokens", 0),
                "total_output_tokens": details.get("total_output_tokens", 0),
                "estimated_cost": details.get("estimated_cost", 0.0),
                "file_path": details.get("file_path"),
                "file_size": details.get("file_size", 0),
                "summary": details.get("summary"),
                "notes": request.notes or None,
                "updated_at": now,
            }

            if snapshot:
                for key, value in snapshot_data.items():
                    setattr(snapshot, key, value)
            else:
                snapshot = ClaudeSessionSnapshotModel(
                    id=session_id,
                    **snapshot_data,
                    session_created_at=details.get("created_at"),
                    session_last_activity=details.get("last_activity"),
                    created_at=now,
                )
                db.add(snapshot)

        return ClaudeSessionSaveResponse(
            success=True,
            message=f"Session {session_id} saved successfully",
            saved_at=now,
        )
    except Exception as e:
        logger.error(f"Failed to save session {session_id}: {e}")
        return ClaudeSessionSaveResponse(
            success=False,
            message=f"Failed to save session: {str(e)}",
            saved_at=None,
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
        with open(session_file, encoding="utf-8") as f:
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
        with open(session_file, encoding="utf-8") as f:
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
