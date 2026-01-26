"""Analytics API routes."""

from fastapi import APIRouter, Query

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


@router.get("/overview", response_model=OverviewMetrics)
async def get_overview():
    """Get high-level overview metrics."""
    return AnalyticsService.get_overview()


@router.get("/trends", response_model=MultiTrendData)
async def get_trends(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
):
    """Get trend data over time."""
    return AnalyticsService.get_trends(time_range)


@router.get("/agents", response_model=AgentPerformanceList)
async def get_agent_performance(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
):
    """Get performance metrics for all agents."""
    return AnalyticsService.get_agent_performance(time_range)


@router.get("/costs", response_model=CostAnalytics)
async def get_cost_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
):
    """Get cost analytics breakdown."""
    return AnalyticsService.get_cost_analytics(time_range)


@router.get("/activity", response_model=ActivityHeatmap)
async def get_activity_heatmap(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
):
    """Get activity heatmap data."""
    return AnalyticsService.get_activity_heatmap(time_range)


@router.get("/errors", response_model=ErrorAnalytics)
async def get_error_analytics(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
):
    """Get error analytics breakdown."""
    return AnalyticsService.get_error_analytics(time_range)


@router.get("/dashboard", response_model=AnalyticsDashboard)
async def get_dashboard(
    time_range: TimeRange = Query(default=TimeRange.WEEK, description="Time range for data"),
):
    """Get complete analytics dashboard data."""
    return AnalyticsService.get_dashboard(time_range)
