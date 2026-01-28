"""Audit trail API routes."""

from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel

from services.audit_service import (
    AuditService,
    AuditLogEntry,
    AuditLogFilter,
    AuditLogResponse,
    AuditAction,
    ResourceType,
)
from models.audit import (
    DataClassification,
    RetentionPolicy,
    IntegrityVerificationResult,
    ComplianceReport,
    RetentionApplyResult,
)


router = APIRouter(prefix="/audit", tags=["audit"])


class AuditLogQueryParams(BaseModel):
    """Query parameters for audit log search."""

    session_id: str | None = None
    user_id: str | None = None
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
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    resource_id: str | None = Query(None),
    status: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """
    Query audit logs with filters.

    Supports filtering by:
    - session_id: Filter by session
    - user_id: Filter by user
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
            raise HTTPException(
                status_code=400, detail=f"Invalid resource_type: {resource_type}"
            )

    filter = AuditLogFilter(
        session_id=session_id,
        user_id=user_id,
        action=action_enum,
        resource_type=resource_type_enum,
        resource_id=resource_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )

    return AuditService.query(filter)


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
        "resource_types": [
            {"value": rt.value, "label": rt.value.title()}
            for rt in ResourceType
        ]
    }


@router.get("/export")
async def export_audit_logs(
    format: str = Query("json", enum=["json", "csv"]),
    session_id: str | None = Query(None),
    user_id: str | None = Query(None),
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
            raise HTTPException(
                status_code=400, detail=f"Invalid resource_type: {resource_type}"
            )

    filter = AuditLogFilter(
        session_id=session_id,
        user_id=user_id,
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


@router.get("/{log_id}", response_model=AuditLogEntry)
async def get_audit_log(log_id: str):
    """Get a specific audit log entry by ID."""
    log = AuditService.get_by_id(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return log


@router.get("/sessions/{session_id}/trail")
async def get_session_audit_trail(session_id: str):
    """
    Get the complete audit trail for a specific session.

    Returns all audit logs related to the session in chronological order.
    """
    logs = AuditService.get_session_audit_trail(session_id)
    return {
        "session_id": session_id,
        "logs": logs,
        "total": len(logs),
    }


@router.post("/cleanup")
async def cleanup_old_logs(days: int = Query(30, ge=1, le=365)):
    """
    Clean up audit logs older than specified days.

    This is an admin operation that removes old logs to manage storage.
    """
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
    policy: str = Query(..., description="Retention policy: standard, extended, permanent, minimal"),
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
            {"value": dc.value, "label": dc.value.title()}
            for dc in DataClassification
        ]
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
