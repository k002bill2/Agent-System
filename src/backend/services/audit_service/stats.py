"""Aggregation over audit log entries and query-filter translation.

These take the entries handed to them and never reach for the in-memory store,
so they are outside the rebinding constraint documented in ``service.py``.
"""

from datetime import timedelta
from typing import Any

from sqlalchemy import or_

from services.audit_service.models import AuditAction, AuditLogEntry, AuditLogFilter
from utils.time import utcnow

_TOOL_ACTIONS: frozenset[AuditAction] = frozenset(
    {AuditAction.TOOL_EXECUTED, AuditAction.TOOL_FAILED}
)


_APPROVAL_ACTIONS: frozenset[AuditAction] = frozenset(
    {
        AuditAction.APPROVAL_REQUESTED,
        AuditAction.APPROVAL_GRANTED,
        AuditAction.APPROVAL_DENIED,
    }
)


TREND_DAYS = 7


def build_recent_trend(day_counts: dict[str, int], days: int = TREND_DAYS) -> list[dict[str, Any]]:
    """Build a contiguous day-by-day activity trend ending today (UTC).

    Unlike a bare ``GROUP BY date``, this zero-fills days with no activity, so
    the chart always shows exactly ``days`` consecutive calendar days and the
    "Last N days" label is literally accurate.
    """
    today = utcnow().date()
    trend: list[dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        date_str = (today - timedelta(days=offset)).strftime("%Y-%m-%d")
        trend.append({"date": date_str, "count": day_counts.get(date_str, 0)})
    return trend


def compute_stats_from_logs(logs: list[AuditLogEntry], total: int) -> dict[str, Any]:
    """Compute the audit statistics payload from a list of log entries."""
    actions_by_type: dict[str, int] = {}
    actions_by_status: dict[str, int] = {}
    day_counts: dict[str, int] = {}

    for log in logs:
        actions_by_type[log.action.value] = actions_by_type.get(log.action.value, 0) + 1
        actions_by_status[log.status] = actions_by_status.get(log.status, 0) + 1
        date_str = log.created_at.strftime("%Y-%m-%d")
        day_counts[date_str] = day_counts.get(date_str, 0) + 1

    return {
        "total_actions": total,
        "tool_executions": sum(actions_by_type.get(a.value, 0) for a in _TOOL_ACTIONS),
        "approvals": sum(actions_by_type.get(a.value, 0) for a in _APPROVAL_ACTIONS),
        "errors": actions_by_status.get("failed", 0),
        "actions_by_type": actions_by_type,
        "actions_by_status": actions_by_status,
        "recent_trend": build_recent_trend(day_counts),
    }


def _build_conditions(filter: AuditLogFilter) -> list:
    """Build SQLAlchemy WHERE conditions shared by log queries and stats aggregation."""
    from db.models import AuditLogModel

    conditions: list = []
    if filter.session_id:
        conditions.append(AuditLogModel.session_id == filter.session_id)
    if filter.user_id:
        conditions.append(AuditLogModel.user_id == filter.user_id)
    if filter.project_id:
        if filter.include_global:
            conditions.append(
                or_(
                    AuditLogModel.project_id == filter.project_id,
                    AuditLogModel.project_id.is_(None),
                )
            )
        else:
            conditions.append(AuditLogModel.project_id == filter.project_id)
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
    return conditions
