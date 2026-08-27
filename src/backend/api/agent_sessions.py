"""Provider-neutral alias for the external agent session API.

The original ``/claude-sessions`` routes remain available for compatibility.
This router exposes the same normalized contract without encoding a provider in
its resource name; provider-specific mutations still return a controlled 409.
"""

from fastapi import APIRouter, Depends, Query

from api.claude_sessions.activity import get_session_activity
from api.claude_sessions.core import ProviderFilter, SortField, SortOrder, list_sessions
from api.claude_sessions.sessions import (
    delete_session,
    generate_session_summary,
    get_session,
    get_session_summary,
    get_session_transcript,
    save_session,
    stream_session,
)
from api.deps import get_current_admin_or_manager_user
from models.claude_session import (
    ActivityResponse,
    ClaudeSessionDetail,
    ClaudeSessionResponse,
    ClaudeSessionSaveRequest,
    ClaudeSessionSaveResponse,
    SessionStatus,
)
from services.codex_session_monitor import MAX_TRANSCRIPT_LIMIT

# 라우터 레벨 ``dependencies`` 는 핸들러 *함수* 가 아니라 *라우터* 에 붙는다.
# 이 alias 는 ``api.claude_sessions`` 의 핸들러를 import 해 자기 라우터에 다시
# 등록하므로, 원본 하위 라우터 7 종이 선언한 정책은 따라오지 않는다 — 같은
# 정책을 여기서 다시 선언하지 않으면 인증만 벗겨진 동일 기능이 노출된다.
router = APIRouter(
    prefix="/agent-sessions",
    tags=["agent-sessions"],
    dependencies=[Depends(get_current_admin_or_manager_user)],
)


@router.get("", response_model=ClaudeSessionResponse)
async def list_agent_sessions(
    status: SessionStatus | None = None,
    project: str | None = None,
    source_user: str | None = None,
    provider: ProviderFilter = "all",
    sort_by: SortField = "last_activity",
    sort_order: SortOrder = "desc",
    offset: int = 0,
    limit: int = 30,
) -> ClaudeSessionResponse:
    """List normalized sessions from all or one provider."""
    return await list_sessions(
        status=status,
        project=project,
        source_user=source_user,
        provider=provider,
        sort_by=sort_by,
        sort_order=sort_order,
        offset=offset,
        limit=limit,
    )


@router.get("/{session_id}", response_model=ClaudeSessionDetail)
async def get_agent_session(session_id: str) -> ClaudeSessionDetail:
    """Get a normalized session detail."""
    return await get_session(session_id)


@router.get("/{session_id}/transcript")
async def get_agent_session_transcript(
    session_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(MAX_TRANSCRIPT_LIMIT, ge=1, le=MAX_TRANSCRIPT_LIMIT),
) -> dict:
    """Get a raw provider transcript with pagination."""
    return await get_session_transcript(session_id=session_id, offset=offset, limit=limit)


@router.get("/{session_id}/activity", response_model=ActivityResponse)
async def get_agent_session_activity(
    session_id: str, offset: int = 0, limit: int = 100
) -> ActivityResponse:
    """Get normalized activity for a session."""
    return await get_session_activity(session_id=session_id, offset=offset, limit=limit)


@router.get("/{session_id}/stream")
async def stream_agent_session(session_id: str):
    """Stream a session when its provider supports it."""
    return await stream_session(session_id)


@router.post("/{session_id}/save", response_model=ClaudeSessionSaveResponse)
async def save_agent_session(
    session_id: str, request: ClaudeSessionSaveRequest
) -> ClaudeSessionSaveResponse:
    """Save a provider session when persistence is supported."""
    return await save_session(session_id=session_id, request=request)


@router.post("/{session_id}/summary")
async def generate_agent_session_summary(session_id: str) -> dict:
    """Generate a summary when the provider supports it."""
    return await generate_session_summary(session_id)


@router.get("/{session_id}/summary")
async def get_agent_session_summary(session_id: str) -> dict:
    """Get a cached provider session summary."""
    return await get_session_summary(session_id)


@router.delete("/{session_id}")
async def delete_agent_session(session_id: str) -> dict:
    """Delete a session when the provider supports safe deletion."""
    return await delete_session(session_id)
