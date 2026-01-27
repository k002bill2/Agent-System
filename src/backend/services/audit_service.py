"""Audit trail service for logging all system actions."""

import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from models.audit import (
    ComplianceAuditEntry,
    DataClassification,
    RetentionPolicy,
)


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


# In-memory storage for development (will be replaced with DB)
_audit_logs: list[AuditLogEntry] = []


class AuditService:
    """Service for managing audit logs."""

    _integrity_service = None

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
        Log an audit event.

        This is the main entry point for creating audit logs.
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
        return entry

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
    def query(filter: AuditLogFilter) -> AuditLogResponse:
        """Query audit logs with filters."""
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
    def get_by_id(log_id: str) -> AuditLogEntry | None:
        """Get a specific audit log entry by ID."""
        for log in _audit_logs:
            if log.id == log_id:
                return log
        return None

    @staticmethod
    def get_session_audit_trail(session_id: str) -> list[AuditLogEntry]:
        """Get all audit logs for a specific session."""
        return sorted(
            [log for log in _audit_logs if log.session_id == session_id],
            key=lambda x: x.created_at,
            reverse=True,
        )

    @staticmethod
    def cleanup_old_logs(days: int = 30) -> int:
        """Remove audit logs older than specified days."""
        global _audit_logs
        cutoff = datetime.utcnow() - timedelta(days=days)
        original_count = len(_audit_logs)
        _audit_logs = [log for log in _audit_logs if log.created_at >= cutoff]
        return original_count - len(_audit_logs)

    @staticmethod
    def export_logs(
        filter: AuditLogFilter,
        format: str = "json",
    ) -> str:
        """Export audit logs in specified format."""
        import json
        import csv
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
