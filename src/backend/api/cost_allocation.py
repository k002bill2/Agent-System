"""Cost allocation API routes."""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Depends, Response
from pydantic import BaseModel
import json
import csv
from io import StringIO

from models.cost import (
    CostCenter,
    CostReport,
    CostForecast,
    ChargebackExport,
    BudgetAlert,
)
from services.cost_allocation_service import (
    get_cost_allocation_service,
    CostAllocationService,
)


router = APIRouter(prefix="/cost", tags=["cost-allocation"])


def get_service() -> CostAllocationService:
    """Get cost allocation service dependency."""
    return get_cost_allocation_service()


# ─────────────────────────────────────────────────────────────
# Cost Centers
# ─────────────────────────────────────────────────────────────


class CreateCostCenterRequest(BaseModel):
    """Request to create a cost center."""

    organization_id: str
    name: str
    code: str
    description: str | None = None
    budget_usd: float | None = None
    budget_period: str = "monthly"
    alert_threshold_percent: float = 80.0
    tags: dict[str, str] | None = None
    owner_id: str | None = None
    parent_id: str | None = None


class UpdateCostCenterRequest(BaseModel):
    """Request to update a cost center."""

    name: str | None = None
    description: str | None = None
    budget_usd: float | None = None
    budget_period: str | None = None
    alert_threshold_percent: float | None = None
    tags: dict[str, str] | None = None
    owner_id: str | None = None
    is_active: bool | None = None


@router.get("/cost-centers", response_model=list[CostCenter])
async def list_cost_centers(
    organization_id: str | None = Query(None),
    is_active: bool | None = Query(None),
    service: CostAllocationService = Depends(get_service),
):
    """List all cost centers with optional filters."""
    return service.list_cost_centers(organization_id, is_active)


@router.post("/cost-centers", response_model=CostCenter)
async def create_cost_center(
    request: CreateCostCenterRequest,
    service: CostAllocationService = Depends(get_service),
):
    """Create a new cost center."""
    return service.create_cost_center(
        organization_id=request.organization_id,
        name=request.name,
        code=request.code,
        description=request.description,
        budget_usd=request.budget_usd,
        budget_period=request.budget_period,
        alert_threshold_percent=request.alert_threshold_percent,
        tags=request.tags,
        owner_id=request.owner_id,
        parent_id=request.parent_id,
    )


@router.get("/cost-centers/{cost_center_id}", response_model=CostCenter)
async def get_cost_center(
    cost_center_id: str,
    service: CostAllocationService = Depends(get_service),
):
    """Get a cost center by ID."""
    cc = service.get_cost_center(cost_center_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")
    return cc


@router.patch("/cost-centers/{cost_center_id}", response_model=CostCenter)
async def update_cost_center(
    cost_center_id: str,
    request: UpdateCostCenterRequest,
    service: CostAllocationService = Depends(get_service),
):
    """Update a cost center."""
    updates = request.model_dump(exclude_unset=True)
    cc = service.update_cost_center(cost_center_id, **updates)
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")
    return cc


@router.delete("/cost-centers/{cost_center_id}")
async def delete_cost_center(
    cost_center_id: str,
    service: CostAllocationService = Depends(get_service),
):
    """Delete (deactivate) a cost center."""
    success = service.delete_cost_center(cost_center_id)
    if not success:
        raise HTTPException(status_code=404, detail="Cost center not found")
    return {"success": True, "message": "Cost center deactivated"}


# ─────────────────────────────────────────────────────────────
# Reports
# ─────────────────────────────────────────────────────────────


@router.get("/report", response_model=CostReport)
async def get_cost_report(
    period: str = Query("monthly", enum=["monthly", "quarterly", "custom"]),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    organization_id: str | None = Query(None),
    service: CostAllocationService = Depends(get_service),
):
    """
    Generate a cost report for the specified period.

    Includes breakdowns by:
    - Cost center
    - Project
    - User
    - Model
    - Day

    Plus budget utilization status.
    """
    return service.generate_report(
        period=period,
        start_date=start_date,
        end_date=end_date,
        organization_id=organization_id,
    )


@router.get("/forecast", response_model=CostForecast)
async def get_cost_forecast(
    period: str = Query("monthly", enum=["monthly", "quarterly"]),
    cost_center_id: str | None = Query(None),
    service: CostAllocationService = Depends(get_service),
):
    """
    Generate a cost forecast based on historical data.

    Returns:
    - Projected cost
    - Confidence interval
    - Trend vs previous period
    - Average daily cost
    """
    return service.generate_forecast(period=period, cost_center_id=cost_center_id)


# ─────────────────────────────────────────────────────────────
# Chargeback Export
# ─────────────────────────────────────────────────────────────


@router.get("/chargeback/export")
async def export_chargeback(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    format: str = Query("csv", enum=["csv", "json"]),
    organization_id: str | None = Query(None),
    service: CostAllocationService = Depends(get_service),
):
    """
    Export chargeback data for billing integration.

    Returns aggregated costs by cost center for the specified period.
    """
    export = service.export_chargeback(
        start_date=start_date,
        end_date=end_date,
        format=format,
        organization_id=organization_id,
    )

    if format == "json":
        return export

    # CSV format
    output = StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "cost_center_id",
        "cost_center_code",
        "cost_center_name",
        "total_cost_usd",
        "total_sessions",
        "input_tokens",
        "output_tokens",
    ])

    # Data rows
    for item in export.line_items:
        writer.writerow([
            item["cost_center_id"],
            item["cost_center_code"],
            item["cost_center_name"],
            round(item["total_cost_usd"], 4),
            item["total_sessions"],
            item["input_tokens"],
            item["output_tokens"],
        ])

    content = output.getvalue()
    filename = f"chargeback_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.csv"

    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─────────────────────────────────────────────────────────────
# Budget Alerts
# ─────────────────────────────────────────────────────────────


@router.get("/alerts", response_model=list[BudgetAlert])
async def get_budget_alerts(
    cost_center_id: str | None = Query(None),
    alert_type: str | None = Query(None, enum=["warning", "critical", "exceeded"]),
    since: datetime | None = Query(None),
    service: CostAllocationService = Depends(get_service),
):
    """
    Get budget alerts.

    Filter by:
    - cost_center_id
    - alert_type (warning, critical, exceeded)
    - since (datetime)
    """
    return service.get_alerts(
        cost_center_id=cost_center_id,
        alert_type=alert_type,
        since=since,
    )


# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────


@router.get("/summary")
async def get_cost_summary(
    service: CostAllocationService = Depends(get_service),
):
    """Get a quick summary of cost allocation status."""
    report = service.generate_report(period="monthly")

    # Count alerts by type
    alerts = service.get_alerts()
    alert_counts = {"warning": 0, "critical": 0, "exceeded": 0}
    for alert in alerts:
        if alert.alert_type in alert_counts:
            alert_counts[alert.alert_type] += 1

    return {
        "current_month": {
            "total_cost_usd": report.total_cost_usd,
            "total_sessions": report.total_sessions,
            "total_input_tokens": report.total_input_tokens,
            "total_output_tokens": report.total_output_tokens,
        },
        "cost_centers": {
            "total": len(service.list_cost_centers()),
            "active": len(service.list_cost_centers(is_active=True)),
        },
        "budget_alerts": alert_counts,
        "top_models": dict(sorted(report.by_model.items(), key=lambda x: x[1], reverse=True)[:5]),
    }
