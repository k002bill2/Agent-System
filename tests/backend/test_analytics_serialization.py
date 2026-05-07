"""응답 직렬화 형식 회귀 방지 테스트.

P0 — 응답 timestamp에 timezone suffix가 포함되어
프론트엔드 `new Date(iso)`가 로컬 시간이 아닌 UTC로 해석하도록 보장.
"""

from datetime import UTC, datetime

import pytest

from models.analytics import (
    ActivityHeatmap,
    AgentPerformanceList,
    AnalyticsDashboard,
    CostAnalytics,
    ErrorAnalytics,
    ErrorBreakdown,
    MultiTrendData,
    OverviewMetrics,
    TimeRange,
    TrendDataPoint,
)
from utils.time import to_naive_utc, to_utc_iso


class TestToUtcIso:
    """utils.time.to_utc_iso 헬퍼 단위 테스트."""

    def test_naive_datetime_gets_utc_suffix(self):
        dt = datetime(2026, 5, 1, 12, 0, 0)  # naive
        result = to_utc_iso(dt)
        assert result is not None
        assert result.endswith("+00:00"), f"naive를 UTC로 처리해야 하는데: {result}"

    def test_aware_datetime_preserves_offset(self):
        dt = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
        result = to_utc_iso(dt)
        assert result == "2026-05-01T12:00:00+00:00"

    def test_none_returns_none(self):
        assert to_utc_iso(None) is None

    def test_round_trip_through_js_compatible_parse(self):
        """ISO+offset은 JS Date()가 UTC로 정확히 해석하는 형식."""
        dt = datetime(2026, 5, 1, 18, 4, 34)
        iso = to_utc_iso(dt)
        # Python 측에서 다시 파싱 시 동일 시각으로 복원되는지
        parsed = datetime.fromisoformat(iso)
        assert parsed == dt.replace(tzinfo=UTC)


class TestToNaiveUtc:
    """utils.time.to_naive_utc 헬퍼 단위 테스트 (P3 SSoT)."""

    def test_naive_passthrough(self):
        dt = datetime(2026, 5, 1, 12, 0, 0)
        assert to_naive_utc(dt) == dt
        assert to_naive_utc(dt).tzinfo is None

    def test_aware_utc_strips_tzinfo(self):
        dt = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
        result = to_naive_utc(dt)
        assert result == datetime(2026, 5, 1, 12, 0, 0)
        assert result.tzinfo is None

    def test_aware_non_utc_converts_then_strips(self):
        from datetime import timedelta, timezone
        kst = timezone(timedelta(hours=9))
        dt = datetime(2026, 5, 2, 3, 0, 0, tzinfo=kst)  # KST 03:00 = UTC 18:00 (전날)
        result = to_naive_utc(dt)
        assert result == datetime(2026, 5, 1, 18, 0, 0)


class TestTrendDataPointSerialization:
    """TrendDataPoint 직렬화 회귀 방지."""

    def test_timestamp_serialized_with_offset(self):
        point = TrendDataPoint(
            timestamp=datetime(2026, 5, 1, 12, 0, 0),  # naive UTC
            value=1.0,
            label="test",
        )
        dumped = point.model_dump()
        assert dumped["timestamp"].endswith("+00:00"), (
            f"timestamp에 timezone suffix가 있어야 한다: {dumped['timestamp']}"
        )

    def test_json_dump_keeps_offset(self):
        point = TrendDataPoint(
            timestamp=datetime(2026, 5, 1, 12, 0, 0),
            value=1.0,
        )
        json_str = point.model_dump_json()
        assert "+00:00" in json_str or "Z" in json_str, (
            f"JSON 직렬화에도 timezone suffix가 있어야 한다: {json_str}"
        )

    def test_existing_aware_datetime_unchanged_semantics(self):
        """이미 tz-aware UTC라면 동일하게 출력."""
        point = TrendDataPoint(
            timestamp=datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC),
            value=1.0,
        )
        dumped = point.model_dump()
        assert dumped["timestamp"] == "2026-05-01T12:00:00+00:00"


class TestErrorBreakdownSerialization:
    """ErrorBreakdown.last_occurred 직렬화."""

    def test_last_occurred_serialized_with_offset(self):
        eb = ErrorBreakdown(
            error_type="TimeoutError",
            count=3,
            percentage=0.5,
            last_occurred=datetime(2026, 5, 1, 10, 30, 0),
        )
        dumped = eb.model_dump()
        assert dumped["last_occurred"] is not None
        assert dumped["last_occurred"].endswith("+00:00")

    def test_last_occurred_none_remains_none(self):
        eb = ErrorBreakdown(
            error_type="X",
            count=0,
            percentage=0.0,
            last_occurred=None,
        )
        dumped = eb.model_dump()
        assert dumped["last_occurred"] is None


class TestAnalyticsDashboardSerialization:
    """전체 Dashboard 응답의 generated_at 직렬화."""

    def test_generated_at_serialized_with_offset(self):
        dashboard = AnalyticsDashboard(
            overview=OverviewMetrics(),
            trends=MultiTrendData(time_range=TimeRange.DAY),
            agents=AgentPerformanceList(agents=[], time_range=TimeRange.DAY),
            costs=CostAnalytics(time_range=TimeRange.DAY),
            activity=ActivityHeatmap(cells=[], time_range=TimeRange.DAY),
            errors=ErrorAnalytics(time_range=TimeRange.DAY),
        )
        dumped = dashboard.model_dump()
        assert dumped["generated_at"].endswith("+00:00")


@pytest.mark.parametrize(
    "kst_local, expected_utc_suffix",
    [
        # KST 자정 직후 데이터 — 사용자가 가장 자주 보고하는 케이스
        (datetime(2026, 5, 2, 0, 30, 0), "+00:00"),
        # KST 자정 직전 (전날 23:50)
        (datetime(2026, 5, 1, 23, 50, 0), "+00:00"),
    ],
)
def test_kst_midnight_boundary_case(kst_local, expected_utc_suffix):
    """KST 자정 경계 시간이 들어와도 응답에 UTC offset이 부여되어
    JS 측에서 명시적으로 해석 가능한지 확인."""
    point = TrendDataPoint(timestamp=kst_local, value=1.0)
    dumped = point.model_dump()
    assert dumped["timestamp"].endswith(expected_utc_suffix)
