"""세션 요약 배치 라우트 (`/summaries`).

요약이 없는 세션 수를 세고, 여러 세션의 AI 요약을 한 번에 생성한다. 개별
세션의 요약 생성·조회(`/{session_id}/summary`)는 `sessions` 모듈에 있다 —
여기는 **배치 처리**가 책임이다.

배치 생성은 Ollama 부하를 고려해 요청 간 지연과 재시도를 둔다.

경로가 3세그먼트라 다른 모듈의 경로를 가리지 않는다.
"""

import logging

from fastapi import APIRouter, Depends

from api.deps import get_current_admin_or_manager_user
from services.claude_session_monitor import get_monitor

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_admin_or_manager_user)])


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
