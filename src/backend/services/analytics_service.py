"""Analytics service for dashboard metrics."""

import random
from datetime import datetime, timedelta
from typing import Any

from models.analytics import (
    TimeRange,
    MetricType,
    OverviewMetrics,
    TrendDataPoint,
    TrendData,
    MultiTrendData,
    AgentPerformance,
    AgentPerformanceList,
    CostBreakdown,
    CostAnalytics,
    HeatmapCell,
    ActivityHeatmap,
    ErrorBreakdown,
    ErrorAnalytics,
    AnalyticsDashboard,
)


def _get_time_delta(time_range: TimeRange) -> timedelta:
    """Convert time range to timedelta."""
    mapping = {
        TimeRange.HOUR: timedelta(hours=1),
        TimeRange.DAY: timedelta(days=1),
        TimeRange.WEEK: timedelta(days=7),
        TimeRange.MONTH: timedelta(days=30),
        TimeRange.ALL: timedelta(days=365),
    }
    return mapping.get(time_range, timedelta(days=7))


def _get_interval(time_range: TimeRange) -> timedelta:
    """Get data point interval for a time range."""
    mapping = {
        TimeRange.HOUR: timedelta(minutes=5),
        TimeRange.DAY: timedelta(hours=1),
        TimeRange.WEEK: timedelta(days=1),
        TimeRange.MONTH: timedelta(days=1),
        TimeRange.ALL: timedelta(days=7),
    }
    return mapping.get(time_range, timedelta(hours=1))


class AnalyticsService:
    """Service for computing and retrieving analytics data."""

    @staticmethod
    def get_overview() -> OverviewMetrics:
        """Get high-level overview metrics."""
        # In production, this would query the database
        # For now, return mock data that simulates real metrics
        return OverviewMetrics(
            total_sessions=47,
            active_sessions=3,
            total_tasks=234,
            completed_tasks=198,
            failed_tasks=12,
            pending_tasks=24,
            success_rate=94.3,
            total_tokens=1_250_000,
            total_cost=18.75,
            avg_task_duration_ms=4500,
            approvals_pending=2,
            approvals_granted=45,
            approvals_denied=3,
        )

    @staticmethod
    def get_trends(time_range: TimeRange = TimeRange.WEEK) -> MultiTrendData:
        """Get trend data over time."""
        delta = _get_time_delta(time_range)
        interval = _get_interval(time_range)
        now = datetime.utcnow()
        start = now - delta

        # Generate data points
        tasks_data = []
        success_rate_data = []
        costs_data = []
        tokens_data = []

        current = start
        while current <= now:
            # Simulate realistic data with some variation
            base_tasks = random.randint(5, 20)
            base_success = random.uniform(85, 99)
            base_cost = random.uniform(0.5, 2.0)
            base_tokens = random.randint(10000, 50000)

            tasks_data.append(TrendDataPoint(
                timestamp=current,
                value=base_tasks,
                label=current.strftime("%Y-%m-%d %H:%M"),
            ))
            success_rate_data.append(TrendDataPoint(
                timestamp=current,
                value=round(base_success, 1),
                label=current.strftime("%Y-%m-%d %H:%M"),
            ))
            costs_data.append(TrendDataPoint(
                timestamp=current,
                value=round(base_cost, 3),
                label=current.strftime("%Y-%m-%d %H:%M"),
            ))
            tokens_data.append(TrendDataPoint(
                timestamp=current,
                value=base_tokens,
                label=current.strftime("%Y-%m-%d %H:%M"),
            ))

            current += interval

        return MultiTrendData(
            time_range=time_range,
            tasks=tasks_data,
            success_rate=success_rate_data,
            costs=costs_data,
            tokens=tokens_data,
        )

    @staticmethod
    def get_agent_performance(time_range: TimeRange = TimeRange.WEEK) -> AgentPerformanceList:
        """Get performance metrics for all agents."""
        # Mock data for registered agents
        agents = [
            AgentPerformance(
                agent_id="web-ui-specialist",
                agent_name="Web UI Specialist",
                category="development",
                total_tasks=78,
                completed_tasks=74,
                failed_tasks=2,
                success_rate=94.9,
                avg_duration_ms=3200,
                total_tokens=450000,
                total_cost=6.75,
            ),
            AgentPerformance(
                agent_id="backend-integration-specialist",
                agent_name="Backend Integration Specialist",
                category="development",
                total_tasks=52,
                completed_tasks=48,
                failed_tasks=3,
                success_rate=92.3,
                avg_duration_ms=4100,
                total_tokens=380000,
                total_cost=5.70,
            ),
            AgentPerformance(
                agent_id="test-automation-specialist",
                agent_name="Test Automation Specialist",
                category="quality",
                total_tasks=45,
                completed_tasks=43,
                failed_tasks=1,
                success_rate=95.6,
                avg_duration_ms=2800,
                total_tokens=250000,
                total_cost=3.75,
            ),
            AgentPerformance(
                agent_id="lead-orchestrator",
                agent_name="Lead Orchestrator",
                category="orchestration",
                total_tasks=35,
                completed_tasks=34,
                failed_tasks=1,
                success_rate=97.1,
                avg_duration_ms=1500,
                total_tokens=120000,
                total_cost=1.80,
            ),
            AgentPerformance(
                agent_id="code-simplifier",
                agent_name="Code Simplifier",
                category="quality",
                total_tasks=24,
                completed_tasks=22,
                failed_tasks=2,
                success_rate=91.7,
                avg_duration_ms=5200,
                total_tokens=50000,
                total_cost=0.75,
            ),
        ]

        return AgentPerformanceList(agents=agents, time_range=time_range)

    @staticmethod
    def get_cost_analytics(time_range: TimeRange = TimeRange.WEEK) -> CostAnalytics:
        """Get cost analytics breakdown."""
        total_cost = 18.75
        total_tokens = 1_250_000

        by_agent = [
            CostBreakdown(
                category="agent",
                value="web-ui-specialist",
                cost=6.75,
                tokens=450000,
                percentage=36.0,
            ),
            CostBreakdown(
                category="agent",
                value="backend-integration-specialist",
                cost=5.70,
                tokens=380000,
                percentage=30.4,
            ),
            CostBreakdown(
                category="agent",
                value="test-automation-specialist",
                cost=3.75,
                tokens=250000,
                percentage=20.0,
            ),
            CostBreakdown(
                category="agent",
                value="lead-orchestrator",
                cost=1.80,
                tokens=120000,
                percentage=9.6,
            ),
            CostBreakdown(
                category="agent",
                value="code-simplifier",
                cost=0.75,
                tokens=50000,
                percentage=4.0,
            ),
        ]

        by_model = [
            CostBreakdown(
                category="model",
                value="claude-sonnet-4-20250514",
                cost=12.50,
                tokens=850000,
                percentage=66.7,
            ),
            CostBreakdown(
                category="model",
                value="gemini-2.0-flash-exp",
                cost=4.25,
                tokens=300000,
                percentage=22.7,
            ),
            CostBreakdown(
                category="model",
                value="qwen2.5:7b",
                cost=2.00,
                tokens=100000,
                percentage=10.6,
            ),
        ]

        # Project monthly cost based on current usage
        days_in_range = _get_time_delta(time_range).days or 1
        daily_cost = total_cost / days_in_range
        projected_monthly = daily_cost * 30

        return CostAnalytics(
            time_range=time_range,
            total_cost=total_cost,
            total_tokens=total_tokens,
            avg_cost_per_task=total_cost / 234,  # total_tasks
            by_agent=by_agent,
            by_model=by_model,
            projected_monthly=round(projected_monthly, 2),
        )

    @staticmethod
    def get_activity_heatmap(time_range: TimeRange = TimeRange.WEEK) -> ActivityHeatmap:
        """Get activity heatmap data."""
        cells = []
        max_value = 0

        # Generate realistic activity pattern
        # Higher activity during work hours (9-18), lower on weekends
        for day in range(7):
            is_weekend = day in (0, 6)  # Sunday, Saturday
            for hour in range(24):
                # Base activity based on hour
                if 9 <= hour <= 18:
                    base = 8 if not is_weekend else 2
                elif 6 <= hour <= 22:
                    base = 4 if not is_weekend else 1
                else:
                    base = 1

                value = random.randint(max(0, base - 2), base + 3)
                max_value = max(max_value, value)

                cells.append(HeatmapCell(day=day, hour=hour, value=value))

        return ActivityHeatmap(
            cells=cells,
            max_value=max_value,
            time_range=time_range,
        )

    @staticmethod
    def get_error_analytics(time_range: TimeRange = TimeRange.WEEK) -> ErrorAnalytics:
        """Get error analytics breakdown."""
        by_type = [
            ErrorBreakdown(
                error_type="timeout",
                count=5,
                percentage=41.7,
                last_occurred=datetime.utcnow() - timedelta(hours=2),
                sample_message="Task execution timed out after 30 seconds",
            ),
            ErrorBreakdown(
                error_type="api_error",
                count=3,
                percentage=25.0,
                last_occurred=datetime.utcnow() - timedelta(hours=8),
                sample_message="API rate limit exceeded",
            ),
            ErrorBreakdown(
                error_type="validation_error",
                count=2,
                percentage=16.7,
                last_occurred=datetime.utcnow() - timedelta(days=1),
                sample_message="Invalid input format",
            ),
            ErrorBreakdown(
                error_type="permission_denied",
                count=2,
                percentage=16.6,
                last_occurred=datetime.utcnow() - timedelta(days=2),
                sample_message="HITL approval denied",
            ),
        ]

        by_agent = [
            CostBreakdown(
                category="agent",
                value="backend-integration-specialist",
                cost=0,
                tokens=0,
                percentage=33.3,
            ),
            CostBreakdown(
                category="agent",
                value="web-ui-specialist",
                cost=0,
                tokens=0,
                percentage=25.0,
            ),
            CostBreakdown(
                category="agent",
                value="code-simplifier",
                cost=0,
                tokens=0,
                percentage=25.0,
            ),
            CostBreakdown(
                category="agent",
                value="test-automation-specialist",
                cost=0,
                tokens=0,
                percentage=16.7,
            ),
        ]

        return ErrorAnalytics(
            time_range=time_range,
            total_errors=12,
            error_rate=5.1,  # 12 errors / 234 tasks
            by_type=by_type,
            by_agent=by_agent,
        )

    @staticmethod
    def get_dashboard(time_range: TimeRange = TimeRange.WEEK) -> AnalyticsDashboard:
        """Get complete analytics dashboard data."""
        return AnalyticsDashboard(
            overview=AnalyticsService.get_overview(),
            trends=AnalyticsService.get_trends(time_range),
            agents=AnalyticsService.get_agent_performance(time_range),
            costs=AnalyticsService.get_cost_analytics(time_range),
            activity=AnalyticsService.get_activity_heatmap(time_range),
            errors=AnalyticsService.get_error_analytics(time_range),
        )
