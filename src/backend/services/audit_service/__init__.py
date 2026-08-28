"""Audit trail service for logging all system actions.

Split into a package so ``services.audit_service`` stays valid verbatim at every
one of its 20-odd import sites; this module is the barrel that keeps them so.
"""

from services.audit_service.helpers import (
    audit_approval,
    audit_config_change,
    audit_project_change,
    audit_task_created,
    audit_task_status_change,
    audit_tool_executed,
    audit_user_auth,
)
from services.audit_service.models import (
    AuditAction,
    AuditLogEntry,
    AuditLogFilter,
    AuditLogResponse,
    ResourceType,
)
from services.audit_service.service import (
    USE_DATABASE,
    AuditService,
    _audit_logs,
    _filter_logs,
)
from services.audit_service.stats import (
    TREND_DAYS,
    build_recent_trend,
    compute_stats_from_logs,
)

__all__ = [
    "TREND_DAYS",
    "USE_DATABASE",
    "AuditAction",
    "AuditLogEntry",
    "AuditLogFilter",
    "AuditLogResponse",
    "AuditService",
    "ResourceType",
    "_audit_logs",
    "_filter_logs",
    "audit_approval",
    "audit_config_change",
    "audit_project_change",
    "audit_task_created",
    "audit_task_status_change",
    "audit_tool_executed",
    "audit_user_auth",
    "build_recent_trend",
    "compute_stats_from_logs",
]
