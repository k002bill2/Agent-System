"""Analytics service for dashboard metrics."""

import logging
import random
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import AuditLogModel, SessionActivityModel, SessionModel, TaskModel
from models.analytics import (
    ActivityHeatmap,
    AgentPerformance,
    AgentPerformanceList,
    AnalyticsDashboard,
    CostAnalytics,
    CostBreakdown,
    ErrorAnalytics,
    ErrorBreakdown,
    HeatmapCell,
    MultiProjectTrendsResponse,
    MultiTrendData,
    OverviewMetrics,
    ProjectTrendSeries,
    TimeRange,
    TrendDataPoint,
)
from models.project import get_project

logger = logging.getLogger(__name__)


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

            tasks_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=base_tasks,
                    label=current.strftime("%Y-%m-%d %H:%M"),
                )
            )
            success_rate_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=round(base_success, 1),
                    label=current.strftime("%Y-%m-%d %H:%M"),
                )
            )
            costs_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=round(base_cost, 3),
                    label=current.strftime("%Y-%m-%d %H:%M"),
                )
            )
            tokens_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=base_tokens,
                    label=current.strftime("%Y-%m-%d %H:%M"),
                )
            )

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
    # Claude Session-Based Methods (USE_DATABASE=false, real data)
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def _get_sessions(project_name: str | None = None):
        """Get Claude sessions, optionally filtered by project name."""
        from services.claude_session_monitor import get_monitor

        monitor = get_monitor()
        sessions = monitor.discover_sessions()

        if project_name:
            sessions = [s for s in sessions if s.project_name == project_name]

        return sessions

    @staticmethod
    def get_overview_from_sessions(project_name: str | None = None) -> OverviewMetrics:
        """Get overview metrics from Claude Code sessions."""
        sessions = AnalyticsService._get_sessions(project_name)

        total = len(sessions)
        active = sum(1 for s in sessions if s.status.value == "active")
        completed = sum(1 for s in sessions if s.status.value == "completed")
        total_tokens = sum(s.total_input_tokens + s.total_output_tokens for s in sessions)
        total_cost = sum(s.estimated_cost for s in sessions)
        total_tool_calls = sum(s.tool_call_count for s in sessions)

        # Avg session duration in ms
        durations = []
        for s in sessions:
            created = s.created_at.replace(tzinfo=None) if s.created_at.tzinfo else s.created_at
            last = (
                s.last_activity.replace(tzinfo=None) if s.last_activity.tzinfo else s.last_activity
            )
            dur = (last - created).total_seconds() * 1000
            if dur > 0:
                durations.append(dur)
        avg_duration = sum(durations) / len(durations) if durations else 0

        success_rate = (completed / total * 100) if total > 0 else 0.0

        return OverviewMetrics(
            total_sessions=total,
            active_sessions=active,
            total_tasks=total_tool_calls,
            completed_tasks=completed,
            failed_tasks=0,
            pending_tasks=active,
            success_rate=round(success_rate, 1),
            total_tokens=total_tokens,
            total_cost=round(total_cost, 2),
            avg_task_duration_ms=int(avg_duration),
            approvals_pending=0,
            approvals_granted=0,
            approvals_denied=0,
        )

    @staticmethod
    def get_trends_from_sessions(
        time_range: TimeRange = TimeRange.WEEK,
        project_name: str | None = None,
    ) -> MultiTrendData:
        """Get trend data from Claude Code sessions."""
        sessions = AnalyticsService._get_sessions(project_name)
        delta = _get_time_delta(time_range)
        interval = _get_interval(time_range)
        now = datetime.utcnow()
        start = now - delta

        # Filter sessions in time range
        def _normalize_dt(dt):
            return dt.replace(tzinfo=None) if dt.tzinfo else dt

        range_sessions = [s for s in sessions if _normalize_dt(s.created_at) >= start]

        tasks_data = []
        costs_data = []
        tokens_data = []
        success_rate_data = []

        current = start
        while current <= now:
            bucket_end = current + interval

            bucket = [
                s for s in range_sessions if current <= _normalize_dt(s.created_at) < bucket_end
            ]

            bucket_completed = sum(1 for s in bucket if s.status.value == "completed")
            bucket_total = len(bucket)
            sr = (bucket_completed / bucket_total * 100) if bucket_total > 0 else 0.0

            label = current.strftime("%Y-%m-%d %H:%M")
            tasks_data.append(TrendDataPoint(timestamp=current, value=bucket_total, label=label))
            costs_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=round(sum(s.estimated_cost for s in bucket), 3),
                    label=label,
                )
            )
            tokens_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=sum(s.total_input_tokens + s.total_output_tokens for s in bucket),
                    label=label,
                )
            )
            success_rate_data.append(
                TrendDataPoint(timestamp=current, value=round(sr, 1), label=label)
            )

            current += interval

        return MultiTrendData(
            time_range=time_range,
            tasks=tasks_data,
            success_rate=success_rate_data,
            costs=costs_data,
            tokens=tokens_data,
        )

    @staticmethod
    def get_agent_performance_from_sessions(
        time_range: TimeRange = TimeRange.WEEK,
        project_name: str | None = None,
    ) -> AgentPerformanceList:
        """Get model-level performance from Claude Code sessions."""
        sessions = AnalyticsService._get_sessions(project_name)
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        def _normalize_dt(dt):
            return dt.replace(tzinfo=None) if dt.tzinfo else dt

        range_sessions = [s for s in sessions if _normalize_dt(s.created_at) >= start]

        # Group by model
        by_model: dict[str, list] = defaultdict(list)
        for s in range_sessions:
            by_model[s.model or "unknown"].append(s)

        agents = []
        for model_name, model_sessions in by_model.items():
            total = len(model_sessions)
            completed = sum(1 for s in model_sessions if s.status.value == "completed")
            failed = 0
            sr = (completed / total * 100) if total > 0 else 0.0

            durations = []
            for s in model_sessions:
                created = _normalize_dt(s.created_at)
                last = _normalize_dt(s.last_activity)
                dur = (last - created).total_seconds() * 1000
                if dur > 0:
                    durations.append(dur)

            agents.append(
                AgentPerformance(
                    agent_id=model_name,
                    agent_name=model_name,
                    category="model",
                    total_tasks=total,
                    completed_tasks=completed,
                    failed_tasks=failed,
                    success_rate=round(sr, 1),
                    avg_duration_ms=int(sum(durations) / len(durations)) if durations else 0,
                    total_tokens=sum(
                        s.total_input_tokens + s.total_output_tokens for s in model_sessions
                    ),
                    total_cost=round(sum(s.estimated_cost for s in model_sessions), 2),
                )
            )

        agents.sort(key=lambda a: a.total_tasks, reverse=True)
        return AgentPerformanceList(agents=agents, time_range=time_range)

    @staticmethod
    def get_cost_analytics_from_sessions(
        time_range: TimeRange = TimeRange.WEEK,
        project_name: str | None = None,
    ) -> CostAnalytics:
        """Get cost analytics from Claude Code sessions."""
        sessions = AnalyticsService._get_sessions(project_name)
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        def _normalize_dt(dt):
            return dt.replace(tzinfo=None) if dt.tzinfo else dt

        range_sessions = [s for s in sessions if _normalize_dt(s.created_at) >= start]

        total_cost = sum(s.estimated_cost for s in range_sessions)
        total_tokens = sum(s.total_input_tokens + s.total_output_tokens for s in range_sessions)
        total_sessions = len(range_sessions)

        # By model
        model_costs: dict[str, dict] = defaultdict(lambda: {"cost": 0.0, "tokens": 0})
        for s in range_sessions:
            model = s.model or "unknown"
            model_costs[model]["cost"] += s.estimated_cost
            model_costs[model]["tokens"] += s.total_input_tokens + s.total_output_tokens

        by_model = []
        for model, data in model_costs.items():
            pct = (data["cost"] / total_cost * 100) if total_cost > 0 else 0
            by_model.append(
                CostBreakdown(
                    category="model",
                    value=model,
                    cost=round(data["cost"], 4),
                    tokens=data["tokens"],
                    percentage=round(pct, 1),
                )
            )
        by_model.sort(key=lambda x: x.cost, reverse=True)

        # By project
        project_costs: dict[str, dict] = defaultdict(lambda: {"cost": 0.0, "tokens": 0})
        for s in range_sessions:
            pname = s.project_name or "unknown"
            project_costs[pname]["cost"] += s.estimated_cost
            project_costs[pname]["tokens"] += s.total_input_tokens + s.total_output_tokens

        by_agent = []  # Reuse by_agent field for project breakdown
        for pname, data in project_costs.items():
            pct = (data["cost"] / total_cost * 100) if total_cost > 0 else 0
            by_agent.append(
                CostBreakdown(
                    category="project",
                    value=pname,
                    cost=round(data["cost"], 4),
                    tokens=data["tokens"],
                    percentage=round(pct, 1),
                )
            )
        by_agent.sort(key=lambda x: x.cost, reverse=True)

        # Projected monthly
        days_in_range = delta.days or 1
        daily_cost = total_cost / days_in_range
        projected_monthly = daily_cost * 30

        avg_cost = total_cost / total_sessions if total_sessions > 0 else 0

        return CostAnalytics(
            time_range=time_range,
            total_cost=round(total_cost, 2),
            total_tokens=total_tokens,
            avg_cost_per_task=round(avg_cost, 4),
            by_agent=by_agent,
            by_model=by_model,
            projected_monthly=round(projected_monthly, 2),
        )

    @staticmethod
    def get_activity_heatmap_from_sessions(
        time_range: TimeRange = TimeRange.WEEK,
        project_name: str | None = None,
    ) -> ActivityHeatmap:
        """Get activity heatmap from Claude Code sessions."""
        sessions = AnalyticsService._get_sessions(project_name)
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        def _normalize_dt(dt):
            return dt.replace(tzinfo=None) if dt.tzinfo else dt

        range_sessions = [s for s in sessions if _normalize_dt(s.created_at) >= start]

        heatmap: dict[tuple[int, int], int] = {}
        for day in range(7):
            for hour in range(24):
                heatmap[(day, hour)] = 0

        for s in range_sessions:
            ca = _normalize_dt(s.created_at)
            day = ca.weekday()  # 0=Monday
            hour = ca.hour
            # Convert to Sunday=0 format
            day = (day + 1) % 7
            heatmap[(day, hour)] += 1

        cells = []
        max_value = 0
        for (day, hour), value in heatmap.items():
            max_value = max(max_value, value)
            cells.append(HeatmapCell(day=day, hour=hour, value=value))

        return ActivityHeatmap(cells=cells, max_value=max_value, time_range=time_range)

    @staticmethod
    def get_error_analytics_from_sessions(
        time_range: TimeRange = TimeRange.WEEK,
        project_name: str | None = None,
    ) -> ErrorAnalytics:
        """Get error analytics (minimal, since sessions don't track errors explicitly)."""
        return ErrorAnalytics(
            time_range=time_range,
            total_errors=0,
            error_rate=0.0,
            by_type=[],
            by_agent=[],
        )

    @staticmethod
    def get_dashboard_from_sessions(
        time_range: TimeRange = TimeRange.WEEK,
        project_name: str | None = None,
    ) -> AnalyticsDashboard:
        """Get complete dashboard from Claude Code sessions."""
        return AnalyticsDashboard(
            overview=AnalyticsService.get_overview_from_sessions(project_name),
            trends=AnalyticsService.get_trends_from_sessions(time_range, project_name),
            agents=AnalyticsService.get_agent_performance_from_sessions(time_range, project_name),
            costs=AnalyticsService.get_cost_analytics_from_sessions(time_range, project_name),
            activity=AnalyticsService.get_activity_heatmap_from_sessions(time_range, project_name),
            errors=AnalyticsService.get_error_analytics_from_sessions(time_range, project_name),
        )

    # ─────────────────────────────────────────────────────────────
    # Async Database Methods (USE_DATABASE=true)
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def get_overview_async(
        db: AsyncSession,
        project_id: str | None = None,
    ) -> OverviewMetrics:
        """Get high-level overview metrics from database."""
        now = datetime.utcnow()

        # Build base session filter
        session_filter = []
        if project_id:
            session_filter.append(SessionModel.project_id == project_id)

        # Count sessions
        session_query = select(func.count(SessionModel.id))
        if session_filter:
            session_query = session_query.where(and_(*session_filter))
        total_sessions_result = await db.execute(session_query)
        total_sessions = total_sessions_result.scalar() or 0

        active_session_query = select(func.count(SessionModel.id)).where(
            SessionModel.status == "active"
        )
        if project_id:
            active_session_query = active_session_query.where(SessionModel.project_id == project_id)
        active_sessions_result = await db.execute(active_session_query)
        active_sessions = active_sessions_result.scalar() or 0

        # Build task query with project filter via session join
        task_base_query = select(func.count(TaskModel.id))
        if project_id:
            task_base_query = task_base_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)

        # Count tasks
        total_tasks_result = await db.execute(task_base_query)
        total_tasks = total_tasks_result.scalar() or 0

        completed_query = select(func.count(TaskModel.id)).where(TaskModel.status == "completed")
        if project_id:
            completed_query = completed_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)
        completed_tasks_result = await db.execute(completed_query)
        completed_tasks = completed_tasks_result.scalar() or 0

        failed_query = select(func.count(TaskModel.id)).where(TaskModel.status == "failed")
        if project_id:
            failed_query = failed_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)
        failed_tasks_result = await db.execute(failed_query)
        failed_tasks = failed_tasks_result.scalar() or 0

        pending_query = select(func.count(TaskModel.id)).where(
            TaskModel.status.in_(["pending", "in_progress", "waiting"])
        )
        if project_id:
            pending_query = pending_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)
        pending_tasks_result = await db.execute(pending_query)
        pending_tasks = pending_tasks_result.scalar() or 0

        # Calculate success rate
        success_rate = 0.0
        if completed_tasks + failed_tasks > 0:
            success_rate = round((completed_tasks / (completed_tasks + failed_tasks)) * 100, 1)

        # Token and cost totals from sessions
        token_query = select(
            func.coalesce(func.sum(SessionModel.total_tokens), 0),
            func.coalesce(func.sum(SessionModel.total_cost_usd), 0),
        )
        if project_id:
            token_query = token_query.where(SessionModel.project_id == project_id)
        token_result = await db.execute(token_query)
        row = token_result.one()
        total_tokens = int(row[0]) if row[0] else 0
        total_cost = float(row[1]) if row[1] else 0.0

        # Average task duration (from completed tasks)
        duration_query = select(func.avg(TaskModel.duration_ms)).where(
            and_(TaskModel.status == "completed", TaskModel.duration_ms.isnot(None))
        )
        if project_id:
            duration_query = duration_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)
        duration_result = await db.execute(duration_query)
        avg_duration = duration_result.scalar() or 0

        # HITL approvals from audit logs (join with session for project filter)
        audit_base_filter = [AuditLogModel.created_at >= now - timedelta(days=7)]

        def build_audit_query(action: str):
            query = select(func.count(AuditLogModel.id)).where(
                and_(AuditLogModel.action == action, *audit_base_filter)
            )
            if project_id:
                query = query.join(SessionModel, AuditLogModel.session_id == SessionModel.id).where(
                    SessionModel.project_id == project_id
                )
            return query

        approvals_pending_result = await db.execute(build_audit_query("approval_request"))
        approvals_pending = approvals_pending_result.scalar() or 0

        approvals_granted_result = await db.execute(build_audit_query("approval_granted"))
        approvals_granted = approvals_granted_result.scalar() or 0

        approvals_denied_result = await db.execute(build_audit_query("approval_denied"))
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
        project_id: str | None = None,
    ) -> MultiTrendData:
        """Get trend data over time from database."""
        delta = _get_time_delta(time_range)
        interval = _get_interval(time_range)
        now = datetime.utcnow()
        start = now - delta

        # Get all tasks in the time range (with project filter via session join)
        task_query = select(TaskModel).where(TaskModel.created_at >= start)
        if project_id:
            task_query = task_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)
        task_query = task_query.order_by(TaskModel.created_at)
        task_result = await db.execute(task_query)
        tasks = task_result.scalars().all()

        # Get all sessions in the time range
        session_query = select(SessionModel).where(SessionModel.created_at >= start)
        if project_id:
            session_query = session_query.where(SessionModel.project_id == project_id)
        session_result = await db.execute(session_query)
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
                bucket_success_rate = round(
                    (bucket_completed / (bucket_completed + bucket_failed)) * 100, 1
                )

            # Sum costs and tokens from sessions updated in this bucket
            bucket_sessions = [s for s in sessions if current <= s.updated_at < bucket_end]
            bucket_cost = sum(s.total_cost_usd or 0 for s in bucket_sessions)
            bucket_tokens = sum(s.total_tokens or 0 for s in bucket_sessions)

            label = current.strftime("%Y-%m-%d %H:%M")
            tasks_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=len(bucket_tasks),
                    label=label,
                )
            )
            success_rate_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=bucket_success_rate,
                    label=label,
                )
            )
            costs_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=round(bucket_cost, 3),
                    label=label,
                )
            )
            tokens_data.append(
                TrendDataPoint(
                    timestamp=current,
                    value=bucket_tokens,
                    label=label,
                )
            )

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
        project_id: str | None = None,
    ) -> AgentPerformanceList:
        """Get performance metrics for all agents from database."""
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        # Build query with optional project filter
        base_filters = [TaskModel.created_at >= start, TaskModel.agent_id.isnot(None)]

        query = select(
            TaskModel.agent_id,
            func.count(TaskModel.id).label("total"),
            func.sum(case((TaskModel.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case((TaskModel.status == "failed", 1), else_=0)).label("failed"),
            func.avg(TaskModel.duration_ms).label("avg_duration"),
            func.sum(TaskModel.tokens_used).label("total_tokens"),
            func.sum(TaskModel.cost).label("total_cost"),
        )

        if project_id:
            query = query.join(SessionModel, TaskModel.session_id == SessionModel.id).where(
                and_(*base_filters, SessionModel.project_id == project_id)
            )
        else:
            query = query.where(and_(*base_filters))

        query = query.group_by(TaskModel.agent_id)
        result = await db.execute(query)

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

            agents.append(
                AgentPerformance(
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
                )
            )

        # Sort by total tasks descending
        agents.sort(key=lambda a: a.total_tasks, reverse=True)

        return AgentPerformanceList(agents=agents, time_range=time_range)

    @staticmethod
    async def get_activity_heatmap_async(
        db: AsyncSession,
        time_range: TimeRange = TimeRange.WEEK,
        project_id: str | None = None,
    ) -> ActivityHeatmap:
        """Get activity heatmap data from database."""
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        # Get activities grouped by day of week and hour (with project filter via session)
        activity_query = select(SessionActivityModel).where(
            SessionActivityModel.created_at >= start
        )
        if project_id:
            activity_query = activity_query.join(
                SessionModel, SessionActivityModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)
        result = await db.execute(activity_query)
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
        project_id: str | None = None,
    ) -> ErrorAnalytics:
        """Get error analytics breakdown from database."""
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        # Get failed tasks (with project filter via session)
        failed_query = select(TaskModel).where(
            and_(TaskModel.status == "failed", TaskModel.created_at >= start)
        )
        if project_id:
            failed_query = failed_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)
        result = await db.execute(failed_query)
        failed_tasks = result.scalars().all()

        total_errors = len(failed_tasks)

        # Get total tasks for error rate
        total_query = select(func.count(TaskModel.id)).where(TaskModel.created_at >= start)
        if project_id:
            total_query = total_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)
        total_result = await db.execute(total_query)
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
            by_type.append(
                ErrorBreakdown(
                    error_type=error_type,
                    count=data["count"],
                    percentage=round(percentage, 1),
                    last_occurred=data["last_occurred"],
                    sample_message=data["sample_message"],
                )
            )
        by_type.sort(key=lambda x: x.count, reverse=True)

        by_agent = []
        for agent_id, count in agent_errors.items():
            percentage = (count / total_errors * 100) if total_errors > 0 else 0
            by_agent.append(
                CostBreakdown(
                    category="agent",
                    value=agent_id,
                    cost=0,
                    tokens=0,
                    percentage=round(percentage, 1),
                )
            )
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
        project_id: str | None = None,
    ) -> AnalyticsDashboard:
        """Get complete analytics dashboard data from database."""
        overview = await AnalyticsService.get_overview_async(db, project_id=project_id)
        trends = await AnalyticsService.get_trends_async(db, time_range, project_id=project_id)
        agents = await AnalyticsService.get_agent_performance_async(
            db, time_range, project_id=project_id
        )
        activity = await AnalyticsService.get_activity_heatmap_async(
            db, time_range, project_id=project_id
        )
        errors = await AnalyticsService.get_error_analytics_async(
            db, time_range, project_id=project_id
        )

        # Cost analytics from database
        costs = await AnalyticsService.get_cost_analytics_async(
            db, time_range, project_id=project_id
        )

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
        project_id: str | None = None,
    ) -> CostAnalytics:
        """Get cost analytics breakdown from database."""
        delta = _get_time_delta(time_range)
        start = datetime.utcnow() - delta

        # Get sessions with cost data
        session_filters = [SessionModel.created_at >= start, SessionModel.total_cost_usd > 0]
        if project_id:
            session_filters.append(SessionModel.project_id == project_id)

        session_result = await db.execute(select(SessionModel).where(and_(*session_filters)))
        sessions = session_result.scalars().all()

        total_cost = sum(s.total_cost_usd or 0 for s in sessions)
        total_tokens = sum(s.total_tokens or 0 for s in sessions)

        # Get tasks for agent breakdown
        task_filters = [TaskModel.created_at >= start, TaskModel.agent_id.isnot(None)]
        task_query = select(
            TaskModel.agent_id,
            func.sum(TaskModel.cost).label("total_cost"),
            func.sum(TaskModel.tokens_used).label("total_tokens"),
        )
        if project_id:
            task_query = task_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(and_(*task_filters, SessionModel.project_id == project_id))
        else:
            task_query = task_query.where(and_(*task_filters))
        task_query = task_query.group_by(TaskModel.agent_id)
        task_result = await db.execute(task_query)

        by_agent = []
        for row in task_result.fetchall():
            agent_id = row[0]
            agent_cost = float(row[1] or 0)
            agent_tokens = int(row[2] or 0)
            percentage = (agent_cost / total_cost * 100) if total_cost > 0 else 0

            by_agent.append(
                CostBreakdown(
                    category="agent",
                    value=agent_id,
                    cost=round(agent_cost, 4),
                    tokens=agent_tokens,
                    percentage=round(percentage, 1),
                )
            )

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
        total_tasks_query = select(func.count(TaskModel.id)).where(TaskModel.created_at >= start)
        if project_id:
            total_tasks_query = total_tasks_query.join(
                SessionModel, TaskModel.session_id == SessionModel.id
            ).where(SessionModel.project_id == project_id)
        total_tasks_result = await db.execute(total_tasks_query)
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

    # ─────────────────────────────────────────────────────────────
    # Multi-Project Comparison
    # ─────────────────────────────────────────────────────────────

    # Color palette for multi-project chart lines
    MULTI_PROJECT_COLORS = [
        "#8884d8",  # Purple
        "#82ca9d",  # Green
        "#ffc658",  # Yellow
        "#ff7300",  # Orange
        "#00C49F",  # Teal
    ]

    @staticmethod
    def get_multi_project_trends(
        project_ids: list[str],
        metric: str,
        time_range: TimeRange = TimeRange.WEEK,
    ) -> MultiProjectTrendsResponse:
        """Get trend data for multiple projects (mock data)."""
        delta = _get_time_delta(time_range)
        interval = _get_interval(time_range)
        now = datetime.utcnow()
        start = now - delta

        series = []
        for idx, project_id in enumerate(project_ids):
            # Get project name from registry
            project = get_project(project_id)
            project_name = project.name if project else project_id

            # Generate mock data points
            data_points = []
            current = start
            while current <= now:
                # Simulate different base values per project
                base_multiplier = 1.0 + (idx * 0.3)

                if metric == "tasks":
                    value = random.randint(5, 20) * base_multiplier
                elif metric == "tokens":
                    value = random.randint(10000, 50000) * base_multiplier
                elif metric == "cost":
                    value = round(random.uniform(0.5, 2.0) * base_multiplier, 3)
                elif metric == "success_rate":
                    value = round(random.uniform(85, 99), 1)
                else:
                    value = random.randint(1, 10) * base_multiplier

                data_points.append(
                    TrendDataPoint(
                        timestamp=current,
                        value=value,
                        label=current.strftime("%Y-%m-%d %H:%M"),
                    )
                )
                current += interval

            series.append(
                ProjectTrendSeries(
                    project_id=project_id,
                    project_name=project_name,
                    color=AnalyticsService.MULTI_PROJECT_COLORS[
                        idx % len(AnalyticsService.MULTI_PROJECT_COLORS)
                    ],
                    data=data_points,
                )
            )

        return MultiProjectTrendsResponse(
            metric=metric,
            period=time_range,
            series=series,
        )

    @staticmethod
    async def get_multi_project_trends_async(
        db: AsyncSession,
        project_ids: list[str],
        metric: str,
        time_range: TimeRange = TimeRange.WEEK,
    ) -> MultiProjectTrendsResponse:
        """Get trend data for multiple projects from database."""
        delta = _get_time_delta(time_range)
        interval = _get_interval(time_range)
        now = datetime.utcnow()
        start = now - delta

        series = []
        for idx, project_id in enumerate(project_ids):
            # Get project name from registry
            project = get_project(project_id)
            project_name = project.name if project else project_id

            # Get sessions and tasks for this project
            session_query = select(SessionModel).where(
                and_(SessionModel.project_id == project_id, SessionModel.created_at >= start)
            )
            session_result = await db.execute(session_query)
            sessions = session_result.scalars().all()

            task_query = (
                select(TaskModel)
                .join(SessionModel, TaskModel.session_id == SessionModel.id)
                .where(and_(SessionModel.project_id == project_id, TaskModel.created_at >= start))
                .order_by(TaskModel.created_at)
            )
            task_result = await db.execute(task_query)
            tasks = task_result.scalars().all()

            # Build time buckets
            data_points = []
            current = start
            while current <= now:
                bucket_end = current + interval

                # Calculate metric value for this bucket
                if metric == "tasks":
                    bucket_tasks = [t for t in tasks if current <= t.created_at < bucket_end]
                    value = len(bucket_tasks)
                elif metric == "tokens":
                    bucket_sessions = [s for s in sessions if current <= s.updated_at < bucket_end]
                    value = sum(s.total_tokens or 0 for s in bucket_sessions)
                elif metric == "cost":
                    bucket_sessions = [s for s in sessions if current <= s.updated_at < bucket_end]
                    value = round(sum(s.total_cost_usd or 0 for s in bucket_sessions), 3)
                elif metric == "success_rate":
                    bucket_tasks = [t for t in tasks if current <= t.created_at < bucket_end]
                    completed = len([t for t in bucket_tasks if t.status == "completed"])
                    failed = len([t for t in bucket_tasks if t.status == "failed"])
                    value = (
                        round((completed / (completed + failed)) * 100, 1)
                        if (completed + failed) > 0
                        else 0
                    )
                else:
                    value = 0

                data_points.append(
                    TrendDataPoint(
                        timestamp=current,
                        value=value,
                        label=current.strftime("%Y-%m-%d %H:%M"),
                    )
                )
                current += interval

            series.append(
                ProjectTrendSeries(
                    project_id=project_id,
                    project_name=project_name,
                    color=AnalyticsService.MULTI_PROJECT_COLORS[
                        idx % len(AnalyticsService.MULTI_PROJECT_COLORS)
                    ],
                    data=data_points,
                )
            )

        return MultiProjectTrendsResponse(
            metric=metric,
            period=time_range,
            series=series,
        )
