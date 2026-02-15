"""Audit trail API routes."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from models.audit import (
    ComplianceReport,
    DataClassification,
    IntegrityVerificationResult,
    RetentionApplyResult,
    RetentionPolicy,
)
from services.audit_service import (
    USE_DATABASE,
    AuditAction,
    AuditLogEntry,
    AuditLogFilter,
    AuditLogResponse,
    AuditService,
    ResourceType,
)

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditLogQueryParams(BaseModel):
    """Query parameters for audit log search."""

    session_id: str | None = None
    user_id: str | None = None
    project_id: str | None = None
    action: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    status: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    limit: int = 100
    offset: int = 0


@router.get("", response_model=AuditLogResponse)
async def get_audit_logs(
    session_id: str | None = Query(None),
    user_id: str | None = Query(None),
    project_id: str | None = Query(None),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    resource_id: str | None = Query(None),
    status: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    Query audit logs with filters.

    Supports filtering by:
    - session_id: Filter by session
    - user_id: Filter by user
    - project_id: Filter by project
    - action: Filter by action type (e.g., task_created, tool_executed)
    - resource_type: Filter by resource type (e.g., task, session, approval)
    - resource_id: Filter by specific resource ID
    - status: Filter by status (success, failed, denied)
    - start_date/end_date: Filter by date range
    """
    # Convert string to enum if provided
    action_enum = None
    if action:
        try:
            action_enum = AuditAction(action)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

    resource_type_enum = None
    if resource_type:
        try:
            resource_type_enum = ResourceType(resource_type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid resource_type: {resource_type}")

    filter = AuditLogFilter(
        session_id=session_id,
        user_id=user_id,
        project_id=project_id,
        action=action_enum,
        resource_type=resource_type_enum,
        resource_id=resource_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )

    if USE_DATABASE:
        return await AuditService.query_async(db, filter)
    return AuditService.query(filter)


@router.get("/stats")
async def get_audit_stats(
    session_id: str | None = Query(None),
    project_id: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Get audit statistics summary.

    Returns counts for:
    - Total actions
    - Tool executions
    - Approvals (HITL decisions)
    - Errors (failed operations)
    - Breakdown by action type and status
    """
    # Get all logs for stats calculation
    filter = AuditLogFilter(
        session_id=session_id,
        project_id=project_id,
        start_date=start_date,
        end_date=end_date,
        limit=10000,  # Get enough for accurate stats
        offset=0,
    )

    if USE_DATABASE:
        response = await AuditService.query_async(db, filter)
    else:
        response = AuditService.query(filter)

    logs = response.logs

    # Calculate stats
    total_actions = response.total
    tool_executions = sum(1 for l in logs if "tool" in l.action.value.lower())
    approvals = sum(1 for l in logs if "approval" in l.action.value.lower())
    errors = sum(1 for l in logs if l.status == "failed")

    # Group by action type
    actions_by_type: dict[str, int] = {}
    for log in logs:
        action = log.action.value
        actions_by_type[action] = actions_by_type.get(action, 0) + 1

    # Group by status
    actions_by_status: dict[str, int] = {}
    for log in logs:
        status = log.status
        actions_by_status[status] = actions_by_status.get(status, 0) + 1

    # Recent trend (last 7 days)
    from collections import defaultdict

    trend: dict[str, int] = defaultdict(int)
    for log in logs:
        date_str = log.created_at.strftime("%Y-%m-%d")
        trend[date_str] += 1

    recent_trend = [{"date": date, "count": count} for date, count in sorted(trend.items())[-7:]]

    return {
        "total_actions": total_actions,
        "tool_executions": tool_executions,
        "approvals": approvals,
        "errors": errors,
        "actions_by_type": actions_by_type,
        "actions_by_status": actions_by_status,
        "recent_trend": recent_trend,
    }


@router.get("/actions")
async def get_audit_actions():
    """Get list of available audit actions."""
    return {
        "actions": [
            {"value": action.value, "label": action.value.replace("_", " ").title()}
            for action in AuditAction
        ]
    }


@router.get("/resource-types")
async def get_resource_types():
    """Get list of available resource types."""
    return {
        "resource_types": [{"value": rt.value, "label": rt.value.title()} for rt in ResourceType]
    }


@router.get("/export")
async def export_audit_logs(
    format: str = Query("json", enum=["json", "csv"]),
    session_id: str | None = Query(None),
    user_id: str | None = Query(None),
    project_id: str | None = Query(None),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    limit: int = Query(10000, ge=1, le=100000),
):
    """
    Export audit logs in JSON or CSV format.
    """
    # Convert string to enum if provided
    action_enum = None
    if action:
        try:
            action_enum = AuditAction(action)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

    resource_type_enum = None
    if resource_type:
        try:
            resource_type_enum = ResourceType(resource_type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid resource_type: {resource_type}")

    filter = AuditLogFilter(
        session_id=session_id,
        user_id=user_id,
        project_id=project_id,
        action=action_enum,
        resource_type=resource_type_enum,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=0,
    )

    try:
        content = AuditService.export_logs(filter, format)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    media_type = "application/json" if format == "json" else "text/csv"
    filename = f"audit_logs_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{format}"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sessions/{session_id}/trail")
async def get_session_audit_trail(session_id: str, db: AsyncSession = Depends(get_db)):
    """
    Get the complete audit trail for a specific session.

    Returns all audit logs related to the session in chronological order.
    """
    if USE_DATABASE:
        logs = await AuditService.get_session_audit_trail_async(db, session_id)
    else:
        logs = AuditService.get_session_audit_trail(session_id)
    return {
        "session_id": session_id,
        "logs": logs,
        "total": len(logs),
    }


@router.post("/cleanup")
async def cleanup_old_logs(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    """
    Clean up audit logs older than specified days.

    This is an admin operation that removes old logs to manage storage.
    """
    if USE_DATABASE:
        removed = await AuditService.cleanup_old_logs_async(db, days)
    else:
        removed = AuditService.cleanup_old_logs(days)
    return {
        "success": True,
        "removed_count": removed,
        "message": f"Removed {removed} audit log(s) older than {days} days",
    }


# ─────────────────────────────────────────────────────────────
# Integrity Verification (Enterprise)
# ─────────────────────────────────────────────────────────────


@router.get("/integrity/verify", response_model=IntegrityVerificationResult)
async def verify_audit_integrity():
    """
    Verify the integrity of the audit log chain.

    This checks:
    1. Each entry's hash matches its computed value
    2. The hash chain is unbroken (each entry links to the previous)
    3. Signatures are valid (if configured)

    Returns verification result with any failed entries identified.
    """
    try:
        from services.audit_integrity import get_audit_integrity_service

        service = get_audit_integrity_service()
        result = service.verify_chain()
        return result
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Audit integrity service not available",
        )


@router.get("/compliance/report", response_model=ComplianceReport)
async def get_compliance_report(
    start_date: datetime = Query(None),
    end_date: datetime = Query(None),
):
    """
    Generate a compliance report for the specified period.

    Includes:
    - Statistics by action, classification, and compliance flags
    - Chain integrity verification
    - Retention status
    - Access patterns and high-risk actions
    """
    try:
        from services.audit_integrity import get_audit_integrity_service

        service = get_audit_integrity_service()

        # Default to last 30 days if not specified
        if not end_date:
            end_date = datetime.utcnow()
        if not start_date:
            start_date = end_date - timedelta(days=30)

        report = service.generate_compliance_report(start_date, end_date)
        return report
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Audit integrity service not available",
        )


@router.post("/retention/apply", response_model=RetentionApplyResult)
async def apply_retention_policy(
    policy: str = Query(
        ..., description="Retention policy: standard, extended, permanent, minimal"
    ),
    classification: str | None = Query(None, description="Filter by data classification"),
):
    """
    Apply retention policy to audit entries.

    Policies:
    - standard: 7 years (2555 days)
    - extended: 10 years
    - permanent: Never delete
    - minimal: 1 year
    """
    try:
        from services.audit_integrity import get_audit_integrity_service

        service = get_audit_integrity_service()

        # Validate policy
        try:
            retention_policy = RetentionPolicy(policy)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid policy: {policy}. Valid options: standard, extended, permanent, minimal",
            )

        # Validate classification if provided
        data_classification = None
        if classification:
            try:
                data_classification = DataClassification(classification)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid classification: {classification}",
                )

        result = service.apply_retention_policy(retention_policy, data_classification)
        return result
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Audit integrity service not available",
        )


@router.get("/data-classifications")
async def get_data_classifications():
    """Get list of available data classifications."""
    return {
        "classifications": [
            {"value": dc.value, "label": dc.value.title()} for dc in DataClassification
        ]
    }


@router.post("/seed")
async def seed_sample_data(db: AsyncSession = Depends(get_db)):
    """
    Seed sample audit data for testing.
    Creates various audit log entries to demonstrate the UI.
    """
    import random
    from datetime import datetime, timedelta

    sample_entries = []

    # Use None for IDs to avoid FK constraints in DB mode
    session_id = None if USE_DATABASE else "demo-session-001"
    user_id = None if USE_DATABASE else "demo-user"

    # Generate sample entries over the past week
    now = datetime.utcnow()

    sample_actions = [
        (AuditAction.SESSION_CREATED, ResourceType.SESSION, "success"),
        (AuditAction.TASK_CREATED, ResourceType.TASK, "success"),
        (AuditAction.TASK_UPDATED, ResourceType.TASK, "success"),
        (AuditAction.TOOL_EXECUTED, ResourceType.TOOL, "success"),
        (AuditAction.TOOL_EXECUTED, ResourceType.TOOL, "success"),
        (AuditAction.TOOL_EXECUTED, ResourceType.TOOL, "failed"),
        (AuditAction.APPROVAL_REQUESTED, ResourceType.APPROVAL, "success"),
        (AuditAction.APPROVAL_GRANTED, ResourceType.APPROVAL, "success"),
        (AuditAction.TASK_COMPLETED, ResourceType.TASK, "success"),
        (AuditAction.AGENT_ASSIGNED, ResourceType.AGENT, "success"),
        (AuditAction.AGENT_COMPLETED, ResourceType.AGENT, "success"),
        # New system activity events
        (AuditAction.USER_LOGIN, ResourceType.USER, "success"),
        (AuditAction.USER_LOGIN, ResourceType.USER, "success"),
        (AuditAction.USER_REGISTERED, ResourceType.USER, "success"),
        (AuditAction.LOGIN_FAILED, ResourceType.USER, "failed"),
        (AuditAction.TOKEN_REFRESHED, ResourceType.USER, "success"),
        (AuditAction.USER_LOGOUT, ResourceType.USER, "success"),
        (AuditAction.CONFIG_CREATED, ResourceType.CONFIG, "success"),
        (AuditAction.CONFIG_UPDATED, ResourceType.CONFIG, "success"),
        (AuditAction.CONFIG_DELETED, ResourceType.CONFIG, "success"),
        (AuditAction.NOTIFICATION_RULE_CREATED, ResourceType.NOTIFICATION, "success"),
        (AuditAction.NOTIFICATION_RULE_UPDATED, ResourceType.NOTIFICATION, "success"),
        (AuditAction.LLM_PROVIDER_CHANGED, ResourceType.LLM_PROVIDER, "success"),
    ]

    tool_names = ["bash_execute", "file_read", "file_write", "code_search", "web_fetch"]
    agent_names = ["orchestrator", "planner", "executor", "reviewer", "backend_agent"]

    for i in range(30):
        action, resource_type, status = random.choice(sample_actions)
        days_ago = random.randint(0, 6)
        hours_ago = random.randint(0, 23)

        if USE_DATABASE:
            # Use async version for database
            entry = await AuditService.log_async(
                db=db,
                action=action,
                resource_type=resource_type,
                resource_id=f"resource-{i:04d}",
                session_id=session_id,
                user_id=user_id,
                agent_id=random.choice(agent_names)
                if "AGENT" in action.value or "TOOL" in action.value
                else None,
                new_value={
                    "tool_name": random.choice(tool_names) if "TOOL" in action.value else None,
                    "task_title": f"Sample task {i}" if "TASK" in action.value else None,
                },
                status=status,
                error_message="Tool execution timeout" if status == "failed" else None,
            )
        else:
            # Use sync version for in-memory
            entry = AuditService.log(
                action=action,
                resource_type=resource_type,
                resource_id=f"resource-{i:04d}",
                session_id=session_id,
                user_id=user_id,
                agent_id=random.choice(agent_names)
                if "AGENT" in action.value or "TOOL" in action.value
                else None,
                new_value={
                    "tool_name": random.choice(tool_names) if "TOOL" in action.value else None,
                    "task_title": f"Sample task {i}" if "TASK" in action.value else None,
                },
                status=status,
                error_message="Tool execution timeout" if status == "failed" else None,
            )

            # Adjust created_at for realistic distribution (only for in-memory)
            entry.created_at = now - timedelta(
                days=days_ago, hours=hours_ago, minutes=random.randint(0, 59)
            )

        sample_entries.append(entry)

    return {
        "success": True,
        "message": f"Created {len(sample_entries)} sample audit entries",
        "session_id": session_id,
    }


@router.get("/retention-policies")
async def get_retention_policies():
    """Get list of available retention policies."""
    from models.audit import RETENTION_DAYS

    return {
        "policies": [
            {
                "value": rp.value,
                "label": rp.value.title(),
                "days": RETENTION_DAYS.get(rp, -1),
            }
            for rp in RetentionPolicy
        ]
    }


# ─────────────────────────────────────────────────────────────
# Single log entry by ID (MUST be at the end to avoid matching other routes)
# ─────────────────────────────────────────────────────────────


@router.get("/{log_id}", response_model=AuditLogEntry)
async def get_audit_log(log_id: str, db: AsyncSession = Depends(get_db)):
    """Get a specific audit log entry by ID."""
    if USE_DATABASE:
        log = await AuditService.get_by_id_async(db, log_id)
    else:
        log = AuditService.get_by_id(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return log
