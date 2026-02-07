"""Session service for managing orchestration sessions.

Provides an abstraction layer over storage (in-memory or database).
"""

import os
import uuid
from datetime import datetime, timedelta
from typing import Any

from db.database import async_session_factory
from db.repository import ApprovalRepository, MessageRepository, SessionRepository, TaskRepository
from models.agent_state import AgentState, create_initial_state
from models.project import Project

# Environment variable to control storage mode
USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

# Session TTL configuration (in days)
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "7"))
# Inactive session cleanup threshold (in hours)
SESSION_INACTIVE_HOURS = int(os.getenv("SESSION_INACTIVE_HOURS", "24"))


class SessionMetadata:
    """Metadata for session management."""

    def __init__(
        self,
        session_id: str,
        created_at: datetime,
        last_activity: datetime,
        expires_at: datetime,
    ):
        self.session_id = session_id
        self.created_at = created_at
        self.last_activity = last_activity
        self.expires_at = expires_at

    def is_expired(self) -> bool:
        """Check if the session has expired."""
        return datetime.utcnow() > self.expires_at

    def is_inactive(self, threshold_hours: int = SESSION_INACTIVE_HOURS) -> bool:
        """Check if the session is inactive beyond the threshold."""
        threshold = datetime.utcnow() - timedelta(hours=threshold_hours)
        return self.last_activity < threshold

    def touch(self) -> None:
        """Update last activity timestamp."""
        self.last_activity = datetime.utcnow()

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "session_id": self.session_id,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "SessionMetadata":
        """Create from dictionary."""
        return cls(
            session_id=data["session_id"],
            created_at=datetime.fromisoformat(data["created_at"]),
            last_activity=datetime.fromisoformat(data["last_activity"]),
            expires_at=datetime.fromisoformat(data["expires_at"]),
        )


class SessionService:
    """Service for managing orchestration sessions.

    Supports both in-memory and database storage modes.
    """

    def __init__(self, use_database: bool = USE_DATABASE):
        self.use_database = use_database
        self._memory_sessions: dict[str, AgentState] = {}
        self._session_metadata: dict[str, SessionMetadata] = {}

    async def create_session(
        self,
        user_id: str | None = None,
        max_iterations: int = 100,
        project: Project | None = None,
        session_id: str | None = None,
        ttl_days: int | None = None,
        organization_id: str | None = None,
    ) -> str:
        """Create a new orchestration session.

        Args:
            organization_id: If provided, quota is checked before creation.
                Raises ValueError if session quota is exceeded.
        """
        # Quota check if organization_id is provided
        if organization_id:
            from services.organization_service import OrganizationService
            from services.quota_service import QuotaService

            org = OrganizationService.get_organization(organization_id)
            if org:
                # Count today's sessions for this org
                sessions_today = self._count_org_sessions_today(organization_id)
                check = QuotaService.check_session_quota(org, sessions_today)
                if not check.allowed:
                    raise ValueError(check.message)

        session_id = session_id or str(uuid.uuid4())
        now = datetime.utcnow()
        ttl = ttl_days or SESSION_TTL_DAYS

        state = create_initial_state(
            session_id=session_id,
            user_id=user_id,
            organization_id=organization_id,
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

        # Create session metadata
        metadata = SessionMetadata(
            session_id=session_id,
            created_at=now,
            last_activity=now,
            expires_at=now + timedelta(days=ttl),
        )
        self._session_metadata[session_id] = metadata

        # Add metadata to state for persistence
        state["_metadata"] = metadata.to_dict()

        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                await repo.create(
                    session_id=session_id,
                    user_id=user_id,
                    project_id=project.id if project else None,
                    organization_id=organization_id,
                    initial_state=state,
                )
                await db.commit()
        else:
            self._memory_sessions[session_id] = state

        return session_id

    async def get_session(self, session_id: str, update_activity: bool = True) -> AgentState | None:
        """Get session state.

        Args:
            session_id: The session ID
            update_activity: Whether to update last_activity timestamp

        Returns:
            Session state or None if not found or expired
        """
        state = None

        if self.use_database:
            async with async_session_factory() as db:
                repo = SessionRepository(db)
                state = await repo.get_state(session_id)
        else:
            state = self._memory_sessions.get(session_id)

        if not state:
            return None

        # Restore or create metadata
        metadata = self._session_metadata.get(session_id)
        if not metadata and state.get("_metadata"):
            metadata = SessionMetadata.from_dict(state["_metadata"])
            self._session_metadata[session_id] = metadata

        # Check expiration
        if metadata and metadata.is_expired():
            # Session expired, clean up
            await self.delete_session(session_id)
            return None

        # Update last activity
        if metadata and update_activity:
            metadata.touch()
            state["_metadata"] = metadata.to_dict()

        return state

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
        # Remove metadata
        self._session_metadata.pop(session_id, None)

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

    async def refresh_session(self, session_id: str, extend_days: int | None = None) -> bool:
        """Refresh session expiration time.

        Args:
            session_id: The session ID
            extend_days: Days to extend from now (default: SESSION_TTL_DAYS)

        Returns:
            True if session was refreshed
        """
        state = await self.get_session(session_id, update_activity=False)
        if not state:
            return False

        metadata = self._session_metadata.get(session_id)
        if metadata:
            extend = extend_days or SESSION_TTL_DAYS
            metadata.expires_at = datetime.utcnow() + timedelta(days=extend)
            metadata.touch()
            state["_metadata"] = metadata.to_dict()
            await self.update_session(session_id, state)
            return True

        return False

    async def get_session_info(self, session_id: str) -> dict | None:
        """Get session metadata info without loading full state.

        Returns session info including TTL status.
        """
        state = await self.get_session(session_id, update_activity=False)
        if not state:
            return None

        metadata = self._session_metadata.get(session_id)
        if not metadata:
            return None

        now = datetime.utcnow()
        return {
            "session_id": session_id,
            "created_at": metadata.created_at.isoformat(),
            "last_activity": metadata.last_activity.isoformat(),
            "expires_at": metadata.expires_at.isoformat(),
            "is_expired": metadata.is_expired(),
            "is_inactive": metadata.is_inactive(),
            "ttl_remaining_hours": max(0, (metadata.expires_at - now).total_seconds() / 3600),
        }

    async def cleanup_expired_sessions(self) -> int:
        """Clean up expired and inactive sessions.

        Returns:
            Number of sessions cleaned up
        """
        cleaned = 0

        # Get all session IDs to check
        session_ids = list(self._session_metadata.keys())

        for session_id in session_ids:
            metadata = self._session_metadata.get(session_id)
            if metadata and (metadata.is_expired() or metadata.is_inactive()):
                await self.delete_session(session_id)
                cleaned += 1

        # Also check memory sessions without metadata (legacy)
        if not self.use_database:
            for session_id in list(self._memory_sessions.keys()):
                if session_id not in self._session_metadata:
                    # Old session without metadata, check if it has embedded metadata
                    state = self._memory_sessions.get(session_id)
                    if state and state.get("_metadata"):
                        try:
                            metadata = SessionMetadata.from_dict(state["_metadata"])
                            if metadata.is_expired() or metadata.is_inactive():
                                await self.delete_session(session_id)
                                cleaned += 1
                        except Exception:
                            pass  # Invalid metadata, skip

        return cleaned

    def _count_org_sessions_today(self, organization_id: str) -> int:
        """Count sessions created today for an organization (in-memory mode)."""
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        count = 0
        for state in self._memory_sessions.values():
            if state.get("organization_id") == organization_id:
                metadata = state.get("_metadata")
                if metadata:
                    try:
                        created = datetime.fromisoformat(metadata["created_at"])
                        if created >= today_start:
                            count += 1
                    except (KeyError, ValueError):
                        pass
        return count

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
                sessions.append(
                    {
                        "id": sid,
                        "user_id": state.get("user_id"),
                        "project_id": state.get("project", {}).get("id"),
                        "status": "active",
                        "created_at": state.get("created_at"),
                        "total_tokens": sum(
                            u.get("total_tokens", 0) for u in state.get("token_usage", {}).values()
                        ),
                        "total_cost_usd": state.get("total_cost", 0),
                    }
                )
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
