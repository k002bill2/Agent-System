"""디스크에서 발견한 Claude 세션을 DB 스냅샷으로 백그라운드 동기화한다.

라우트가 없는 유일한 모듈이다. HTTP 표면이 아니라 **비-라우트 공개 진입점**을
제공한다 — `scan_and_sync_claude_snapshots` 를 `api/external_usage.py:141` 이
직접 호출해 External Usage /sync 가 Claude Sessions 페이지 방문 없이도
호스트 세션 스냅샷을 갱신한다.

`core` 의 `list_sessions` 도 `_sync_sessions_to_db` 를 fire-and-forget 으로
호출한다 — 이 패키지의 유일한 모듈 간 의존 엣지다.

**`tests/backend/test_claude_session_sync.py` 의 패치 대상이 이 모듈이다.**
`get_monitor` 와 `_sync_sessions_to_db` 를 여기 네임스페이스에 바인딩하므로,
패키지 `__init__` 을 패치하면 패치는 성공하고 호출은 원본을 타서 조용히
무효가 된다.
"""

import asyncio
import logging

from services.claude_session_monitor import get_monitor
from utils.time import utcnow

logger = logging.getLogger(__name__)

# Track file mtime+size to detect changes (avoids redundant DB writes)
_sync_cache: dict[str, tuple[float, int]] = {}
_sync_lock = asyncio.Lock()


async def _sync_sessions_to_db(sessions: list) -> None:
    """Sync discovered sessions to DB in background. Only upserts changed files."""
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return

    try:
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models.claude_session import ClaudeSessionSnapshotModel

        async with _sync_lock:
            # Find sessions with changed files
            changed = []
            for s in sessions:
                fp = s.file_path
                key = (s.file_size, hash(fp))
                cached = _sync_cache.get(s.session_id)
                current = (getattr(s, "_file_mtime", 0) or s.file_size, s.file_size)
                if cached != current:
                    changed.append(s)

            if not changed:
                return

            now = utcnow()
            async with async_session_factory() as db:
                for s in changed:
                    result = await db.execute(
                        select(ClaudeSessionSnapshotModel).where(
                            ClaudeSessionSnapshotModel.id == s.session_id
                        )
                    )
                    existing = result.scalar_one_or_none()

                    data = {
                        "slug": s.slug,
                        "model": s.model,
                        "project_path": s.project_path,
                        "project_name": s.project_name,
                        "git_branch": s.git_branch,
                        "cwd": s.cwd,
                        "version": s.version,
                        "status": s.status.value if hasattr(s.status, "value") else str(s.status),
                        "source_user": s.source_user,
                        "source_path": s.source_path,
                        "message_count": s.message_count,
                        "user_message_count": s.user_message_count,
                        "assistant_message_count": s.assistant_message_count,
                        "tool_call_count": s.tool_call_count,
                        "total_input_tokens": s.total_input_tokens,
                        "total_output_tokens": s.total_output_tokens,
                        "estimated_cost": s.estimated_cost,
                        "file_path": s.file_path,
                        "file_size": s.file_size,
                        "updated_at": now,
                    }

                    if existing:
                        for key, value in data.items():
                            setattr(existing, key, value)
                    else:
                        snapshot = ClaudeSessionSnapshotModel(
                            id=s.session_id,
                            **data,
                            session_created_at=s.created_at,
                            session_last_activity=s.last_activity,
                            created_at=now,
                        )
                        db.add(snapshot)

                    _sync_cache[s.session_id] = (s.file_size, s.file_size)

                await db.commit()
                logger.debug(f"Synced {len(changed)} claude sessions to DB")

    except Exception as e:
        logger.warning(f"Background session sync failed: {e}")


async def scan_and_sync_claude_snapshots() -> int:
    """Scan ~/.claude/projects and upsert Claude session snapshots.

    Returns the number of discovered sessions. Used by External Usage /sync so
    the CLAUDE_CLI card reflects the latest host sessions without requiring a
    prior visit to the Claude Sessions page (snapshot freshness follow-up).
    """
    sessions = get_monitor().discover_sessions()
    await _sync_sessions_to_db(sessions)
    return len(sessions)
