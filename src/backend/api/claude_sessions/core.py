"""세션 컬렉션 라우트 + 패키지의 집계 라우터 소유 모듈.

`GET /claude-sessions`(목록)와 `DELETE /claude-sessions`(빈 세션 일괄 삭제)
둘뿐이다. 두 라우트 모두 **경로 문자열이 비어 있어** 이 모듈이 prefix 를 가진
집계 라우터를 소유해야 한다 — 하위 모듈처럼 `APIRouter()` 로 만들면 prefix 와
path 가 둘 다 비어 FastAPI 가 "Prefix and path cannot be both empty" 로
거부한다. 경로를 `"/"` 로 바꾸는 것은 HTTP 표면 변경이라 하지 않는다.
`api/agents/core.py` 도 같은 이유로 같은 구조다.

목록 조회는 발견한 세션을 `sync._sync_sessions_to_db` 로 fire-and-forget
동기화한다 — 이 패키지의 유일한 모듈 간 의존 엣지다.
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends

from api.deps import get_current_admin_or_manager_user

logger = logging.getLogger(__name__)

from models.claude_session import (
    ClaudeSessionResponse,
    SessionStatus,
)
from services.claude_session_monitor import (
    get_monitor,
)
from services.codex_session_monitor import get_codex_monitor

from .sync import _sync_sessions_to_db

router = APIRouter(
    prefix="/claude-sessions",
    tags=["claude-sessions"],
    dependencies=[Depends(get_current_admin_or_manager_user)],
)


SortField = Literal[
    "last_activity", "created_at", "message_count", "estimated_cost", "project_name"
]
SortOrder = Literal["asc", "desc"]
ProviderFilter = Literal["all", "claude", "codex"]


@router.get("", response_model=ClaudeSessionResponse)
async def list_sessions(
    status: SessionStatus | None = None,
    project: str | None = None,
    source_user: str | None = None,
    provider: ProviderFilter = "claude",
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
    all_sessions = monitor.discover_sessions(source_user=source_user) if provider != "codex" else []
    if provider != "codex":
        codex_sessions = []
    else:
        codex_sessions = get_codex_monitor().discover_sessions()
    if provider == "all":
        codex_sessions = get_codex_monitor().discover_sessions()
    if source_user:
        codex_sessions = [
            session for session in codex_sessions if session.source_user == source_user
        ]
    all_sessions.extend(codex_sessions)

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

    # Add cached summaries to sessions. The card falls back to the slug, which
    # for Codex is the rollout timestamp — so a generated summary that is not
    # attached here stays invisible in the list.
    for session in paginated_sessions:
        summary_source = get_codex_monitor() if session.provider == "codex" else monitor
        cached_summary = summary_source.get_cached_summary(session.session_id)
        if cached_summary:
            session.summary = cached_summary

    # Background sync: save discovered sessions to DB (non-blocking)
    claude_sessions = [session for session in all_sessions if session.provider == "claude"]
    asyncio.create_task(_sync_sessions_to_db(claude_sessions))

    return ClaudeSessionResponse(
        sessions=paginated_sessions,
        total_count=total_count,
        filtered_count=filtered_count,
        active_count=active_count,
        has_more=has_more,
        offset=offset,
        limit=limit,
    )


@router.delete("")
async def delete_empty_sessions(
    _admin=Depends(get_current_admin_or_manager_user),
) -> dict:
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
