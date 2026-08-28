"""Convenience wrappers that record one specific kind of event.

Callers across the API and the orchestrator import these by name rather than
assembling an ``AuditLogEntry`` themselves.
"""

from typing import Any

from services.audit_service.models import AuditAction, AuditLogEntry, ResourceType
from services.audit_service.service import AuditService


def audit_task_created(
    session_id: str,
    task_id: str,
    task_data: dict,
    user_id: str | None = None,
    project_id: str | None = None,
) -> AuditLogEntry:
    """Log task creation."""
    return AuditService.log(
        action=AuditAction.TASK_CREATED,
        resource_type=ResourceType.TASK,
        resource_id=task_id,
        session_id=session_id,
        user_id=user_id,
        project_id=project_id,
        new_value=task_data,
    )


def audit_task_status_change(
    session_id: str,
    task_id: str,
    old_status: str,
    new_status: str,
    agent_id: str | None = None,
    project_id: str | None = None,
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
        project_id=project_id,
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
    project_id: str | None = None,
) -> AuditLogEntry:
    """Log tool execution."""
    return AuditService.log(
        action=AuditAction.TOOL_EXECUTED,
        resource_type=ResourceType.TOOL,
        resource_id=tool_name,
        session_id=session_id,
        agent_id=agent_id,
        project_id=project_id,
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


def audit_user_auth(
    action: AuditAction,
    user_id: str | None = None,
    metadata: dict | None = None,
    status: str = "success",
    error_message: str | None = None,
) -> AuditLogEntry:
    """Log authentication event (login, logout, register, token refresh)."""
    return AuditService.log(
        action=action,
        resource_type=ResourceType.USER,
        resource_id=user_id,
        user_id=user_id,
        metadata=metadata or {},
        status=status,
        error_message=error_message,
    )


def audit_config_change(
    action: AuditAction,
    config_type: str,
    config_id: str,
    project_id: str | None = None,
    user_id: str | None = None,
) -> AuditLogEntry:
    """Log configuration change (skill, agent, MCP, hook, command)."""
    return AuditService.log(
        action=action,
        resource_type=ResourceType.CONFIG,
        resource_id=config_id,
        user_id=user_id,
        project_id=project_id,
        metadata={"config_type": config_type},
    )


def audit_project_change(
    action: AuditAction,
    project_id: str,
    user_id: str | None = None,
) -> AuditLogEntry:
    """Log project change."""
    return AuditService.log(
        action=action,
        resource_type=ResourceType.PROJECT,
        resource_id=project_id,
        user_id=user_id,
        project_id=project_id,
    )
