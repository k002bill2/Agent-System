"""Analytics API routes."""

import os
from fastapi import APIRouter, Query, Depends
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
)
from services.analytics_service import AnalyticsService


router = APIRouter(prefix="/analytics", tags=["analytics"])

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


@router.get("/overview", response_model=OverviewMetrics)
async def get_overview(db: AsyncSession = Depends(get_db)):
    """Get high-level overview metrics."""
    if USE_DATABASE:
        return await AnalyticsService.get_overview_async(db)
    return AnalyticsService.get_overview()


@router.get("/trends", response_model=MultiTrendData)
async def get_trends(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    db: AsyncSession = Depends(get_db),
):
    """Get trend data over time."""
    if USE_DATABASE:
        return await AnalyticsService.get_trends_async(db, time_range)
    return AnalyticsService.get_trends(time_range)


@router.get("/agents", response_model=AgentPerformanceList)
async def get_agent_performance(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    db: AsyncSession = Depends(get_db),
):
    """Get performance metrics for all agents."""
    if USE_DATABASE:
        return await AnalyticsService.get_agent_performance_async(db, time_range)
    return AnalyticsService.get_agent_performance(time_range)


@router.get("/costs", response_model=CostAnalytics)
async def get_cost_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    db: AsyncSession = Depends(get_db),
):
    """Get cost analytics breakdown."""
    if USE_DATABASE:
        return await AnalyticsService.get_cost_analytics_async(db, time_range)
    return AnalyticsService.get_cost_analytics(time_range)


@router.get("/activity", response_model=ActivityHeatmap)
async def get_activity_heatmap(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    db: AsyncSession = Depends(get_db),
):
    """Get activity heatmap data."""
    if USE_DATABASE:
        return await AnalyticsService.get_activity_heatmap_async(db, time_range)
    return AnalyticsService.get_activity_heatmap(time_range)


@router.get("/errors", response_model=ErrorAnalytics)
async def get_error_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    db: AsyncSession = Depends(get_db),
):
    """Get error analytics breakdown."""
    if USE_DATABASE:
        return await AnalyticsService.get_error_analytics_async(db, time_range)
    return AnalyticsService.get_error_analytics(time_range)


@router.get("/dashboard", response_model=AnalyticsDashboard)
async def get_dashboard(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
    db: AsyncSession = Depends(get_db),
):
    """Get complete analytics dashboard data."""
    if USE_DATABASE:
        return await AnalyticsService.get_dashboard_async(db, time_range)
    return AnalyticsService.get_dashboard(time_range)
