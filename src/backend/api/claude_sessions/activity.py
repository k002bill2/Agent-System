"""대시보드 연동용 활동·태스크 라우트 (`/{session_id}/activity`, `/tasks`).

세션 트랜스크립트에서 추출한 활동 이벤트와 TaskCreate/TaskUpdate 도구 호출로
재구성한 태스크 트리를 제공한다. 활동은 폴링 SSE 스트림도 제공한다.

경로가 3세그먼트 이상이고 두 번째 세그먼트가 리터럴(`activity` · `tasks`)이라
다른 모듈의 경로를 가리지 않는다 — `sessions` 와 달리 include 순서 제약이 없다.
"""

import asyncio
from collections.abc import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.claude_session import (
    ActivityResponse,
    SessionStatus,
    TasksResponse,
)

from .sessions import _resolve_session

router = APIRouter()


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
    monitor, details = _resolve_session(session_id)
    events, total_count = monitor.get_session_activity(
        session_id,
        offset=offset,
        limit=limit,
    )

    if total_count == 0:
        # Check if session exists
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

    monitor, details = _resolve_session(session_id)

    # Verify session exists
    if details is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if details.provider != "claude":
        raise HTTPException(status_code=409, detail="Codex activity streaming is not supported")

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
    monitor, details = _resolve_session(session_id)
    if details is not None and details.provider != "claude":
        return TasksResponse(
            session_id=session_id,
            tasks={},
            root_task_ids=[],
            total_count=0,
        )
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
