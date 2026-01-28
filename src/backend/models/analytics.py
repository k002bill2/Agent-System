"""Analytics models for dashboard metrics."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TimeRange(str, Enum):
    """Time range for analytics queries."""

    HOUR = "1h"
    DAY = "24h"
    WEEK = "7d"
    MONTH = "30d"
    ALL = "all"


class MetricType(str, Enum):
    """Types of metrics tracked."""

    TASK_COUNT = "task_count"
    SUCCESS_RATE = "success_rate"
    AVERAGE_DURATION = "avg_duration"
    TOKEN_USAGE = "token_usage"
    COST = "cost"
    ERROR_COUNT = "error_count"


# ─────────────────────────────────────────────────────────────
# Overview Metrics
# ─────────────────────────────────────────────────────────────


class OverviewMetrics(BaseModel):
    """High-level overview metrics."""

    total_sessions: int = 0
    active_sessions: int = 0
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    pending_tasks: int = 0
    success_rate: float = 0.0  # 0-100
    total_tokens: int = 0
    total_cost: float = 0.0
    avg_task_duration_ms: float = 0.0
    approvals_pending: int = 0
    approvals_granted: int = 0
    approvals_denied: int = 0


# ─────────────────────────────────────────────────────────────
# Trend Data
# ─────────────────────────────────────────────────────────────


class TrendDataPoint(BaseModel):
    """Single data point in a trend."""

    timestamp: datetime
    value: float
    label: str | None = None


class TrendData(BaseModel):
    """Trend data over time."""

    metric: MetricType
    time_range: TimeRange
    data_points: list[TrendDataPoint]
    total: float = 0.0
    change_percent: float = 0.0  # Compared to previous period


class MultiTrendData(BaseModel):
    """Multiple trends grouped."""

    time_range: TimeRange
    tasks: list[TrendDataPoint] = Field(default_factory=list)
    success_rate: list[TrendDataPoint] = Field(default_factory=list)
    costs: list[TrendDataPoint] = Field(default_factory=list)
    tokens: list[TrendDataPoint] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────
# Agent Performance
# ─────────────────────────────────────────────────────────────


class AgentPerformance(BaseModel):
    """Performance metrics for a single agent."""

    agent_id: str
    agent_name: str
    category: str | None = None
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    success_rate: float = 0.0
    avg_duration_ms: float = 0.0
    total_tokens: int = 0
    total_cost: float = 0.0


class AgentPerformanceList(BaseModel):
    """List of agent performance metrics."""

    agents: list[AgentPerformance]
    time_range: TimeRange


# ─────────────────────────────────────────────────────────────
# Cost Analytics
# ─────────────────────────────────────────────────────────────


class CostBreakdown(BaseModel):
    """Cost breakdown by category."""

    category: str  # e.g., "agent_name", "model", "session"
    value: str  # e.g., "web-ui-specialist", "claude-sonnet-4-20250514"
    cost: float
    tokens: int
    percentage: float = 0.0


class CostAnalytics(BaseModel):
    """Cost analytics data."""

    time_range: TimeRange
    total_cost: float = 0.0
    total_tokens: int = 0
    avg_cost_per_task: float = 0.0
    by_agent: list[CostBreakdown] = Field(default_factory=list)
    by_model: list[CostBreakdown] = Field(default_factory=list)
    projected_monthly: float = 0.0  # Projected based on current usage


# ─────────────────────────────────────────────────────────────
# Activity Heatmap
# ─────────────────────────────────────────────────────────────


class HeatmapCell(BaseModel):
    """Single cell in activity heatmap."""

    day: int  # 0-6 (Sunday-Saturday)
    hour: int  # 0-23
    value: int  # Task count


class ActivityHeatmap(BaseModel):
    """Activity heatmap data."""

    cells: list[HeatmapCell]
    max_value: int = 0
    time_range: TimeRange


# ─────────────────────────────────────────────────────────────
# Error Analytics
# ─────────────────────────────────────────────────────────────


class ErrorBreakdown(BaseModel):
    """Error breakdown by type."""

    error_type: str
    count: int
    percentage: float
    last_occurred: datetime | None = None
    sample_message: str | None = None


class ErrorAnalytics(BaseModel):
    """Error analytics data."""

    time_range: TimeRange
    total_errors: int = 0
    error_rate: float = 0.0  # As percentage of total tasks
    by_type: list[ErrorBreakdown] = Field(default_factory=list)
    by_agent: list[CostBreakdown] = Field(default_factory=list)  # Reuse cost breakdown structure


# ─────────────────────────────────────────────────────────────
# Combined Dashboard Data
# ─────────────────────────────────────────────────────────────


class AnalyticsDashboard(BaseModel):
    """Complete analytics dashboard data."""

    overview: OverviewMetrics
    trends: MultiTrendData
    agents: AgentPerformanceList
    costs: CostAnalytics
    activity: ActivityHeatmap
    errors: ErrorAnalytics
    generated_at: datetime = Field(default_factory=datetime.utcnow)
