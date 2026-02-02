"""Analytics API routes."""

import os
from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from models.analytics import (
    TimeRange,
    OverviewMetrics,
    MultiTrendData,
    AgentPerformanceList,
    CostAnalytics,
    ActivityHeatmap,
    ErrorAnalytics,
    AnalyticsDashboard,
    MultiProjectTrendsResponse,
)
from services.analytics_service import AnalyticsService


router = APIRouter(prefix="/analytics", tags=["analytics"])

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


@router.get("/overview", response_model=OverviewMetrics)
async def get_overview(
    project_id: str | None = Query(default=None, description="Filter by project"),
    db: AsyncSession = Depends(get_db),
):
    """Get high-level overview metrics."""
    if USE_DATABASE:
        return await AnalyticsService.get_overview_async(db, project_id=project_id)
    return AnalyticsService.get_overview()


@router.get("/trends", response_model=MultiTrendData)
async def get_trends(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project"),
    db: AsyncSession = Depends(get_db),
):
    """Get trend data over time."""
    if USE_DATABASE:
        return await AnalyticsService.get_trends_async(db, time_range, project_id=project_id)
    return AnalyticsService.get_trends(time_range)


@router.get("/agents", response_model=AgentPerformanceList)
async def get_agent_performance(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project"),
    db: AsyncSession = Depends(get_db),
):
    """Get performance metrics for all agents."""
    if USE_DATABASE:
        return await AnalyticsService.get_agent_performance_async(db, time_range, project_id=project_id)
    return AnalyticsService.get_agent_performance(time_range)


@router.get("/costs", response_model=CostAnalytics)
async def get_cost_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project"),
    db: AsyncSession = Depends(get_db),
):
    """Get cost analytics breakdown."""
    if USE_DATABASE:
        return await AnalyticsService.get_cost_analytics_async(db, time_range, project_id=project_id)
    return AnalyticsService.get_cost_analytics(time_range)


@router.get("/activity", response_model=ActivityHeatmap)
async def get_activity_heatmap(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project"),
    db: AsyncSession = Depends(get_db),
):
    """Get activity heatmap data."""
    if USE_DATABASE:
        return await AnalyticsService.get_activity_heatmap_async(db, time_range, project_id=project_id)
    return AnalyticsService.get_activity_heatmap(time_range)


@router.get("/errors", response_model=ErrorAnalytics)
async def get_error_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project"),
    db: AsyncSession = Depends(get_db),
):
    """Get error analytics breakdown."""
    if USE_DATABASE:
        return await AnalyticsService.get_error_analytics_async(db, time_range, project_id=project_id)
    return AnalyticsService.get_error_analytics(time_range)


@router.get("/dashboard", response_model=AnalyticsDashboard)
async def get_dashboard(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    project_id: str | None = Query(default=None, description="Filter by project"),
    db: AsyncSession = Depends(get_db),
):
    """Get complete analytics dashboard data."""
    if USE_DATABASE:
        return await AnalyticsService.get_dashboard_async(db, time_range, project_id=project_id)
    return AnalyticsService.get_dashboard(time_range)


@router.get("/trends/compare", response_model=MultiProjectTrendsResponse)
async def get_multi_project_trends(
    project_ids: list[str] = Query(..., description="비교할 프로젝트 ID 목록 (최대 5개)"),
    metric: str = Query("tasks", description="메트릭: tasks, tokens, cost, success_rate"),
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="기간: 1h, 24h, 7d, 30d, all"),
    db: AsyncSession = Depends(get_db),
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
            detail=f"유효하지 않은 메트릭입니다. 사용 가능: {', '.join(valid_metrics)}"
        )

    if USE_DATABASE:
        return await AnalyticsService.get_multi_project_trends_async(
            db, project_ids, metric, time_range
        )
    return AnalyticsService.get_multi_project_trends(project_ids, metric, time_range)
