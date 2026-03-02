"""Repository pattern for database operations."""

import uuid
from datetime import datetime
from typing import Any

from utils.time import utcnow

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import (
    ApprovalModel,
    BranchProtectionRuleModel,
    MergeRequestModel,
    MessageModel,
    SessionModel,
    TaskModel,
)


def serialize_value(value: Any) -> Any:
    """Recursively serialize a value, handling datetime and Pydantic models."""
    if isinstance(value, datetime):
        return value.isoformat()
    elif hasattr(value, "model_dump"):
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
                task_id: (
                    task.model_dump(mode="json")
                    if hasattr(task, "model_dump")
                    else serialize_value(task)
                )
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
        organization_id: str | None = None,
        initial_state: dict[str, Any] | None = None,
    ) -> SessionModel:
        """Create a new session."""
        session = SessionModel(
            id=session_id,
            user_id=user_id,
            project_id=project_id,
            organization_id=organization_id,
            state_json=initial_state or {},
            status="active",
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def get(self, session_id: str) -> SessionModel | None:
        """Get session by ID."""
        result = await self.db.execute(select(SessionModel).where(SessionModel.id == session_id))
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
                updated_at=utcnow(),
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
                updated_at=utcnow(),
            )
        )
        return result.rowcount > 0

    async def delete(self, session_id: str) -> bool:
        """Delete session and all related data."""
        result = await self.db.execute(delete(SessionModel).where(SessionModel.id == session_id))
        return result.rowcount > 0

    async def list_by_user(
        self,
        user_id: str,
        organization_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[SessionModel]:
        """List sessions for a user, optionally filtered by organization."""
        query = select(SessionModel).where(SessionModel.user_id == user_id)
        if organization_id:
            query = query.where(SessionModel.organization_id == organization_id)
        query = query.order_by(SessionModel.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_by_org_today(self, organization_id: str) -> int:
        """Count sessions created today for an organization."""
        from datetime import datetime

        from sqlalchemy import func

        today_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        result = await self.db.execute(
            select(func.count()).where(
                SessionModel.organization_id == organization_id,
                SessionModel.created_at >= today_start,
            )
        )
        return result.scalar() or 0

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

    async def delete_by_project(self, project_id: str) -> int:
        """Delete all sessions for a project.

        Due to CASCADE relationships, this also deletes:
        - tasks (cascade)
        - messages (cascade)
        - approvals (cascade via session_id)
        - feedbacks (cascade via session_id)
        - dataset_entries (cascade via feedback_id)

        Args:
            project_id: Project identifier

        Returns:
            Number of sessions deleted
        """
        result = await self.db.execute(
            delete(SessionModel).where(SessionModel.project_id == project_id)
        )
        return result.rowcount

    async def count_related_by_project(self, project_id: str) -> dict[str, int]:
        """Count all related records for a project.

        Args:
            project_id: Project identifier

        Returns:
            Dict with counts for each table
        """
        from sqlalchemy import func

        counts = {}

        # Count sessions
        result = await self.db.execute(
            select(func.count()).where(SessionModel.project_id == project_id)
        )
        counts["sessions"] = result.scalar() or 0

        if counts["sessions"] == 0:
            return counts

        # Get session IDs for this project
        session_result = await self.db.execute(
            select(SessionModel.id).where(SessionModel.project_id == project_id)
        )
        session_ids = [row[0] for row in session_result.fetchall()]

        if not session_ids:
            return counts

        # Count tasks
        result = await self.db.execute(
            select(func.count()).where(TaskModel.session_id.in_(session_ids))
        )
        counts["tasks"] = result.scalar() or 0

        # Count messages
        result = await self.db.execute(
            select(func.count()).where(MessageModel.session_id.in_(session_ids))
        )
        counts["messages"] = result.scalar() or 0

        # Count approvals
        result = await self.db.execute(
            select(func.count()).where(ApprovalModel.session_id.in_(session_ids))
        )
        counts["approvals"] = result.scalar() or 0

        # Count feedbacks
        try:
            from db.models import DatasetEntryModel, FeedbackModel

            result = await self.db.execute(
                select(func.count()).where(FeedbackModel.session_id.in_(session_ids))
            )
            counts["feedbacks"] = result.scalar() or 0

            # Get feedback IDs for dataset entries count
            if counts["feedbacks"] > 0:
                feedback_result = await self.db.execute(
                    select(FeedbackModel.id).where(FeedbackModel.session_id.in_(session_ids))
                )
                feedback_ids = [row[0] for row in feedback_result.fetchall()]

                if feedback_ids:
                    result = await self.db.execute(
                        select(func.count()).where(DatasetEntryModel.feedback_id.in_(feedback_ids))
                    )
                    counts["dataset_entries"] = result.scalar() or 0
        except Exception:
            # FeedbackModel/DatasetEntryModel may not be imported
            pass

        return counts


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
        result = await self.db.execute(select(TaskModel).where(TaskModel.id == task_id))
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
            "updated_at": utcnow(),
        }

        if status == "in_progress":
            values["started_at"] = utcnow()
        elif status in ("completed", "failed"):
            values["completed_at"] = utcnow()

        if result is not None:
            values["result_json"] = result
        if error is not None:
            values["error"] = error

        db_result = await self.db.execute(
            update(TaskModel).where(TaskModel.id == task_id).values(**values)
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
        result = await self.db.execute(select(ApprovalModel).where(ApprovalModel.id == approval_id))
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
                resolved_at=utcnow(),
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
                resolved_at=utcnow(),
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


class MergeRequestRepository:
    """Repository for merge request operations."""

    def __init__(self, session: AsyncSession):
        self.db = session

    async def create(self, **kwargs) -> MergeRequestModel:
        """Create a new merge request."""
        mr = MergeRequestModel(**kwargs)
        self.db.add(mr)
        await self.db.flush()
        return mr

    async def get(self, mr_id: str) -> MergeRequestModel | None:
        """Get merge request by ID."""
        result = await self.db.execute(
            select(MergeRequestModel).where(MergeRequestModel.id == mr_id)
        )
        return result.scalar_one_or_none()

    async def list_by_project(
        self,
        project_id: str,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MergeRequestModel]:
        """List merge requests for a project."""
        query = select(MergeRequestModel).where(MergeRequestModel.project_id == project_id)
        if status:
            query = query.where(MergeRequestModel.status == status)
        query = query.order_by(MergeRequestModel.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update(self, mr_id: str, **kwargs) -> bool:
        """Update merge request fields."""
        kwargs["updated_at"] = utcnow()
        result = await self.db.execute(
            update(MergeRequestModel).where(MergeRequestModel.id == mr_id).values(**kwargs)
        )
        return result.rowcount > 0

    async def delete(self, mr_id: str) -> bool:
        """Delete a merge request."""
        result = await self.db.execute(
            delete(MergeRequestModel).where(MergeRequestModel.id == mr_id)
        )
        return result.rowcount > 0


class BranchProtectionRepository:
    """Repository for branch protection rule operations."""

    def __init__(self, session: AsyncSession):
        self.db = session

    async def create(self, **kwargs) -> BranchProtectionRuleModel:
        """Create a new branch protection rule."""
        rule = BranchProtectionRuleModel(**kwargs)
        self.db.add(rule)
        await self.db.flush()
        return rule

    async def get(self, rule_id: str) -> BranchProtectionRuleModel | None:
        """Get rule by ID."""
        result = await self.db.execute(
            select(BranchProtectionRuleModel).where(BranchProtectionRuleModel.id == rule_id)
        )
        return result.scalar_one_or_none()

    async def list_by_project(
        self,
        project_id: str,
        enabled_only: bool = False,
    ) -> list[BranchProtectionRuleModel]:
        """List rules for a project."""
        query = select(BranchProtectionRuleModel).where(
            BranchProtectionRuleModel.project_id == project_id
        )
        if enabled_only:
            query = query.where(BranchProtectionRuleModel.enabled == True)  # noqa: E712
        query = query.order_by(BranchProtectionRuleModel.created_at)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_matching_rule(
        self,
        project_id: str,
        branch_name: str,
    ) -> BranchProtectionRuleModel | None:
        """Find the first enabled rule matching a branch name."""
        import fnmatch

        rules = await self.list_by_project(project_id, enabled_only=True)
        for rule in rules:
            if fnmatch.fnmatch(branch_name, rule.branch_pattern):
                return rule
        return None

    async def update(self, rule_id: str, **kwargs) -> bool:
        """Update rule fields."""
        kwargs["updated_at"] = utcnow()
        result = await self.db.execute(
            update(BranchProtectionRuleModel)
            .where(BranchProtectionRuleModel.id == rule_id)
            .values(**kwargs)
        )
        return result.rowcount > 0

    async def delete(self, rule_id: str) -> bool:
        """Delete a rule."""
        result = await self.db.execute(
            delete(BranchProtectionRuleModel).where(BranchProtectionRuleModel.id == rule_id)
        )
        return result.rowcount > 0
