"""Repository pattern for database operations."""

import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import SessionModel, TaskModel, MessageModel, ApprovalModel
from models.agent_state import AgentState, TaskNode


def serialize_value(value: Any) -> Any:
    """Recursively serialize a value, handling datetime and Pydantic models."""
    if isinstance(value, datetime):
        return value.isoformat()
    elif hasattr(value, 'model_dump'):
        # Pydantic model - serialize with mode="json" for datetime handling
        return value.model_dump(mode="json")
    elif isinstance(value, dict):
        return {k: serialize_value(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [serialize_value(item) for item in value]
    else:
        return value


def serialize_state(state: dict[str, Any]) -> dict[str, Any]:
    """Serialize state dict, converting TaskNode objects and datetime to JSON-safe types."""
    serialized = {}
    for key, value in state.items():
        if key == "tasks" and isinstance(value, dict):
            # Convert TaskNode objects to dicts
            serialized[key] = {
                task_id: (task.model_dump(mode="json") if hasattr(task, 'model_dump') else serialize_value(task))
                for task_id, task in value.items()
            }
        else:
            serialized[key] = serialize_value(value)
    return serialized


class SessionRepository:
    """Repository for session operations."""

    def __init__(self, session: AsyncSession):
        self.db = session

    async def create(
        self,
        session_id: str,
        user_id: str | None = None,
        project_id: str | None = None,
        initial_state: dict[str, Any] | None = None,
    ) -> SessionModel:
        """Create a new session."""
        session = SessionModel(
            id=session_id,
            user_id=user_id,
            project_id=project_id,
            state_json=initial_state or {},
            status="active",
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def get(self, session_id: str) -> SessionModel | None:
        """Get session by ID."""
        result = await self.db.execute(
            select(SessionModel).where(SessionModel.id == session_id)
        )
        return result.scalar_one_or_none()

    async def get_state(self, session_id: str) -> dict[str, Any] | None:
        """Get session state as dict."""
        session = await self.get(session_id)
        if session:
            return session.state_json
        return None

    async def update_state(
        self,
        session_id: str,
        state: dict[str, Any],
    ) -> bool:
        """Update session state."""
        # Serialize state to handle TaskNode and other Pydantic objects
        serialized = serialize_state(state)
        result = await self.db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(
                state_json=serialized,
                updated_at=datetime.utcnow(),
            )
        )
        return result.rowcount > 0

    async def update_cost(
        self,
        session_id: str,
        total_tokens: int,
        total_cost_usd: float,
    ) -> bool:
        """Update session cost tracking."""
        result = await self.db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(
                total_tokens=total_tokens,
                total_cost_usd=total_cost_usd,
                updated_at=datetime.utcnow(),
            )
        )
        return result.rowcount > 0

    async def delete(self, session_id: str) -> bool:
        """Delete session and all related data."""
        result = await self.db.execute(
            delete(SessionModel).where(SessionModel.id == session_id)
        )
        return result.rowcount > 0

    async def list_by_user(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[SessionModel]:
        """List sessions for a user."""
        result = await self.db.execute(
            select(SessionModel)
            .where(SessionModel.user_id == user_id)
            .order_by(SessionModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def list_active(
        self,
        limit: int = 100,
    ) -> list[SessionModel]:
        """List active sessions."""
        result = await self.db.execute(
            select(SessionModel)
            .where(SessionModel.status == "active")
            .order_by(SessionModel.updated_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


class TaskRepository:
    """Repository for task operations."""

    def __init__(self, session: AsyncSession):
        self.db = session

    async def create(
        self,
        task_id: str,
        session_id: str,
        title: str,
        description: str = "",
        parent_id: str | None = None,
        dependencies: list[str] | None = None,
    ) -> TaskModel:
        """Create a new task."""
        task = TaskModel(
            id=task_id,
            session_id=session_id,
            parent_id=parent_id,
            title=title,
            description=description,
            dependencies=dependencies or [],
            status="pending",
        )
        self.db.add(task)
        await self.db.flush()
        return task

    async def get(self, task_id: str) -> TaskModel | None:
        """Get task by ID."""
        result = await self.db.execute(
            select(TaskModel).where(TaskModel.id == task_id)
        )
        return result.scalar_one_or_none()

    async def update_status(
        self,
        task_id: str,
        status: str,
        result: dict | None = None,
        error: str | None = None,
    ) -> bool:
        """Update task status."""
        values: dict[str, Any] = {
            "status": status,
            "updated_at": datetime.utcnow(),
        }

        if status == "in_progress":
            values["started_at"] = datetime.utcnow()
        elif status in ("completed", "failed"):
            values["completed_at"] = datetime.utcnow()

        if result is not None:
            values["result_json"] = result
        if error is not None:
            values["error"] = error

        db_result = await self.db.execute(
            update(TaskModel)
            .where(TaskModel.id == task_id)
            .values(**values)
        )
        return db_result.rowcount > 0

    async def list_by_session(
        self,
        session_id: str,
    ) -> list[TaskModel]:
        """List all tasks for a session."""
        result = await self.db.execute(
            select(TaskModel)
            .where(TaskModel.session_id == session_id)
            .order_by(TaskModel.created_at)
        )
        return list(result.scalars().all())

    async def list_pending_by_session(
        self,
        session_id: str,
    ) -> list[TaskModel]:
        """List pending tasks for a session."""
        result = await self.db.execute(
            select(TaskModel)
            .where(
                TaskModel.session_id == session_id,
                TaskModel.status == "pending",
            )
            .order_by(TaskModel.created_at)
        )
        return list(result.scalars().all())


class MessageRepository:
    """Repository for message operations."""

    def __init__(self, session: AsyncSession):
        self.db = session

    async def create(
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
    ) -> MessageModel:
        """Create a new message."""
        message = MessageModel(
            id=str(uuid.uuid4()),
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
        self.db.add(message)
        await self.db.flush()
        return message

    async def list_by_session(
        self,
        session_id: str,
        limit: int = 100,
    ) -> list[MessageModel]:
        """List messages for a session."""
        result = await self.db.execute(
            select(MessageModel)
            .where(MessageModel.session_id == session_id)
            .order_by(MessageModel.timestamp)
            .limit(limit)
        )
        return list(result.scalars().all())


class ApprovalRepository:
    """Repository for approval operations."""

    def __init__(self, session: AsyncSession):
        self.db = session

    async def create(
        self,
        approval_id: str,
        session_id: str,
        task_id: str,
        tool_name: str,
        tool_args: dict,
        risk_level: str,
        risk_description: str,
    ) -> ApprovalModel:
        """Create a new approval request."""
        approval = ApprovalModel(
            id=approval_id,
            session_id=session_id,
            task_id=task_id,
            tool_name=tool_name,
            tool_args=tool_args,
            risk_level=risk_level,
            risk_description=risk_description,
            status="pending",
        )
        self.db.add(approval)
        await self.db.flush()
        return approval

    async def get(self, approval_id: str) -> ApprovalModel | None:
        """Get approval by ID."""
        result = await self.db.execute(
            select(ApprovalModel).where(ApprovalModel.id == approval_id)
        )
        return result.scalar_one_or_none()

    async def approve(
        self,
        approval_id: str,
        approved_by: str | None = None,
    ) -> bool:
        """Approve an approval request."""
        result = await self.db.execute(
            update(ApprovalModel)
            .where(ApprovalModel.id == approval_id)
            .values(
                status="approved",
                approved_by=approved_by,
                resolved_at=datetime.utcnow(),
            )
        )
        return result.rowcount > 0

    async def deny(
        self,
        approval_id: str,
        reason: str | None = None,
    ) -> bool:
        """Deny an approval request."""
        result = await self.db.execute(
            update(ApprovalModel)
            .where(ApprovalModel.id == approval_id)
            .values(
                status="denied",
                denial_reason=reason,
                resolved_at=datetime.utcnow(),
            )
        )
        return result.rowcount > 0

    async def list_pending_by_session(
        self,
        session_id: str,
    ) -> list[ApprovalModel]:
        """List pending approvals for a session."""
        result = await self.db.execute(
            select(ApprovalModel)
            .where(
                ApprovalModel.session_id == session_id,
                ApprovalModel.status == "pending",
            )
            .order_by(ApprovalModel.created_at)
        )
        return list(result.scalars().all())
