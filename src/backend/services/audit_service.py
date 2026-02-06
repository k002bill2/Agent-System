"""Audit trail service for logging all system actions."""

import asyncio
import os
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.audit import (
    ComplianceAuditEntry,
    DataClassification,
    RetentionPolicy,
)

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


class AuditAction(str, Enum):
    """Audit action types."""

    # Session actions
    SESSION_CREATED = "session_created"
    SESSION_DELETED = "session_deleted"
    SESSION_EXPIRED = "session_expired"

    # Task actions
    TASK_CREATED = "task_created"
    TASK_UPDATED = "task_updated"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_CANCELLED = "task_cancelled"
    TASK_PAUSED = "task_paused"
    TASK_RESUMED = "task_resumed"
    TASK_RETRIED = "task_retried"
    TASK_DELETED = "task_deleted"

    # Approval actions
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_GRANTED = "approval_granted"
    APPROVAL_DENIED = "approval_denied"

    # Tool actions
    TOOL_EXECUTED = "tool_executed"
    TOOL_FAILED = "tool_failed"

    # Agent actions
    AGENT_ASSIGNED = "agent_assigned"
    AGENT_COMPLETED = "agent_completed"

    # Permission actions
    PERMISSION_CHANGED = "permission_changed"
    AGENT_DISABLED = "agent_disabled"
    AGENT_ENABLED = "agent_enabled"

    # Authentication actions
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    TOKEN_REFRESHED = "token_refreshed"


class ResourceType(str, Enum):
    """Resource types for audit logging."""

    SESSION = "session"
    TASK = "task"
    APPROVAL = "approval"
    AGENT = "agent"
    USER = "user"
    PERMISSION = "permission"
    TOOL = "tool"


class AuditLogEntry(BaseModel):
    """Audit log entry model."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str | None = None
    user_id: str | None = None

    action: AuditAction
    resource_type: ResourceType
    resource_id: str | None = None

    old_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    changes: dict[str, Any] | None = None

    agent_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None

    metadata: dict[str, Any] = Field(default_factory=dict)
    status: str = "success"
    error_message: str | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Compliance fields (optional for backward compatibility)
    data_classification: DataClassification | None = None
    change_reason: str | None = None
    compliance_flags: list[str] = Field(default_factory=list)
    previous_hash: str | None = None
    hash: str | None = None
    retention_policy: RetentionPolicy | None = None


class AuditLogFilter(BaseModel):
    """Filter for querying audit logs."""

    session_id: str | None = None
    user_id: str | None = None
    action: AuditAction | None = None
    resource_type: ResourceType | None = None
    resource_id: str | None = None
    status: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    limit: int = 100
    offset: int = 0


class AuditLogResponse(BaseModel):
    """Response model for audit log queries."""

    logs: list[AuditLogEntry]
    total: int
    limit: int
    offset: int


# In-memory storage for development fallback
_audit_logs: list[AuditLogEntry] = []


class AuditService:
    """Service for managing audit logs."""

    _integrity_service = None
    _db_session: AsyncSession | None = None

    def __init__(self, use_database: bool = USE_DATABASE):
        self.use_database = use_database

    @classmethod
    def _get_integrity_service(cls):
        """Lazy load integrity service."""
        if cls._integrity_service is None:
            try:
                from services.audit_integrity import get_audit_integrity_service
                cls._integrity_service = get_audit_integrity_service()
            except ImportError:
                pass
        return cls._integrity_service

    @staticmethod
    def _calculate_changes(old: dict, new: dict) -> dict:
        """Calculate the difference between old and new values."""
        changes = {}

        # Added keys
        for key in set(new.keys()) - set(old.keys()):
            changes[key] = {"action": "added", "new": new[key]}

        # Removed keys
        for key in set(old.keys()) - set(new.keys()):
            changes[key] = {"action": "removed", "old": old[key]}

        # Modified keys
        for key in set(old.keys()) & set(new.keys()):
            if old[key] != new[key]:
                changes[key] = {
                    "action": "modified",
                    "old": old[key],
                    "new": new[key],
                }

        return changes

    @staticmethod
    def log(
        action: AuditAction,
        resource_type: ResourceType,
        resource_id: str | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
        agent_id: str | None = None,
        old_value: dict | None = None,
        new_value: dict | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict | None = None,
        status: str = "success",
        error_message: str | None = None,
        data_classification: DataClassification | None = None,
        change_reason: str | None = None,
        compliance_flags: list[str] | None = None,
    ) -> AuditLogEntry:
        """
        Log an audit event (sync version for in-memory).
        For database persistence, use log_async.
        """
        # Calculate changes if both old and new values are provided
        changes = None
        if old_value and new_value:
            changes = AuditService._calculate_changes(old_value, new_value)

        entry = AuditLogEntry(
            session_id=session_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            changes=changes,
            agent_id=agent_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {},
            status=status,
            error_message=error_message,
            data_classification=data_classification or DataClassification.INTERNAL,
            change_reason=change_reason,
            compliance_flags=compliance_flags or [],
        )

        # Add to integrity chain if service available
        integrity = AuditService._get_integrity_service()
        if integrity:
            compliance_entry = ComplianceAuditEntry(
                id=entry.id,
                session_id=entry.session_id,
                user_id=entry.user_id,
                action=entry.action.value,
                resource_type=entry.resource_type.value,
                resource_id=entry.resource_id,
                old_value=entry.old_value,
                new_value=entry.new_value,
                changes=entry.changes,
                agent_id=entry.agent_id,
                ip_address=entry.ip_address,
                user_agent=entry.user_agent,
                metadata=entry.metadata,
                status=entry.status,
                error_message=entry.error_message,
                data_classification=entry.data_classification or DataClassification.INTERNAL,
                change_reason=entry.change_reason,
                compliance_flags=entry.compliance_flags,
                created_at=entry.created_at,
            )
            compliance_entry = integrity.add_entry(compliance_entry)
            entry.previous_hash = compliance_entry.previous_hash
            entry.hash = compliance_entry.hash

        _audit_logs.append(entry)

        # Background DB 저장 (USE_DATABASE=true일 때)
        if USE_DATABASE:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(AuditService._save_entry_to_db(entry))
            except RuntimeError:
                # No running event loop, skip background save
                pass

        return entry

    @staticmethod
    async def _save_entry_to_db(entry: "AuditLogEntry") -> None:
        """Background task to save audit entry to database."""
        try:
            from db.database import async_session_factory
            from db.models import AuditLogModel

            async with async_session_factory() as db:
                db_entry = AuditLogModel(
                    id=entry.id,
                    session_id=entry.session_id,
                    user_id=entry.user_id,
                    action=entry.action.value,
                    resource_type=entry.resource_type.value,
                    resource_id=entry.resource_id,
                    old_value=entry.old_value,
                    new_value=entry.new_value,
                    changes=entry.changes,
                    agent_id=entry.agent_id,
                    ip_address=entry.ip_address,
                    user_agent=entry.user_agent,
                    metadata_json=entry.metadata or {},
                    status=entry.status,
                    error_message=entry.error_message,
                    data_classification=(entry.data_classification or DataClassification.INTERNAL).value,
                    change_reason=entry.change_reason,
                    compliance_flags=entry.compliance_flags or [],
                    created_at=entry.created_at,
                    previous_hash=entry.previous_hash,
                    hash=entry.hash,
                )
                db.add(db_entry)
                await db.commit()
        except Exception as e:
            # Log error but don't fail - audit is best-effort
            import logging
            logging.getLogger(__name__).warning(f"Failed to save audit entry to DB: {e}")

    @staticmethod
    async def log_async(
        db: AsyncSession,
        action: AuditAction,
        resource_type: ResourceType,
        resource_id: str | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
        agent_id: str | None = None,
        old_value: dict | None = None,
        new_value: dict | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict | None = None,
        status: str = "success",
        error_message: str | None = None,
        data_classification: DataClassification | None = None,
        change_reason: str | None = None,
        compliance_flags: list[str] | None = None,
    ) -> AuditLogEntry:
        """Log an audit event to the database."""
        from db.models import AuditLogModel

        # Calculate changes if both old and new values are provided
        changes = None
        if old_value and new_value:
            changes = AuditService._calculate_changes(old_value, new_value)

        entry_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # Create DB model
        db_entry = AuditLogModel(
            id=entry_id,
            session_id=session_id,
            user_id=user_id,
            action=action.value,
            resource_type=resource_type.value,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            changes=changes,
            agent_id=agent_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata_json=metadata or {},
            status=status,
            error_message=error_message,
            data_classification=(data_classification or DataClassification.INTERNAL).value,
            change_reason=change_reason,
            compliance_flags=compliance_flags or [],
            created_at=now,
        )

        db.add(db_entry)
        await db.commit()

        # Return Pydantic model
        return AuditLogEntry(
            id=entry_id,
            session_id=session_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            changes=changes,
            agent_id=agent_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {},
            status=status,
            error_message=error_message,
            data_classification=data_classification or DataClassification.INTERNAL,
            change_reason=change_reason,
            compliance_flags=compliance_flags or [],
            created_at=now,
        )

    @staticmethod
    def query(filter: AuditLogFilter) -> AuditLogResponse:
        """Query audit logs with filters (in-memory)."""
        results = _audit_logs.copy()

        # Apply filters
        if filter.session_id:
            results = [r for r in results if r.session_id == filter.session_id]

        if filter.user_id:
            results = [r for r in results if r.user_id == filter.user_id]

        if filter.action:
            results = [r for r in results if r.action == filter.action]

        if filter.resource_type:
            results = [r for r in results if r.resource_type == filter.resource_type]

        if filter.resource_id:
            results = [r for r in results if r.resource_id == filter.resource_id]

        if filter.status:
            results = [r for r in results if r.status == filter.status]

        if filter.start_date:
            results = [r for r in results if r.created_at >= filter.start_date]

        if filter.end_date:
            results = [r for r in results if r.created_at <= filter.end_date]

        # Sort by created_at descending
        results.sort(key=lambda x: x.created_at, reverse=True)

        total = len(results)

        # Apply pagination
        results = results[filter.offset : filter.offset + filter.limit]

        return AuditLogResponse(
            logs=results,
            total=total,
            limit=filter.limit,
            offset=filter.offset,
        )

    @staticmethod
    async def query_async(db: AsyncSession, filter: AuditLogFilter) -> AuditLogResponse:
        """Query audit logs with filters from database."""
        from db.models import AuditLogModel

        # Build query
        conditions = []

        if filter.session_id:
            conditions.append(AuditLogModel.session_id == filter.session_id)

        if filter.user_id:
            conditions.append(AuditLogModel.user_id == filter.user_id)

        if filter.action:
            conditions.append(AuditLogModel.action == filter.action.value)

        if filter.resource_type:
            conditions.append(AuditLogModel.resource_type == filter.resource_type.value)

        if filter.resource_id:
            conditions.append(AuditLogModel.resource_id == filter.resource_id)

        if filter.status:
            conditions.append(AuditLogModel.status == filter.status)

        if filter.start_date:
            conditions.append(AuditLogModel.created_at >= filter.start_date)

        if filter.end_date:
            conditions.append(AuditLogModel.created_at <= filter.end_date)

        # Count total
        count_stmt = select(func.count()).select_from(AuditLogModel)
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Get paginated results
        query = select(AuditLogModel)
        if conditions:
            query = query.where(and_(*conditions))
        query = query.order_by(desc(AuditLogModel.created_at))
        query = query.offset(filter.offset).limit(filter.limit)

        result = await db.execute(query)
        rows = result.scalars().all()

        # Convert to Pydantic models
        logs = []
        for row in rows:
            logs.append(AuditLogEntry(
                id=row.id,
                session_id=row.session_id,
                user_id=row.user_id,
                action=AuditAction(row.action),
                resource_type=ResourceType(row.resource_type),
                resource_id=row.resource_id,
                old_value=row.old_value,
                new_value=row.new_value,
                changes=row.changes,
                agent_id=row.agent_id,
                ip_address=row.ip_address,
                user_agent=row.user_agent,
                metadata=row.metadata_json or {},
                status=row.status,
                error_message=row.error_message,
                data_classification=DataClassification(row.data_classification) if row.data_classification else None,
                change_reason=row.change_reason,
                compliance_flags=row.compliance_flags or [],
                previous_hash=row.previous_hash,
                hash=row.hash,
                created_at=row.created_at,
            ))

        return AuditLogResponse(
            logs=logs,
            total=total,
            limit=filter.limit,
            offset=filter.offset,
        )

    @staticmethod
    def get_by_id(log_id: str) -> AuditLogEntry | None:
        """Get a specific audit log entry by ID (in-memory)."""
        for log in _audit_logs:
            if log.id == log_id:
                return log
        return None

    @staticmethod
    async def get_by_id_async(db: AsyncSession, log_id: str) -> AuditLogEntry | None:
        """Get a specific audit log entry by ID from database."""
        from db.models import AuditLogModel

        result = await db.execute(
            select(AuditLogModel).where(AuditLogModel.id == log_id)
        )
        row = result.scalar_one_or_none()

        if not row:
            return None

        return AuditLogEntry(
            id=row.id,
            session_id=row.session_id,
            user_id=row.user_id,
            action=AuditAction(row.action),
            resource_type=ResourceType(row.resource_type),
            resource_id=row.resource_id,
            old_value=row.old_value,
            new_value=row.new_value,
            changes=row.changes,
            agent_id=row.agent_id,
            ip_address=row.ip_address,
            user_agent=row.user_agent,
            metadata=row.metadata_json or {},
            status=row.status,
            error_message=row.error_message,
            created_at=row.created_at,
        )

    @staticmethod
    def get_session_audit_trail(session_id: str) -> list[AuditLogEntry]:
        """Get all audit logs for a specific session (in-memory)."""
        return sorted(
            [log for log in _audit_logs if log.session_id == session_id],
            key=lambda x: x.created_at,
            reverse=True,
        )

    @staticmethod
    async def get_session_audit_trail_async(db: AsyncSession, session_id: str) -> list[AuditLogEntry]:
        """Get all audit logs for a specific session from database."""
        filter = AuditLogFilter(session_id=session_id, limit=1000)
        response = await AuditService.query_async(db, filter)
        return response.logs

    @staticmethod
    def cleanup_old_logs(days: int = 30) -> int:
        """Remove audit logs older than specified days (in-memory)."""
        global _audit_logs
        cutoff = datetime.utcnow() - timedelta(days=days)
        original_count = len(_audit_logs)
        _audit_logs = [log for log in _audit_logs if log.created_at >= cutoff]
        return original_count - len(_audit_logs)

    @staticmethod
    async def cleanup_old_logs_async(db: AsyncSession, days: int = 30) -> int:
        """Remove audit logs older than specified days from database."""
        from sqlalchemy import delete

        from db.models import AuditLogModel

        cutoff = datetime.utcnow() - timedelta(days=days)
        stmt = delete(AuditLogModel).where(AuditLogModel.created_at < cutoff)
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount

    @staticmethod
    def export_logs(
        filter: AuditLogFilter,
        format: str = "json",
    ) -> str:
        """Export audit logs in specified format."""
        import csv
        import json
        from io import StringIO

        response = AuditService.query(filter)

        if format == "json":
            return json.dumps(
                [log.model_dump() for log in response.logs],
                default=str,
                indent=2,
            )

        elif format == "csv":
            output = StringIO()
            writer = csv.writer(output)

            # Header
            writer.writerow([
                "id",
                "created_at",
                "action",
                "resource_type",
                "resource_id",
                "session_id",
                "user_id",
                "agent_id",
                "status",
                "error_message",
            ])

            # Rows
            for log in response.logs:
                writer.writerow([
                    log.id,
                    log.created_at.isoformat(),
                    log.action.value,
                    log.resource_type.value,
                    log.resource_id or "",
                    log.session_id or "",
                    log.user_id or "",
                    log.agent_id or "",
                    log.status,
                    log.error_message or "",
                ])

            return output.getvalue()

        else:
            raise ValueError(f"Unsupported format: {format}")


# Convenience functions for common audit events
def audit_task_created(
    session_id: str,
    task_id: str,
    task_data: dict,
    user_id: str | None = None,
) -> AuditLogEntry:
    """Log task creation."""
    return AuditService.log(
        action=AuditAction.TASK_CREATED,
        resource_type=ResourceType.TASK,
        resource_id=task_id,
        session_id=session_id,
        user_id=user_id,
        new_value=task_data,
    )


def audit_task_status_change(
    session_id: str,
    task_id: str,
    old_status: str,
    new_status: str,
    agent_id: str | None = None,
) -> AuditLogEntry:
    """Log task status change."""
    action_map = {
        "completed": AuditAction.TASK_COMPLETED,
        "failed": AuditAction.TASK_FAILED,
        "cancelled": AuditAction.TASK_CANCELLED,
        "paused": AuditAction.TASK_PAUSED,
        "pending": AuditAction.TASK_RESUMED if old_status == "paused" else AuditAction.TASK_UPDATED,
    }
    action = action_map.get(new_status, AuditAction.TASK_UPDATED)

    return AuditService.log(
        action=action,
        resource_type=ResourceType.TASK,
        resource_id=task_id,
        session_id=session_id,
        agent_id=agent_id,
        old_value={"status": old_status},
        new_value={"status": new_status},
    )


def audit_tool_executed(
    session_id: str,
    tool_name: str,
    tool_args: dict,
    result: Any,
    agent_id: str | None = None,
    task_id: str | None = None,
) -> AuditLogEntry:
    """Log tool execution."""
    return AuditService.log(
        action=AuditAction.TOOL_EXECUTED,
        resource_type=ResourceType.TOOL,
        resource_id=tool_name,
        session_id=session_id,
        agent_id=agent_id,
        new_value={"args": tool_args, "result": str(result)[:1000]},
        metadata={"task_id": task_id} if task_id else None,
    )


def audit_approval(
    session_id: str,
    approval_id: str,
    action: AuditAction,
    user_id: str | None = None,
    note: str | None = None,
) -> AuditLogEntry:
    """Log approval action."""
    return AuditService.log(
        action=action,
        resource_type=ResourceType.APPROVAL,
        resource_id=approval_id,
        session_id=session_id,
        user_id=user_id,
        metadata={"note": note} if note else None,
    )
