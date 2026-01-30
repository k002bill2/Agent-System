"""Analytics service for dashboard metrics."""

import os
import random
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import SessionModel, TaskModel, SessionActivityModel, AuditLogModel
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
                value="gemini-2.0-flash",
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

    # ─────────────────────────────────────────────────────────────
    # Async Database Methods (USE_DATABASE=true)
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def get_overview_async(db: AsyncSession) -> OverviewMetrics:
        """Get high-level overview metrics from database."""
        now = datetime.utcnow()

        # Count sessions
        total_sessions_result = await db.execute(
            select(func.count(SessionModel.id))
        )
        total_sessions = total_sessions_result.scalar() or 0

        active_sessions_result = await db.execute(
            select(func.count(SessionModel.id)).where(
                SessionModel.status == "active"
            )
        )
        active_sessions = active_sessions_result.scalar() or 0

        # Count tasks
        total_tasks_result = await db.execute(
            select(func.count(TaskModel.id))
        )
        total_tasks = total_tasks_result.scalar() or 0

        completed_tasks_result = await db.execute(
            select(func.count(TaskModel.id)).where(
                TaskModel.status == "completed"
            )
        )
        completed_tasks = completed_tasks_result.scalar() or 0

        failed_tasks_result = await db.execute(
            select(func.count(TaskModel.id)).where(
                TaskModel.status == "failed"
            )
        )
        failed_tasks = failed_tasks_result.scalar() or 0

        pending_tasks_result = await db.execute(
            select(func.count(TaskModel.id)).where(
                TaskModel.status.in_(["pending", "in_progress", "waiting"])
            )
        )
        pending_tasks = pending_tasks_result.scalar() or 0

        # Calculate success rate
        success_rate = 0.0
        if completed_tasks + failed_tasks > 0:
            success_rate = round((completed_tasks / (completed_tasks + failed_tasks)) * 100, 1)

        # Token and cost totals from sessions
        token_result = await db.execute(
            select(
                func.coalesce(func.sum(SessionModel.total_tokens), 0),
                func.coalesce(func.sum(SessionModel.total_cost_usd), 0)
            )
        )
        row = token_result.one()
        total_tokens = int(row[0]) if row[0] else 0
        total_cost = float(row[1]) if row[1] else 0.0

        # Average task duration (from completed tasks)
        duration_result = await db.execute(
            select(func.avg(TaskModel.duration_ms)).where(
                and_(
                    TaskModel.status == "completed",
                    TaskModel.duration_ms.isnot(None)
                )
            )
        )
        avg_duration = duration_result.scalar() or 0

        # HITL approvals from audit logs
        approvals_pending_result = await db.execute(
            select(func.count(AuditLogModel.id)).where(
                and_(
                    AuditLogModel.action == "approval_request",
                    AuditLogModel.created_at >= now - timedelta(days=7)
                )
            )
        )
        approvals_pending = approvals_pending_result.scalar() or 0

        approvals_granted_result = await db.execute(
            select(func.count(AuditLogModel.id)).where(
                and_(
                    AuditLogModel.action == "approval_granted",
                    AuditLogModel.created_at >= now - timedelta(days=7)
                )
            )
        )
        approvals_granted = approvals_granted_result.scalar() or 0

        approvals_denied_result = await db.execute(
            select(func.count(AuditLogModel.id)).where(
                and_(
                    AuditLogModel.action == "approval_denied",
                    AuditLogModel.created_at >= now - timedelta(days=7)
                )
            )
        )
        approvals_denied = approvals_denied_result.scalar() or 0

        return OverviewMetrics(
            total_sessions=total_sessions,
            active_sessions=active_sessions,
            total_tasks=total_tasks,
            completed_tasks=completed_tasks,
            failed_tasks=failed_tasks,
            pending_tasks=pending_tasks,
            success_rate=success_rate,
            total_tokens=total_tokens,
            total_cost=round(total_cost, 2),
            avg_task_duration_ms=int(avg_duration),
            approvals_pending=approvals_pending,
            approvals_granted=approvals_granted,
            approvals_denied=approvals_denied,
        )

    @staticmethod
    async def get_trends_async(
        db: AsyncSession,
        time_range: TimeRange = TimeRange.WEEK,
    ) -> MultiTrendData:
        """Get trend data over time from database."""
        delta = _get_time_delta(time_range)
        interval = _get_interval(time_range)
        now = datetime.utcnow()
        start = now - delta

        # Get all tasks in the time range
        task_result = await db.execute(
            select(TaskModel).where(
                TaskModel.created_at >= start
            ).order_by(TaskModel.created_at)
        )
        tasks = task_result.scalars().all()

        # Get all sessions in the time range
        session_result = await db.execute(
            select(SessionModel).where(
                SessionModel.created_at >= start
            )
        )
        sessions = session_result.scalars().all()

        # Build time buckets
        tasks_data = []
        success_rate_data = []
        costs_data = []
        tokens_data = []

        current = start
        while current <= now:
            bucket_end = current + interval

            # Count tasks in this bucket
            bucket_tasks = [t for t in tasks if current <= t.created_at < bucket_end]
            bucket_completed = len([t for t in bucket_tasks if t.status == "completed"])
            bucket_failed = len([t for t in bucket_tasks if t.status == "failed"])

            # Calculate success rate for bucket
            bucket_success_rate = 0.0
            if bucket_completed + bucket_failed > 0:
                bucket_success_rate = round((bucket_completed / (bucket_completed + bucket_failed)) * 100, 1)

            # Sum costs and tokens from sessions updated in this bucket
            bucket_sessions = [s for s in sessions if current <= s.updated_at < bucket_end]
            bucket_cost = sum(s.total_cost_usd or 0 for s in bucket_sessions)
            bucket_tokens = sum(s.total_tokens or 0 for s in bucket_sessions)

            label = current.strftime("%Y-%m-%d %H:%M")
            tasks_data.append(TrendDataPoint(
                timestamp=current,
                value=len(bucket_tasks),
                label=label,
            ))
            success_rate_data.append(TrendDataPoint(
                timestamp=current,
                value=bucket_success_rate,
                label=label,
            ))
            costs_data.append(TrendDataPoint(
                timestamp=current,
                value=round(bucket_cost, 3),
                label=label,
            ))
            tokens_data.append(TrendDataPoint(
                timestamp=current,
                value=bucket_tokens,
                label=label,
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
    async def get_agent_performance_async(
        db: AsyncSession,
        time_range: TimeRange = TimeRange.WEEK,
    ) -> AgentPerformanceList:
        """Get performance metrics for all agents from database."""
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        # Get tasks grouped by agent
        result = await db.execute(
            select(
                TaskModel.agent_id,
                func.count(TaskModel.id).label("total"),
                func.sum(case((TaskModel.status == "completed", 1), else_=0)).label("completed"),
                func.sum(case((TaskModel.status == "failed", 1), else_=0)).label("failed"),
                func.avg(TaskModel.duration_ms).label("avg_duration"),
                func.sum(TaskModel.tokens_used).label("total_tokens"),
                func.sum(TaskModel.cost).label("total_cost"),
            ).where(
                and_(
                    TaskModel.created_at >= start,
                    TaskModel.agent_id.isnot(None)
                )
            ).group_by(TaskModel.agent_id)
        )

        agents = []
        for row in result.fetchall():
            agent_id = row[0]
            total = row[1] or 0
            completed = row[2] or 0
            failed = row[3] or 0
            avg_duration = row[4] or 0
            total_tokens = row[5] or 0
            total_cost = row[6] or 0

            success_rate = 0.0
            if completed + failed > 0:
                success_rate = round((completed / (completed + failed)) * 100, 1)

            agents.append(AgentPerformance(
                agent_id=agent_id,
                agent_name=agent_id.replace("-", " ").title(),
                category="general",
                total_tasks=total,
                completed_tasks=completed,
                failed_tasks=failed,
                success_rate=success_rate,
                avg_duration_ms=int(avg_duration),
                total_tokens=int(total_tokens),
                total_cost=float(total_cost),
            ))

        # Sort by total tasks descending
        agents.sort(key=lambda a: a.total_tasks, reverse=True)

        return AgentPerformanceList(agents=agents, time_range=time_range)

    @staticmethod
    async def get_activity_heatmap_async(
        db: AsyncSession,
        time_range: TimeRange = TimeRange.WEEK,
    ) -> ActivityHeatmap:
        """Get activity heatmap data from database."""
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        # Get activities grouped by day of week and hour
        result = await db.execute(
            select(SessionActivityModel).where(
                SessionActivityModel.created_at >= start
            )
        )
        activities = result.scalars().all()

        # Build heatmap
        heatmap = {}
        for day in range(7):
            for hour in range(24):
                heatmap[(day, hour)] = 0

        for activity in activities:
            day = activity.created_at.weekday()  # 0=Monday, 6=Sunday
            hour = activity.created_at.hour
            # Convert to Sunday=0 format
            day = (day + 1) % 7
            heatmap[(day, hour)] += 1

        cells = []
        max_value = 0
        for (day, hour), value in heatmap.items():
            max_value = max(max_value, value)
            cells.append(HeatmapCell(day=day, hour=hour, value=value))

        return ActivityHeatmap(
            cells=cells,
            max_value=max_value,
            time_range=time_range,
        )

    @staticmethod
    async def get_error_analytics_async(
        db: AsyncSession,
        time_range: TimeRange = TimeRange.WEEK,
    ) -> ErrorAnalytics:
        """Get error analytics breakdown from database."""
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        # Get failed tasks
        result = await db.execute(
            select(TaskModel).where(
                and_(
                    TaskModel.status == "failed",
                    TaskModel.created_at >= start
                )
            )
        )
        failed_tasks = result.scalars().all()

        total_errors = len(failed_tasks)

        # Get total tasks for error rate
        total_result = await db.execute(
            select(func.count(TaskModel.id)).where(
                TaskModel.created_at >= start
            )
        )
        total_tasks = total_result.scalar() or 0

        error_rate = 0.0
        if total_tasks > 0:
            error_rate = round((total_errors / total_tasks) * 100, 1)

        # Group by error type
        error_types = {}
        agent_errors = {}
        for task in failed_tasks:
            error_type = task.error_type or "unknown"
            if error_type not in error_types:
                error_types[error_type] = {
                    "count": 0,
                    "last_occurred": task.updated_at,
                    "sample_message": task.error_message or "No error message",
                }
            error_types[error_type]["count"] += 1
            if task.updated_at > error_types[error_type]["last_occurred"]:
                error_types[error_type]["last_occurred"] = task.updated_at
                error_types[error_type]["sample_message"] = task.error_message or "No error message"

            # Count by agent
            agent_id = task.agent_id or "unknown"
            agent_errors[agent_id] = agent_errors.get(agent_id, 0) + 1

        by_type = []
        for error_type, data in error_types.items():
            percentage = (data["count"] / total_errors * 100) if total_errors > 0 else 0
            by_type.append(ErrorBreakdown(
                error_type=error_type,
                count=data["count"],
                percentage=round(percentage, 1),
                last_occurred=data["last_occurred"],
                sample_message=data["sample_message"],
            ))
        by_type.sort(key=lambda x: x.count, reverse=True)

        by_agent = []
        for agent_id, count in agent_errors.items():
            percentage = (count / total_errors * 100) if total_errors > 0 else 0
            by_agent.append(CostBreakdown(
                category="agent",
                value=agent_id,
                cost=0,
                tokens=0,
                percentage=round(percentage, 1),
            ))
        by_agent.sort(key=lambda x: x.percentage, reverse=True)

        return ErrorAnalytics(
            time_range=time_range,
            total_errors=total_errors,
            error_rate=error_rate,
            by_type=by_type,
            by_agent=by_agent,
        )

    @staticmethod
    async def get_dashboard_async(
        db: AsyncSession,
        time_range: TimeRange = TimeRange.WEEK,
    ) -> AnalyticsDashboard:
        """Get complete analytics dashboard data from database."""
        overview = await AnalyticsService.get_overview_async(db)
        trends = await AnalyticsService.get_trends_async(db, time_range)
        agents = await AnalyticsService.get_agent_performance_async(db, time_range)
        activity = await AnalyticsService.get_activity_heatmap_async(db, time_range)
        errors = await AnalyticsService.get_error_analytics_async(db, time_range)

        # Cost analytics from database
        costs = await AnalyticsService.get_cost_analytics_async(db, time_range)

        return AnalyticsDashboard(
            overview=overview,
            trends=trends,
            agents=agents,
            costs=costs,
            activity=activity,
            errors=errors,
        )

    @staticmethod
    async def get_cost_analytics_async(
        db: AsyncSession,
        time_range: TimeRange = TimeRange.WEEK,
    ) -> CostAnalytics:
        """Get cost analytics breakdown from database."""
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        # Get sessions with cost data
        session_result = await db.execute(
            select(SessionModel).where(
                and_(
                    SessionModel.created_at >= start,
                    SessionModel.total_cost_usd > 0
                )
            )
        )
        sessions = session_result.scalars().all()

        total_cost = sum(s.total_cost_usd or 0 for s in sessions)
        total_tokens = sum(s.total_tokens or 0 for s in sessions)

        # Get tasks for agent breakdown
        task_result = await db.execute(
            select(
                TaskModel.agent_id,
                func.sum(TaskModel.cost).label("total_cost"),
                func.sum(TaskModel.tokens_used).label("total_tokens"),
            ).where(
                and_(
                    TaskModel.created_at >= start,
                    TaskModel.agent_id.isnot(None)
                )
            ).group_by(TaskModel.agent_id)
        )

        by_agent = []
        for row in task_result.fetchall():
            agent_id = row[0]
            agent_cost = float(row[1] or 0)
            agent_tokens = int(row[2] or 0)
            percentage = (agent_cost / total_cost * 100) if total_cost > 0 else 0

            by_agent.append(CostBreakdown(
                category="agent",
                value=agent_id,
                cost=round(agent_cost, 4),
                tokens=agent_tokens,
                percentage=round(percentage, 1),
            ))

        by_agent.sort(key=lambda x: x.cost, reverse=True)

        # Model breakdown from session metadata (simplified)
        by_model = [
            CostBreakdown(
                category="model",
                value="default",
                cost=total_cost,
                tokens=total_tokens,
                percentage=100.0,
            )
        ]

        # Project monthly cost
        days_in_range = delta.days or 1
        daily_cost = total_cost / days_in_range
        projected_monthly = daily_cost * 30

        # Average cost per task
        total_tasks_result = await db.execute(
            select(func.count(TaskModel.id)).where(
                TaskModel.created_at >= start
            )
        )
        total_tasks = total_tasks_result.scalar() or 1
        avg_cost_per_task = total_cost / total_tasks if total_tasks > 0 else 0

        return CostAnalytics(
            time_range=time_range,
            total_cost=round(total_cost, 2),
            total_tokens=total_tokens,
            avg_cost_per_task=round(avg_cost_per_task, 4),
            by_agent=by_agent,
            by_model=by_model,
            projected_monthly=round(projected_monthly, 2),
        )
