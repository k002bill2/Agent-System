"""Cost allocation service for enterprise billing."""

import uuid
from datetime import datetime, timedelta
from typing import Any

from models.cost import (
    CostCenter,
    CostAllocation,
    CostReport,
    CostForecast,
    ChargebackExport,
    BudgetAlert,
    SessionTokenUsage,
)


class CostAllocationService:
    """
    Service for managing cost allocation and billing.

    Features:
    - Cost center management
    - Session cost tracking and allocation
    - Budget monitoring and alerts
    - Chargeback reporting
    - Cost forecasting
    """

    def __init__(self):
        """Initialize cost allocation service."""
        self._cost_centers: dict[str, CostCenter] = {}
        self._allocations: list[CostAllocation] = []
        self._alerts: list[BudgetAlert] = []

    # ─────────────────────────────────────────────────────────────
    # Cost Center Management
    # ─────────────────────────────────────────────────────────────

    def create_cost_center(
        self,
        organization_id: str,
        name: str,
        code: str,
        budget_usd: float | None = None,
        budget_period: str = "monthly",
        alert_threshold_percent: float = 80.0,
        description: str | None = None,
        tags: dict | None = None,
        owner_id: str | None = None,
        parent_id: str | None = None,
    ) -> CostCenter:
        """Create a new cost center."""
        cost_center = CostCenter(
            organization_id=organization_id,
            name=name,
            code=code,
            description=description,
            budget_usd=budget_usd,
            budget_period=budget_period,
            alert_threshold_percent=alert_threshold_percent,
            tags=tags or {},
            owner_id=owner_id,
            parent_id=parent_id,
        )
        self._cost_centers[cost_center.id] = cost_center
        return cost_center

    def get_cost_center(self, cost_center_id: str) -> CostCenter | None:
        """Get a cost center by ID."""
        return self._cost_centers.get(cost_center_id)

    def get_cost_center_by_code(self, code: str) -> CostCenter | None:
        """Get a cost center by code."""
        for cc in self._cost_centers.values():
            if cc.code == code:
                return cc
        return None

    def list_cost_centers(
        self,
        organization_id: str | None = None,
        is_active: bool | None = None,
    ) -> list[CostCenter]:
        """List cost centers with optional filters."""
        results = list(self._cost_centers.values())

        if organization_id:
            results = [cc for cc in results if cc.organization_id == organization_id]

        if is_active is not None:
            results = [cc for cc in results if cc.is_active == is_active]

        return results

    def update_cost_center(
        self,
        cost_center_id: str,
        **updates,
    ) -> CostCenter | None:
        """Update a cost center."""
        cc = self._cost_centers.get(cost_center_id)
        if not cc:
            return None

        for key, value in updates.items():
            if hasattr(cc, key):
                setattr(cc, key, value)

        cc.updated_at = datetime.utcnow()
        return cc

    def delete_cost_center(self, cost_center_id: str) -> bool:
        """Soft delete a cost center."""
        cc = self._cost_centers.get(cost_center_id)
        if not cc:
            return False

        cc.is_active = False
        cc.updated_at = datetime.utcnow()
        return True

    # ─────────────────────────────────────────────────────────────
    # Cost Allocation
    # ─────────────────────────────────────────────────────────────

    def allocate_session_cost(
        self,
        session_id: str,
        session_usage: SessionTokenUsage,
        cost_center_id: str | None = None,
        project_id: str | None = None,
        user_id: str | None = None,
        tags: dict | None = None,
    ) -> CostAllocation:
        """Allocate session cost to a cost center."""
        # Build model cost breakdown
        model_costs: dict[str, float] = {}
        for agent_name, agent_usage in session_usage.agents.items():
            for usage in agent_usage.history:
                model = usage.model or "unknown"
                model_costs[model] = model_costs.get(model, 0) + usage.cost_usd

        allocation = CostAllocation(
            session_id=session_id,
            project_id=project_id,
            cost_center_id=cost_center_id,
            user_id=user_id,
            total_cost_usd=session_usage.total_cost_usd,
            input_tokens=session_usage.total_input_tokens,
            output_tokens=session_usage.total_output_tokens,
            model_costs=model_costs,
            allocation_tags=tags or {},
        )

        self._allocations.append(allocation)

        # Check budget alerts
        if cost_center_id:
            self._check_budget_alert(cost_center_id)

        return allocation

    def get_allocations(
        self,
        cost_center_id: str | None = None,
        project_id: str | None = None,
        user_id: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> list[CostAllocation]:
        """Get cost allocations with filters."""
        results = self._allocations.copy()

        if cost_center_id:
            results = [a for a in results if a.cost_center_id == cost_center_id]

        if project_id:
            results = [a for a in results if a.project_id == project_id]

        if user_id:
            results = [a for a in results if a.user_id == user_id]

        if start_date:
            results = [a for a in results if a.created_at >= start_date]

        if end_date:
            results = [a for a in results if a.created_at <= end_date]

        return results

    # ─────────────────────────────────────────────────────────────
    # Reporting
    # ─────────────────────────────────────────────────────────────

    def generate_report(
        self,
        period: str = "monthly",
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        organization_id: str | None = None,
    ) -> CostReport:
        """Generate a cost report for the specified period."""
        # Default to current month
        if not end_date:
            end_date = datetime.utcnow()
        if not start_date:
            if period == "monthly":
                start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            elif period == "quarterly":
                quarter_start_month = ((end_date.month - 1) // 3) * 3 + 1
                start_date = end_date.replace(month=quarter_start_month, day=1, hour=0, minute=0, second=0, microsecond=0)
            else:
                start_date = end_date - timedelta(days=30)

        # Filter allocations
        allocations = self.get_allocations(start_date=start_date, end_date=end_date)

        # Calculate totals
        total_cost = sum(a.total_cost_usd for a in allocations)
        total_input = sum(a.input_tokens for a in allocations)
        total_output = sum(a.output_tokens for a in allocations)
        total_sessions = len(set(a.session_id for a in allocations))

        # Group by dimensions
        by_cost_center: dict[str, float] = {}
        by_project: dict[str, float] = {}
        by_user: dict[str, float] = {}
        by_model: dict[str, float] = {}
        by_day: dict[str, float] = {}

        for a in allocations:
            # By cost center
            if a.cost_center_id:
                by_cost_center[a.cost_center_id] = by_cost_center.get(a.cost_center_id, 0) + a.total_cost_usd

            # By project
            if a.project_id:
                by_project[a.project_id] = by_project.get(a.project_id, 0) + a.total_cost_usd

            # By user
            if a.user_id:
                by_user[a.user_id] = by_user.get(a.user_id, 0) + a.total_cost_usd

            # By model
            for model, cost in a.model_costs.items():
                by_model[model] = by_model.get(model, 0) + cost

            # By day
            day_key = a.created_at.strftime("%Y-%m-%d")
            by_day[day_key] = by_day.get(day_key, 0) + a.total_cost_usd

        # Budget utilization
        budget_utilization: dict[str, dict] = {}
        for cc_id, spent in by_cost_center.items():
            cc = self._cost_centers.get(cc_id)
            if cc and cc.budget_usd:
                budget_utilization[cc_id] = {
                    "name": cc.name,
                    "budget": cc.budget_usd,
                    "spent": spent,
                    "percent": round((spent / cc.budget_usd) * 100, 2),
                }

        return CostReport(
            period=period,
            start_date=start_date,
            end_date=end_date,
            total_cost_usd=round(total_cost, 6),
            total_input_tokens=total_input,
            total_output_tokens=total_output,
            total_sessions=total_sessions,
            by_cost_center=by_cost_center,
            by_project=by_project,
            by_user=by_user,
            by_model=by_model,
            by_day=by_day,
            budget_utilization=budget_utilization,
        )

    def generate_forecast(
        self,
        period: str = "monthly",
        cost_center_id: str | None = None,
    ) -> CostForecast:
        """Generate cost forecast based on historical data."""
        # Get last 30 days of data
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)

        allocations = self.get_allocations(
            cost_center_id=cost_center_id,
            start_date=start_date,
            end_date=end_date,
        )

        # Calculate daily average
        daily_costs: dict[str, float] = {}
        for a in allocations:
            day = a.created_at.strftime("%Y-%m-%d")
            daily_costs[day] = daily_costs.get(day, 0) + a.total_cost_usd

        if not daily_costs:
            return CostForecast(
                forecast_date=end_date,
                period=period,
            )

        avg_daily = sum(daily_costs.values()) / len(daily_costs)
        days_in_period = 30 if period == "monthly" else 90

        projected = avg_daily * days_in_period

        # Simple confidence interval (+-20%)
        confidence = (projected * 0.8, projected * 1.2)

        # Trend (compare to previous period)
        prev_start = start_date - timedelta(days=30)
        prev_allocations = self.get_allocations(
            cost_center_id=cost_center_id,
            start_date=prev_start,
            end_date=start_date,
        )
        prev_total = sum(a.total_cost_usd for a in prev_allocations)
        current_total = sum(a.total_cost_usd for a in allocations)

        trend = 0.0
        if prev_total > 0:
            trend = ((current_total - prev_total) / prev_total) * 100

        # By model forecast
        by_model: dict[str, float] = {}
        for a in allocations:
            for model, cost in a.model_costs.items():
                by_model[model] = by_model.get(model, 0) + cost

        # Project forward
        for model in by_model:
            by_model[model] = (by_model[model] / 30) * days_in_period

        return CostForecast(
            forecast_date=end_date,
            period=period,
            projected_cost_usd=round(projected, 2),
            confidence_interval=confidence,
            trend_percent=round(trend, 2),
            average_daily_cost=round(avg_daily, 4),
            by_model=by_model,
        )

    # ─────────────────────────────────────────────────────────────
    # Chargeback Export
    # ─────────────────────────────────────────────────────────────

    def export_chargeback(
        self,
        start_date: datetime,
        end_date: datetime,
        format: str = "csv",
        organization_id: str | None = None,
    ) -> ChargebackExport:
        """Export chargeback data for billing systems."""
        allocations = self.get_allocations(start_date=start_date, end_date=end_date)

        # Aggregate by cost center
        aggregated: dict[str, dict] = {}
        for a in allocations:
            cc_id = a.cost_center_id or "unallocated"

            if cc_id not in aggregated:
                cc = self._cost_centers.get(cc_id)
                aggregated[cc_id] = {
                    "cost_center_id": cc_id,
                    "cost_center_code": cc.code if cc else "N/A",
                    "cost_center_name": cc.name if cc else "Unallocated",
                    "total_cost_usd": 0.0,
                    "total_sessions": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                }

            aggregated[cc_id]["total_cost_usd"] += a.total_cost_usd
            aggregated[cc_id]["total_sessions"] += 1
            aggregated[cc_id]["input_tokens"] += a.input_tokens
            aggregated[cc_id]["output_tokens"] += a.output_tokens

        line_items = list(aggregated.values())
        total_amount = sum(item["total_cost_usd"] for item in line_items)

        return ChargebackExport(
            period_start=start_date,
            period_end=end_date,
            format=format,
            total_amount_usd=round(total_amount, 2),
            line_items=line_items,
        )

    # ─────────────────────────────────────────────────────────────
    # Budget Alerts
    # ─────────────────────────────────────────────────────────────

    def _check_budget_alert(self, cost_center_id: str) -> BudgetAlert | None:
        """Check if budget threshold is reached and create alert."""
        cc = self._cost_centers.get(cost_center_id)
        if not cc or not cc.budget_usd:
            return None

        # Get current period spend
        now = datetime.utcnow()
        if cc.budget_period == "monthly":
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif cc.budget_period == "quarterly":
            quarter_start = ((now.month - 1) // 3) * 3 + 1
            start_date = now.replace(month=quarter_start, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

        allocations = self.get_allocations(
            cost_center_id=cost_center_id,
            start_date=start_date,
            end_date=now,
        )

        spent = sum(a.total_cost_usd for a in allocations)
        percent = (spent / cc.budget_usd) * 100

        # Determine alert level
        if percent >= 100:
            alert_type = "exceeded"
            message = f"Budget exceeded: {cc.name} has used {percent:.1f}% of ${cc.budget_usd} budget"
        elif percent >= 90:
            alert_type = "critical"
            message = f"Critical: {cc.name} at {percent:.1f}% of budget"
        elif percent >= cc.alert_threshold_percent:
            alert_type = "warning"
            message = f"Warning: {cc.name} at {percent:.1f}% of budget"
        else:
            return None

        alert = BudgetAlert(
            cost_center_id=cost_center_id,
            cost_center_name=cc.name,
            alert_type=alert_type,
            threshold_percent=cc.alert_threshold_percent,
            current_percent=round(percent, 2),
            budget_usd=cc.budget_usd,
            spent_usd=round(spent, 2),
            message=message,
        )

        self._alerts.append(alert)
        return alert

    def get_alerts(
        self,
        cost_center_id: str | None = None,
        alert_type: str | None = None,
        since: datetime | None = None,
    ) -> list[BudgetAlert]:
        """Get budget alerts with filters."""
        results = self._alerts.copy()

        if cost_center_id:
            results = [a for a in results if a.cost_center_id == cost_center_id]

        if alert_type:
            results = [a for a in results if a.alert_type == alert_type]

        if since:
            results = [a for a in results if a.created_at >= since]

        return sorted(results, key=lambda x: x.created_at, reverse=True)


# Global singleton
_cost_service: CostAllocationService | None = None


def get_cost_allocation_service() -> CostAllocationService:
    """Get or create the cost allocation service singleton."""
    global _cost_service
    if _cost_service is None:
        _cost_service = CostAllocationService()
    return _cost_service
