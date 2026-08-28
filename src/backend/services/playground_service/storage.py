"""세션 영속화 — 파일 I/O · DB 동기화 · 인메모리 캐시.

`_initialized` 는 `_load_sessions` 와 `load_sessions_from_db` 양쪽에서
재바인딩되므로 둘이 반드시 같은 모듈에 있어야 한다. `_sessions` 는 첨자
대입만 되고 재바인딩되지 않으므로 다른 모듈이 import 해도 같은 dict 를 본다.

`_load_sessions` · `_save_sessions` · `_fire_and_forget` 은 여기서 정의되지만
**호출자는 전부 `service.py`** 다. 테스트는 그래서 정의처가 아니라
`services.playground_service.service` 를 패치한다.
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any

from models.playground import PlaygroundExecution, PlaygroundMessage, PlaygroundSession
from utils.time import utcnow

from .config import SESSIONS_FILE, STORAGE_DIR, USE_DATABASE

logger = logging.getLogger(__name__)


try:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from db.models.playground import PlaygroundSessionModel

    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False
    AsyncSession = Any  # type: ignore
    PlaygroundSessionModel = None  # type: ignore


_sessions: dict[str, PlaygroundSession] = {}


_initialized = False


def _ensure_storage_dir():
    """Ensure storage directory exists."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _load_sessions():
    """Load sessions from persistent storage."""
    global _sessions, _initialized
    if _initialized:
        return

    _ensure_storage_dir()

    if SESSIONS_FILE.exists():
        try:
            with open(SESSIONS_FILE, encoding="utf-8") as f:
                data = json.load(f)
                for session_data in data:
                    # Convert datetime strings back to datetime objects
                    if "created_at" in session_data and isinstance(session_data["created_at"], str):
                        session_data["created_at"] = datetime.fromisoformat(
                            session_data["created_at"]
                        )
                    if "updated_at" in session_data and isinstance(session_data["updated_at"], str):
                        session_data["updated_at"] = datetime.fromisoformat(
                            session_data["updated_at"]
                        )

                    # Convert messages
                    if "messages" in session_data:
                        for msg in session_data["messages"]:
                            if "timestamp" in msg and isinstance(msg["timestamp"], str):
                                msg["timestamp"] = datetime.fromisoformat(msg["timestamp"])

                    # Convert executions
                    if "executions" in session_data:
                        for exec_data in session_data["executions"]:
                            for dt_field in ["created_at", "started_at", "completed_at"]:
                                if dt_field in exec_data and isinstance(exec_data[dt_field], str):
                                    exec_data[dt_field] = datetime.fromisoformat(
                                        exec_data[dt_field]
                                    )
                            if "messages" in exec_data:
                                for msg in exec_data["messages"]:
                                    if "timestamp" in msg and isinstance(msg["timestamp"], str):
                                        msg["timestamp"] = datetime.fromisoformat(msg["timestamp"])

                    session = PlaygroundSession(**session_data)
                    _sessions[session.id] = session
        except Exception as e:
            print(f"Warning: Failed to load playground sessions: {e}")

    _initialized = True


def _save_sessions():
    """Save sessions to persistent storage."""
    _ensure_storage_dir()

    try:
        data = []
        for session in _sessions.values():
            session_dict = session.model_dump()
            # Convert datetime objects to ISO strings for JSON serialization
            if session_dict.get("created_at"):
                session_dict["created_at"] = session_dict["created_at"].isoformat()
            if session_dict.get("updated_at"):
                session_dict["updated_at"] = session_dict["updated_at"].isoformat()

            # Convert messages
            for msg in session_dict.get("messages", []):
                if msg.get("timestamp"):
                    msg["timestamp"] = msg["timestamp"].isoformat()

            # Convert executions
            for exec_data in session_dict.get("executions", []):
                for dt_field in ["created_at", "started_at", "completed_at"]:
                    if exec_data.get(dt_field):
                        exec_data[dt_field] = exec_data[dt_field].isoformat()
                for msg in exec_data.get("messages", []):
                    if msg.get("timestamp"):
                        msg["timestamp"] = msg["timestamp"].isoformat()

            data.append(session_dict)

        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Warning: Failed to save playground sessions: {e}")


def _fire_and_forget(coro) -> None:
    """Schedule a coroutine as fire-and-forget if an event loop is running."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(coro)
    except RuntimeError:
        pass


def _model_to_pydantic(model: "PlaygroundSessionModel") -> PlaygroundSession:
    """Convert SQLAlchemy model to Pydantic model."""
    return PlaygroundSession(
        id=model.id,
        name=model.name,
        description=model.description or "",
        user_id=model.user_id,
        project_id=model.project_id,
        working_directory=model.working_directory,
        agent_id=model.agent_id,
        model=model.model or "",
        temperature=model.temperature or 0.7,
        max_tokens=model.max_tokens or 4096,
        system_prompt=model.system_prompt,
        rag_enabled=model.rag_enabled or False,
        rag_k=getattr(model, "rag_k", None) or 5,
        rag_hybrid_override=getattr(model, "rag_hybrid_override", None),
        rag_rerank_override=getattr(model, "rag_rerank_override", None),
        rag_include_shared=bool(getattr(model, "rag_include_shared", False)),
        rules_mode=getattr(model, "rules_mode", None) or "off",
        memory_mode=getattr(model, "memory_mode", None) or "off",
        selected_rule_ids=list(getattr(model, "selected_rule_ids", None) or []),
        selected_memory_ids=list(getattr(model, "selected_memory_ids", None) or []),
        context_budget_tokens=getattr(model, "context_budget_tokens", None) or 8000,
        available_tools=model.available_tools or [],
        enabled_tools=model.enabled_tools or [],
        messages=[PlaygroundMessage(**m) for m in (model.messages or [])],
        executions=[PlaygroundExecution(**e) for e in (model.executions or [])],
        total_executions=model.total_executions or 0,
        total_tokens=model.total_tokens or 0,
        total_cost=model.total_cost or 0.0,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _pydantic_to_db_dict(session: PlaygroundSession) -> dict:
    """Convert Pydantic model to dict for DB upsert."""
    return {
        "name": session.name,
        "description": session.description,
        "user_id": session.user_id,
        "project_id": session.project_id,
        "working_directory": session.working_directory,
        "agent_id": session.agent_id,
        "model": session.model,
        "temperature": session.temperature,
        "max_tokens": session.max_tokens,
        "system_prompt": session.system_prompt,
        "rag_enabled": session.rag_enabled,
        "rag_k": session.rag_k,
        "rag_hybrid_override": session.rag_hybrid_override,
        "rag_rerank_override": session.rag_rerank_override,
        "rag_include_shared": session.rag_include_shared,
        "rules_mode": session.rules_mode,
        "memory_mode": session.memory_mode,
        "selected_rule_ids": list(session.selected_rule_ids),
        "selected_memory_ids": list(session.selected_memory_ids),
        "context_budget_tokens": session.context_budget_tokens,
        "available_tools": session.available_tools,
        "enabled_tools": session.enabled_tools,
        "messages": [m.model_dump(mode="json") for m in session.messages],
        "executions": [e.model_dump(mode="json") for e in session.executions],
        "total_executions": session.total_executions,
        "total_tokens": session.total_tokens,
        "total_cost": session.total_cost,
        "updated_at": utcnow(),
    }


async def save_session_to_db(session: PlaygroundSession) -> None:
    """Save/update a session to the database."""
    if not USE_DATABASE or not _DB_AVAILABLE:
        return
    try:
        from db.database import async_session_factory

        async with async_session_factory() as db:
            result = await db.execute(
                select(PlaygroundSessionModel).where(PlaygroundSessionModel.id == session.id)
            )
            existing = result.scalar_one_or_none()
            data = _pydantic_to_db_dict(session)
            if existing:
                for key, value in data.items():
                    setattr(existing, key, value)
            else:
                model = PlaygroundSessionModel(id=session.id, **data, created_at=session.created_at)
                db.add(model)
            await db.commit()
    except Exception:
        logger.warning("Failed to save playground session %s to DB", session.id)


async def delete_session_from_db(session_id: str) -> None:
    """Delete a session from the database."""
    if not USE_DATABASE or not _DB_AVAILABLE:
        return
    try:
        from db.database import async_session_factory

        async with async_session_factory() as db:
            result = await db.execute(
                select(PlaygroundSessionModel).where(PlaygroundSessionModel.id == session_id)
            )
            existing = result.scalar_one_or_none()
            if existing:
                await db.delete(existing)
                await db.commit()
    except Exception:
        logger.warning("Failed to delete playground session %s from DB", session_id)


async def load_sessions_from_db() -> None:
    """Load sessions from DB into in-memory cache (startup sync)."""
    if not USE_DATABASE or not _DB_AVAILABLE:
        return
    try:
        from db.database import async_session_factory

        global _sessions, _initialized
        async with async_session_factory() as db:
            result = await db.execute(select(PlaygroundSessionModel))
            models = result.scalars().all()
            for model in models:
                if model.id not in _sessions:
                    _sessions[model.id] = _model_to_pydantic(model)
            _initialized = True
    except Exception:
        logger.warning("Failed to load playground sessions from DB")
