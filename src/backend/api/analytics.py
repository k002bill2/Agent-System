"""Analytics API routes.

Always uses Claude session file data (_from_sessions methods) since that's
where actual session data lives. DB-based methods are kept for future use but
analytics always reads from discovered session files.
"""

from fastapi import APIRouter, HTTPException, Query

from models.analytics import (
    ActivityHeatmap,
    AgentPerformanceList,
    AnalyticsDashboard,
    CostAnalytics,
    ErrorAnalytics,
    MultiProjectTrendsResponse,
    MultiTrendData,
    OverviewMetrics,
    TimeRange,
)
from services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=OverviewMetrics)
async def get_overview(
    project_id: str | None = Query(default=None, description="Filter by project name"),
):
    """Get high-level overview metrics."""
    return AnalyticsService.get_overview_from_sessions(project_name=project_id)


@router.get("/trends", response_model=MultiTrendData)
async def get_trends(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project name"),
):
    """Get trend data over time."""
    return AnalyticsService.get_trends_from_sessions(time_range, project_name=project_id)


@router.get("/agents", response_model=AgentPerformanceList)
async def get_agent_performance(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project name"),
):
    """Get performance metrics by model."""
    return AnalyticsService.get_agent_performance_from_sessions(
        time_range, project_name=project_id
    )


@router.get("/costs", response_model=CostAnalytics)
async def get_cost_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project name"),
):
    """Get cost analytics breakdown."""
    return AnalyticsService.get_cost_analytics_from_sessions(time_range, project_name=project_id)


@router.get("/activity", response_model=ActivityHeatmap)
async def get_activity_heatmap(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project name"),
):
    """Get activity heatmap data."""
    return AnalyticsService.get_activity_heatmap_from_sessions(
        time_range, project_name=project_id
    )


@router.get("/errors", response_model=ErrorAnalytics)
async def get_error_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project name"),
):
    """Get error analytics breakdown."""
    return AnalyticsService.get_error_analytics_from_sessions(
        time_range, project_name=project_id
    )


@router.get("/dashboard", response_model=AnalyticsDashboard)
async def get_dashboard(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project name"),
):
    """Get complete analytics dashboard data."""
    return AnalyticsService.get_dashboard_from_sessions(time_range, project_name=project_id)


@router.get("/trends/compare", response_model=MultiProjectTrendsResponse)
async def get_multi_project_trends(
    project_ids: list[str] = Query(..., description="비교할 프로젝트 ID 목록 (최대 5개)"),
    metric: str = Query("tasks", description="메트릭: tasks, tokens, cost, success_rate"),
    time_range: TimeRange = Query(
        default=TimeRange.WEEK, description="기간: 1h, 24h, 7d, 30d, all"
    ),
):
    """여러 프로젝트의 트렌드 데이터를 비교합니다."""
    if len(project_ids) > 5:
        raise HTTPException(status_code=400, detail="최대 5개 프로젝트까지 비교 가능합니다")

    if len(project_ids) < 1:
        raise HTTPException(status_code=400, detail="최소 1개 프로젝트를 선택해야 합니다")

    valid_metrics = {"tasks", "tokens", "cost", "success_rate"}
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"유효하지 않은 메트릭입니다. 사용 가능: {', '.join(valid_metrics)}",
        )

    return AnalyticsService.get_multi_project_trends(project_ids, metric, time_range)
