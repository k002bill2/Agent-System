"""Analytics API routes.

Always uses Claude session file data (_from_sessions methods) since that's
where actual session data lives. DB-based methods are kept for future use but
analytics always reads from discovered session files.

Project filtering: the frontend sends DB ProjectModel UUIDs. Sessions on disk
only know their cwd, so this layer resolves a project_id to its filesystem
path before delegating to the service. When a project_id has no matching DB
row (or no `path` configured), a sentinel path is forwarded so the service
returns an empty result set instead of silently aggregating across projects.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session
from db.models.project import ProjectModel
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

# Forwarded to the service when a project_id resolves to nothing matchable.
# No real cwd will ever equal this, so the session filter returns [].
_NO_MATCH_PATH = "/__aos_no_match_sentinel__"


async def _resolve_project_path(project_id: str | None, db: AsyncSession) -> str | None:
    """Resolve a Project UUID to its filesystem path for session matching.

    Returns:
        - None when no filtering is requested (project_id is empty).
        - The project's resolved `path` when found and configured.
        - `_NO_MATCH_PATH` when the project doesn't exist or has no path,
          which yields an empty session set downstream.
    """
    if not project_id:
        return None

    project = await db.get(ProjectModel, project_id)
    if project is None or not project.path:
        return _NO_MATCH_PATH

    return project.path


@router.get("/overview", response_model=OverviewMetrics)
async def get_overview(
    time_range: TimeRange = Query(default=TimeRange.ALL, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project UUID"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get high-level overview metrics."""
    project_path = await _resolve_project_path(project_id, db)
    return AnalyticsService.get_overview_from_sessions(time_range, project_path=project_path)


@router.get("/trends", response_model=MultiTrendData)
async def get_trends(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project UUID"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get trend data over time."""
    project_path = await _resolve_project_path(project_id, db)
    return AnalyticsService.get_trends_from_sessions(time_range, project_path=project_path)


@router.get("/agents", response_model=AgentPerformanceList)
async def get_agent_performance(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project UUID"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get performance metrics by model."""
    project_path = await _resolve_project_path(project_id, db)
    return AnalyticsService.get_agent_performance_from_sessions(
        time_range, project_path=project_path
    )


@router.get("/costs", response_model=CostAnalytics)
async def get_cost_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project UUID"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get cost analytics breakdown."""
    project_path = await _resolve_project_path(project_id, db)
    return AnalyticsService.get_cost_analytics_from_sessions(time_range, project_path=project_path)


@router.get("/activity", response_model=ActivityHeatmap)
async def get_activity_heatmap(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project UUID"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get activity heatmap data."""
    project_path = await _resolve_project_path(project_id, db)
    return AnalyticsService.get_activity_heatmap_from_sessions(
        time_range, project_path=project_path
    )


@router.get("/errors", response_model=ErrorAnalytics)
async def get_error_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project UUID"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get error analytics breakdown."""
    project_path = await _resolve_project_path(project_id, db)
    return AnalyticsService.get_error_analytics_from_sessions(time_range, project_path=project_path)


@router.get("/dashboard", response_model=AnalyticsDashboard)
async def get_dashboard(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project UUID"),
    db: AsyncSession = Depends(get_db_session),
):
    """Get complete analytics dashboard data."""
    project_path = await _resolve_project_path(project_id, db)
    return AnalyticsService.get_dashboard_from_sessions(time_range, project_path=project_path)


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
