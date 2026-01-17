"""Session service for managing orchestration sessions.

Provides an abstraction layer over storage (in-memory or database).
"""

import os
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from db.repository import SessionRepository, TaskRepository, MessageRepository, ApprovalRepository
from db.database import async_session_factory
from models.agent_state import AgentState, create_initial_state
from models.project import Project


# Environment variable to control storage mode
USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


class SessionService:
    """Service for managing orchestration sessions.

    Supports both in-memory and database storage modes.
    """

    def __init__(self, use_database: bool = USE_DATABASE):
        self.use_database = use_database
        self._memory_sessions: dict[str, AgentState] = {}

    async def create_session(
        self,
        user_id: str | None = None,
        max_iterations: int = 100,
        project: Project | None = None,
        session_id: str | None = None,
    ) -> str:
        """Create a new orchestration session."""
        session_id = session_id or str(uuid.uuid4())
        state = create_initial_state(
            session_id=session_id,
            user_id=user_id,
            max_iterations=max_iterations,
        )

        # Add project context if provided
        if project:
            state["project"] = {
                "id": project.id,
                "name": project.name,
                "path": project.path,
                "description": project.description,
            }
            if project.claude_md:
                state["system_context"] = project.claude_md

        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                await repo.create(
                    session_id=session_id,
                    user_id=user_id,
                    project_id=project.id if project else None,
                    initial_state=state,
                )
                await db.commit()
        else:
            self._memory_sessions[session_id] = state

        return session_id

    async def get_session(self, session_id: str) -> AgentState | None:
        """Get session state."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                state = await repo.get_state(session_id)
                return state
        else:
            return self._memory_sessions.get(session_id)

    async def update_session(self, session_id: str, state: AgentState) -> bool:
        """Update session state."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                result = await repo.update_state(session_id, state)
                await db.commit()
                return result
        else:
            if session_id in self._memory_sessions:
                self._memory_sessions[session_id] = state
                return True
            return False

    async def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                result = await repo.delete(session_id)
                await db.commit()
                return result
        else:
            if session_id in self._memory_sessions:
                del self._memory_sessions[session_id]
                return True
            return False

    async def list_sessions(
        self,
        user_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """List sessions."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                if user_id:
                    sessions = await repo.list_by_user(user_id, limit=limit)
                else:
                    sessions = await repo.list_active(limit=limit)
                return [
                    {
                        "id": s.id,
                        "user_id": s.user_id,
                        "project_id": s.project_id,
                        "status": s.status,
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                        "total_tokens": s.total_tokens,
                        "total_cost_usd": s.total_cost_usd,
                    }
                    for s in sessions
                ]
        else:
            sessions = []
            for sid, state in list(self._memory_sessions.items())[:limit]:
                sessions.append({
                    "id": sid,
                    "user_id": state.get("user_id"),
                    "project_id": state.get("project", {}).get("id"),
                    "status": "active",
                    "created_at": state.get("created_at"),
                    "total_tokens": sum(
                        u.get("total_tokens", 0)
                        for u in state.get("token_usage", {}).values()
                    ),
                    "total_cost_usd": state.get("total_cost", 0),
                })
            return sessions

    async def update_cost(
        self,
        session_id: str,
        total_tokens: int,
        total_cost_usd: float,
    ) -> bool:
        """Update session cost tracking."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                result = await repo.update_cost(session_id, total_tokens, total_cost_usd)
                await db.commit()
                return result
        else:
            # In-memory mode - cost is already tracked in state
            return True

    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        message_type: str | None = None,
        agent_id: str | None = None,
        tool_name: str | None = None,
        tool_args: dict | None = None,
        tool_result: dict | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
    ) -> None:
        """Save a message to the database (if enabled)."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = MessageRepository(db)
                await repo.create(
                    session_id=session_id,
                    role=role,
                    content=content,
                    message_type=message_type,
                    agent_id=agent_id,
                    tool_name=tool_name,
                    tool_args=tool_args,
                    tool_result=tool_result,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
                await db.commit()

    async def save_task(
        self,
        task_id: str,
        session_id: str,
        title: str,
        description: str = "",
        parent_id: str | None = None,
        dependencies: list[str] | None = None,
    ) -> None:
        """Save a task to the database (if enabled)."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = TaskRepository(db)
                await repo.create(
                    task_id=task_id,
                    session_id=session_id,
                    title=title,
                    description=description,
                    parent_id=parent_id,
                    dependencies=dependencies,
                )
                await db.commit()

    async def update_task_status(
        self,
        task_id: str,
        status: str,
        result: dict | None = None,
        error: str | None = None,
    ) -> None:
        """Update task status in the database (if enabled)."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = TaskRepository(db)
                await repo.update_status(task_id, status, result, error)
                await db.commit()

    async def save_approval(
        self,
        approval_id: str,
        session_id: str,
        task_id: str,
        tool_name: str,
        tool_args: dict,
        risk_level: str,
        risk_description: str,
    ) -> None:
        """Save an approval request to the database (if enabled)."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = ApprovalRepository(db)
                await repo.create(
                    approval_id=approval_id,
                    session_id=session_id,
                    task_id=task_id,
                    tool_name=tool_name,
                    tool_args=tool_args,
                    risk_level=risk_level,
                    risk_description=risk_description,
                )
                await db.commit()

    async def approve_operation(
        self,
        approval_id: str,
        approved_by: str | None = None,
    ) -> bool:
        """Approve an operation in the database (if enabled)."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = ApprovalRepository(db)
                result = await repo.approve(approval_id, approved_by)
                await db.commit()
                return result
        return True

    async def deny_operation(
        self,
        approval_id: str,
        reason: str | None = None,
    ) -> bool:
        """Deny an operation in the database (if enabled)."""
        if self.use_database:
            async with async_session_factory() as db:
                repo = ApprovalRepository(db)
                result = await repo.deny(approval_id, reason)
                await db.commit()
                return result
        return True


# Global service instance
_session_service: SessionService | None = None


def get_session_service() -> SessionService:
    """Get the global session service instance."""
    global _session_service
    if _session_service is None:
        _session_service = SessionService()
    return _session_service


def set_session_service(service: SessionService) -> None:
    """Set the global session service instance."""
    global _session_service
    _session_service = service
