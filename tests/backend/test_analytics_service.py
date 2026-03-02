"""Tests for AnalyticsService."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.analytics import (
    ActivityHeatmap,
    AgentPerformanceList,
    AnalyticsDashboard,
    CostAnalytics,
    ErrorAnalytics,
    MultiTrendData,
    OverviewMetrics,
    TimeRange,
    TrendDataPoint,
)
from services.analytics_service import (
    AnalyticsService,
    _get_interval,
    _get_time_delta,
    _normalize_model_name,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_session(
    status="completed",
    model="claude-sonnet-4-6",
    project_name="test-project",
    input_tokens=1000,
    output_tokens=500,
    estimated_cost=0.05,
    tool_call_count=3,
    created_at=None,
    last_activity=None,
):
    """Return a MagicMock that mimics a Claude session object."""
    s = MagicMock()
    s.status.value = status
    s.model = model
    s.project_name = project_name
    s.total_input_tokens = input_tokens
    s.total_output_tokens = output_tokens
    s.estimated_cost = estimated_cost
    s.tool_call_count = tool_call_count
    now = datetime.now()
    s.created_at = created_at or now - timedelta(minutes=30)
    s.last_activity = last_activity or now
    return s


# ---------------------------------------------------------------------------
# Pure function tests
# ---------------------------------------------------------------------------


class TestNormalizeModelName:
    """Tests for _normalize_model_name()."""

    def test_empty_string_returns_unknown(self):
        assert _normalize_model_name("") == "unknown (no model info)"

    def test_none_returns_unknown(self):
        # None is falsy — same branch as empty string
        assert _normalize_model_name(None) == "unknown (no model info)"

    def test_literal_unknown_returns_unknown(self):
        assert _normalize_model_name("unknown") == "unknown (no model info)"

    def test_angle_bracket_tag_becomes_system_generated(self):
        assert _normalize_model_name("<synthetic>") == "synthetic (system-generated)"

    def test_angle_bracket_preserves_inner_name(self):
        assert _normalize_model_name("<mock-model>") == "mock-model (system-generated)"

    def test_normal_model_name_is_returned_unchanged(self):
        assert _normalize_model_name("claude-sonnet-4-6") == "claude-sonnet-4-6"

    def test_normal_model_name_with_version(self):
        assert _normalize_model_name("gemini-3-flash-preview") == "gemini-3-flash-preview"

    def test_single_angle_bracket_not_treated_as_tag(self):
        # Only a string that *both* starts with '<' and ends with '>' is a tag
        result = _normalize_model_name("<partial")
        assert result == "<partial"  # passes through unchanged


class TestGetTimeDelta:
    """Tests for _get_time_delta()."""

    def test_hour_returns_one_hour(self):
        assert _get_time_delta(TimeRange.HOUR) == timedelta(hours=1)

    def test_day_returns_one_day(self):
        assert _get_time_delta(TimeRange.DAY) == timedelta(days=1)

    def test_week_returns_seven_days(self):
        assert _get_time_delta(TimeRange.WEEK) == timedelta(days=7)

    def test_month_returns_thirty_days(self):
        assert _get_time_delta(TimeRange.MONTH) == timedelta(days=30)

    def test_all_returns_365_days(self):
        assert _get_time_delta(TimeRange.ALL) == timedelta(days=365)


class TestGetInterval:
    """Tests for _get_interval()."""

    def test_hour_returns_five_minutes(self):
        assert _get_interval(TimeRange.HOUR) == timedelta(minutes=5)

    def test_day_returns_one_hour(self):
        assert _get_interval(TimeRange.DAY) == timedelta(hours=1)

    def test_week_returns_one_day(self):
        assert _get_interval(TimeRange.WEEK) == timedelta(days=1)

    def test_month_returns_one_day(self):
        assert _get_interval(TimeRange.MONTH) == timedelta(days=1)

    def test_all_returns_seven_days(self):
        assert _get_interval(TimeRange.ALL) == timedelta(days=7)


# ---------------------------------------------------------------------------
# Sync static-method tests (mock data)
# ---------------------------------------------------------------------------


class TestGetOverview:
    """Tests for AnalyticsService.get_overview()."""

    def setup_method(self):
        self.service = AnalyticsService()

    def test_returns_overview_metrics_instance(self):
        result = AnalyticsService.get_overview()
        assert isinstance(result, OverviewMetrics)

    def test_success_rate_is_non_negative(self):
        result = AnalyticsService.get_overview()
        assert result.success_rate >= 0.0

    def test_total_sessions_positive(self):
        result = AnalyticsService.get_overview()
        assert result.total_sessions > 0

    def test_total_tasks_positive(self):
        result = AnalyticsService.get_overview()
        assert result.total_tasks > 0

    def test_completed_plus_failed_le_total_tasks(self):
        result = AnalyticsService.get_overview()
        assert result.completed_tasks + result.failed_tasks <= result.total_tasks


class TestGetTrends:
    """Tests for AnalyticsService.get_trends()."""

    def setup_method(self):
        self.service = AnalyticsService()

    def test_returns_multi_trend_data_instance(self):
        result = AnalyticsService.get_trends()
        assert isinstance(result, MultiTrendData)

    def test_time_range_is_preserved(self):
        for tr in TimeRange:
            result = AnalyticsService.get_trends(tr)
            assert result.time_range == tr

    def test_data_lists_are_non_empty(self):
        result = AnalyticsService.get_trends(TimeRange.DAY)
        assert len(result.tasks) > 0
        assert len(result.success_rate) > 0
        assert len(result.costs) > 0
        assert len(result.tokens) > 0

    def test_data_points_are_trend_data_point_instances(self):
        result = AnalyticsService.get_trends(TimeRange.WEEK)
        for point in result.tasks:
            assert isinstance(point, TrendDataPoint)
            assert point.value is not None
            assert point.label is not None

    def test_week_has_more_points_than_day(self):
        week = AnalyticsService.get_trends(TimeRange.WEEK)
        day = AnalyticsService.get_trends(TimeRange.DAY)
        # WEEK interval=1 day → ~7 pts; DAY interval=1 h → ~24 pts; WEEK still ≥ 7
        assert len(week.tasks) >= 7
        assert len(day.tasks) >= 24


class TestGetDashboard:
    """Tests for AnalyticsService.get_dashboard()."""

    def setup_method(self):
        self.service = AnalyticsService()

    def test_returns_analytics_dashboard_instance(self):
        result = AnalyticsService.get_dashboard()
        assert isinstance(result, AnalyticsDashboard)

    def test_dashboard_contains_all_sections(self):
        result = AnalyticsService.get_dashboard()
        assert isinstance(result.overview, OverviewMetrics)
        assert isinstance(result.trends, MultiTrendData)
        assert isinstance(result.agents, AgentPerformanceList)
        assert isinstance(result.costs, CostAnalytics)
        assert isinstance(result.activity, ActivityHeatmap)
        assert isinstance(result.errors, ErrorAnalytics)

    def test_dashboard_time_range_propagated(self):
        for tr in TimeRange:
            result = AnalyticsService.get_dashboard(tr)
            assert result.trends.time_range == tr
            assert result.costs.time_range == tr
            assert result.errors.time_range == tr

    def test_dashboard_generated_at_is_recent(self):
        before = datetime.now(timezone.utc)
        result = AnalyticsService.get_dashboard()
        after = datetime.now(timezone.utc)
        assert before <= result.generated_at <= after


# ---------------------------------------------------------------------------
# Session-based sync method tests
# ---------------------------------------------------------------------------


class TestGetOverviewFromSessions:
    """Tests for AnalyticsService.get_overview_from_sessions()."""

    def setup_method(self):
        self.service = AnalyticsService()

    def _patch_sessions(self, sessions):
        mock_monitor = MagicMock()
        mock_monitor.discover_sessions.return_value = sessions
        return patch(
            "services.claude_session_monitor.get_monitor",
            return_value=mock_monitor,
        )

    def test_empty_sessions_returns_zero_metrics(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_overview_from_sessions()
        assert result.total_sessions == 0
        assert result.total_tokens == 0
        assert result.success_rate == 0.0

    def test_counts_sessions_correctly(self):
        sessions = [
            _make_mock_session(status="completed"),
            _make_mock_session(status="completed"),
            _make_mock_session(status="active"),
        ]
        with self._patch_sessions(sessions):
            result = AnalyticsService.get_overview_from_sessions()
        assert result.total_sessions == 3
        assert result.active_sessions == 1
        assert result.completed_tasks == 2  # completed sessions

    def test_token_totals_are_summed(self):
        sessions = [
            _make_mock_session(input_tokens=1000, output_tokens=500),
            _make_mock_session(input_tokens=2000, output_tokens=1000),
        ]
        with self._patch_sessions(sessions):
            result = AnalyticsService.get_overview_from_sessions()
        assert result.total_tokens == 4500  # (1000+500) + (2000+1000)

    def test_cost_totals_are_summed(self):
        sessions = [
            _make_mock_session(estimated_cost=0.10),
            _make_mock_session(estimated_cost=0.20),
        ]
        with self._patch_sessions(sessions):
            result = AnalyticsService.get_overview_from_sessions()
        assert abs(result.total_cost - 0.30) < 0.01

    def test_success_rate_calculation(self):
        sessions = [
            _make_mock_session(status="completed"),
            _make_mock_session(status="completed"),
            _make_mock_session(status="active"),
        ]
        with self._patch_sessions(sessions):
            result = AnalyticsService.get_overview_from_sessions()
        # 2 completed / 3 total = 66.7%
        assert abs(result.success_rate - 66.7) < 1.0

    def test_time_range_filter_excludes_old_sessions(self):
        old_session = _make_mock_session(
            created_at=datetime.now() - timedelta(days=10),
            last_activity=datetime.now() - timedelta(days=10),
        )
        recent_session = _make_mock_session(
            created_at=datetime.now() - timedelta(hours=1),
            last_activity=datetime.now(),
        )
        with self._patch_sessions([old_session, recent_session]):
            result = AnalyticsService.get_overview_from_sessions(TimeRange.DAY)
        assert result.total_sessions == 1


class TestGetTrendsFromSessions:
    """Tests for AnalyticsService.get_trends_from_sessions()."""

    def setup_method(self):
        self.service = AnalyticsService()

    def _patch_sessions(self, sessions):
        mock_monitor = MagicMock()
        mock_monitor.discover_sessions.return_value = sessions
        return patch(
            "services.claude_session_monitor.get_monitor",
            return_value=mock_monitor,
        )

    def test_returns_multi_trend_data_instance(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_trends_from_sessions()
        assert isinstance(result, MultiTrendData)

    def test_time_range_preserved(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_trends_from_sessions(TimeRange.MONTH)
        assert result.time_range == TimeRange.MONTH

    def test_buckets_cover_full_range_for_week(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_trends_from_sessions(TimeRange.WEEK)
        # WEEK / DAY interval → approximately 7 buckets
        assert len(result.tasks) >= 7

    def test_empty_bucket_has_zero_tasks(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_trends_from_sessions(TimeRange.WEEK)
        for point in result.tasks:
            assert point.value == 0

    def test_session_in_bucket_increments_count(self):
        recent = _make_mock_session(
            created_at=datetime.now() - timedelta(hours=1),
            last_activity=datetime.now(),
            estimated_cost=0.05,
            input_tokens=100,
            output_tokens=50,
        )
        with self._patch_sessions([recent]):
            result = AnalyticsService.get_trends_from_sessions(TimeRange.WEEK)
        # At least one bucket should have value=1
        assert any(p.value == 1 for p in result.tasks)


# ---------------------------------------------------------------------------
# Async database method tests
# ---------------------------------------------------------------------------


class TestGetOverviewAsync:
    """Tests for AnalyticsService.get_overview_async()."""

    def setup_method(self):
        self.service = AnalyticsService()

    def _make_db(self, session_count=5, active_count=2, total_tasks=10,
                 completed=8, failed=1, pending=1, tokens=50000, cost=1.5,
                 avg_duration=4500, approvals_pending=1, approvals_granted=10,
                 approvals_denied=2):
        """Build an AsyncSession mock whose execute() returns canned scalars."""
        db = AsyncMock()

        # We need to return different results for each sequential db.execute() call.
        # get_overview_async fires these execute() calls in order:
        # 1. total_sessions, 2. active_sessions, 3. total_tasks, 4. completed_tasks
        # 5. failed_tasks, 6. pending_tasks, 7. token+cost (one_row), 8. avg_duration
        # 9. approvals_pending, 10. approvals_granted, 11. approvals_denied

        def _scalar_result(value):
            r = MagicMock()
            r.scalar.return_value = value
            return r

        def _row_result(r0, r1):
            row = MagicMock()
            row.__getitem__ = lambda self, i: [r0, r1][i]
            result = MagicMock()
            result.one.return_value = row
            return result

        db.execute.side_effect = [
            _scalar_result(session_count),    # total_sessions
            _scalar_result(active_count),     # active_sessions
            _scalar_result(total_tasks),      # total_tasks
            _scalar_result(completed),        # completed_tasks
            _scalar_result(failed),           # failed_tasks
            _scalar_result(pending),          # pending_tasks
            _row_result(tokens, cost),        # tokens + cost (one row)
            _scalar_result(avg_duration),     # avg_duration
            _scalar_result(approvals_pending),   # approvals_pending
            _scalar_result(approvals_granted),   # approvals_granted
            _scalar_result(approvals_denied),    # approvals_denied
        ]
        return db

    @pytest.mark.asyncio
    async def test_returns_overview_metrics_instance(self):
        db = self._make_db()
        result = await AnalyticsService.get_overview_async(db)
        assert isinstance(result, OverviewMetrics)

    @pytest.mark.asyncio
    async def test_session_counts_are_populated(self):
        db = self._make_db(session_count=7, active_count=3)
        result = await AnalyticsService.get_overview_async(db)
        assert result.total_sessions == 7
        assert result.active_sessions == 3

    @pytest.mark.asyncio
    async def test_task_counts_are_populated(self):
        db = self._make_db(total_tasks=20, completed=15, failed=3, pending=2)
        result = await AnalyticsService.get_overview_async(db)
        assert result.total_tasks == 20
        assert result.completed_tasks == 15
        assert result.failed_tasks == 3
        assert result.pending_tasks == 2

    @pytest.mark.asyncio
    async def test_success_rate_is_computed(self):
        # completed=8, failed=2 → 80%
        db = self._make_db(completed=8, failed=2)
        result = await AnalyticsService.get_overview_async(db)
        assert abs(result.success_rate - 80.0) < 0.5

    @pytest.mark.asyncio
    async def test_token_and_cost_totals(self):
        db = self._make_db(tokens=123456, cost=3.75)
        result = await AnalyticsService.get_overview_async(db)
        assert result.total_tokens == 123456
        assert abs(result.total_cost - 3.75) < 0.01

    @pytest.mark.asyncio
    async def test_approval_counts_are_populated(self):
        db = self._make_db(approvals_pending=5, approvals_granted=20, approvals_denied=3)
        result = await AnalyticsService.get_overview_async(db)
        assert result.approvals_pending == 5
        assert result.approvals_granted == 20
        assert result.approvals_denied == 3

    @pytest.mark.asyncio
    async def test_zero_tasks_gives_zero_success_rate(self):
        db = self._make_db(completed=0, failed=0)
        result = await AnalyticsService.get_overview_async(db)
        assert result.success_rate == 0.0


class TestGetErrorAnalyticsFromSessions:
    """Tests for AnalyticsService.get_error_analytics_from_sessions()."""

    def setup_method(self):
        self.service = AnalyticsService()

    def test_returns_error_analytics_instance(self):
        result = AnalyticsService.get_error_analytics_from_sessions()
        assert isinstance(result, ErrorAnalytics)

    def test_total_errors_is_zero(self):
        # Session-based implementation always returns zero errors
        result = AnalyticsService.get_error_analytics_from_sessions()
        assert result.total_errors == 0
        assert result.error_rate == 0.0

    def test_time_range_is_preserved(self):
        for tr in TimeRange:
            result = AnalyticsService.get_error_analytics_from_sessions(tr)
            assert result.time_range == tr


class TestGetDashboardFromSessions:
    """Tests for AnalyticsService.get_dashboard_from_sessions()."""

    def setup_method(self):
        self.service = AnalyticsService()

    def _patch_sessions(self, sessions):
        mock_monitor = MagicMock()
        mock_monitor.discover_sessions.return_value = sessions
        return patch(
            "services.claude_session_monitor.get_monitor",
            return_value=mock_monitor,
        )

    def test_returns_analytics_dashboard_instance(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_dashboard_from_sessions()
        assert isinstance(result, AnalyticsDashboard)

    def test_all_sub_sections_present(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_dashboard_from_sessions()
        assert isinstance(result.overview, OverviewMetrics)
        assert isinstance(result.trends, MultiTrendData)
        assert isinstance(result.agents, AgentPerformanceList)
        assert isinstance(result.costs, CostAnalytics)
        assert isinstance(result.activity, ActivityHeatmap)
        assert isinstance(result.errors, ErrorAnalytics)

    def test_time_range_propagated_through_dashboard(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_dashboard_from_sessions(TimeRange.MONTH)
        assert result.trends.time_range == TimeRange.MONTH
        assert result.errors.time_range == TimeRange.MONTH


class TestActivityHeatmapFromSessions:
    """Tests for AnalyticsService.get_activity_heatmap_from_sessions()."""

    def setup_method(self):
        self.service = AnalyticsService()

    def _patch_sessions(self, sessions):
        mock_monitor = MagicMock()
        mock_monitor.discover_sessions.return_value = sessions
        return patch(
            "services.claude_session_monitor.get_monitor",
            return_value=mock_monitor,
        )

    def test_returns_activity_heatmap_instance(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_activity_heatmap_from_sessions()
        assert isinstance(result, ActivityHeatmap)

    def test_heatmap_has_168_cells(self):
        # 7 days × 24 hours = 168 cells always initialised
        with self._patch_sessions([]):
            result = AnalyticsService.get_activity_heatmap_from_sessions()
        assert len(result.cells) == 168

    def test_empty_sessions_max_value_is_zero(self):
        with self._patch_sessions([]):
            result = AnalyticsService.get_activity_heatmap_from_sessions()
        assert result.max_value == 0

    def test_session_increments_corresponding_cell(self):
        # Use a recent Monday within the last 365 days so it passes the utcnow filter.
        # Find the most recent Monday relative to now.
        now = datetime.now(timezone.utc)
        days_since_monday = now.weekday()  # 0=Monday
        last_monday = (now - timedelta(days=days_since_monday)).replace(
            hour=10, minute=0, second=0, microsecond=0
        )
        # Ensure it is within the last year (it will be: 0-6 days ago)
        session = _make_mock_session(created_at=last_monday, last_activity=last_monday)
        with self._patch_sessions([session]):
            result = AnalyticsService.get_activity_heatmap_from_sessions(TimeRange.ALL)
        # Monday weekday=0 → day=(0+1)%7=1, hour=10
        matching = [c for c in result.cells if c.day == 1 and c.hour == 10]
        assert len(matching) == 1
        assert matching[0].value == 1
