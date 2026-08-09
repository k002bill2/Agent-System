"""Usage API 응답 스키마 (Pydantic)."""

from typing import Any

from pydantic import BaseModel, Field


class DailyActivity(BaseModel):
    """Daily activity data."""

    date: str
    messageCount: int
    sessionCount: int
    toolCallCount: int


class DailyModelTokens(BaseModel):
    """Daily token usage by model."""

    date: str
    tokensByModel: dict[str, int]


class ModelUsage(BaseModel):
    """Model usage statistics."""

    inputTokens: int = 0
    outputTokens: int = 0
    cacheReadInputTokens: int = 0
    cacheCreationInputTokens: int = 0
    webSearchRequests: int = 0
    costUSD: float = 0


class PlanLimitInfo(BaseModel):
    """Plan limit information from Anthropic OAuth API."""

    name: str
    displayName: str
    utilization: float  # Percentage 0-100
    resetsAt: str | None = None
    resetsInHours: float | None = None
    resetsInMinutes: float | None = None


class UsageResponse(BaseModel):
    """Claude Code usage response."""

    # Raw stats
    lastComputedDate: str
    totalSessions: int
    totalMessages: int
    firstSessionDate: str | None = None

    # Weekly usage
    weeklyActivity: list[DailyActivity] = Field(default_factory=list)
    weeklyModelTokens: list[DailyModelTokens] = Field(default_factory=list)
    # "stats-cache" when filled from Claude Code's internal cache,
    # "jsonl-fallback" when reconstructed from session JSONL files,
    # "empty" when no data was found anywhere.
    weeklyModelTokensSource: str = "stats-cache"
    # How many days old the underlying stats-cache.json data is, if any.
    statsCacheAgeDays: int | None = None

    # Model usage totals
    modelUsage: dict[str, ModelUsage] = Field(default_factory=dict)

    # Plan limits from Anthropic API (real data)
    planLimits: list[PlanLimitInfo] = Field(default_factory=list)

    # OAuth status
    oauthAvailable: bool = False
    oauthError: str | None = None
    isCached: bool = False  # True if using cached data
    cacheAgeMinutes: int | None = None  # How old the cached data is

    # Computed stats (from local cache)
    weeklyTotalTokens: int = 0
    weeklySonnetTokens: int = 0
    weeklyOpusTokens: int = 0


class CodexUsageBreakdown(BaseModel):
    """Codex local usage grouped by a label."""

    name: str
    tokens: int = 0
    threads: int = 0


class CodexCliUsageResponse(BaseModel):
    """Local Codex CLI usage reconstructed from Codex state DB."""

    available: bool
    source: str = "codex-state-db"
    fiveHourTokens: int = 0
    fiveHourThreads: int = 0
    weeklyTokens: int = 0
    weeklyThreads: int = 0
    totalTokens: int = 0
    totalThreads: int = 0
    byModel: list[CodexUsageBreakdown] = Field(default_factory=list)
    bySource: list[CodexUsageBreakdown] = Field(default_factory=list)
    updatedAt: str | None = None
    limitStatus: str = "not_exposed"
    message: str | None = (
        "Codex CLI exposes local token usage here; account remaining plan "
        "percentages are not present in the local state DB."
    )


class CodexPlanWindow(BaseModel):
    """A Codex ChatGPT subscription rate-limit window."""

    usedPercent: float = 0
    remainingPercent: float = 100
    windowDurationMins: int | None = None
    resetsAt: int | None = None
    resetsAtIso: str | None = None
    resetsInMinutes: float | None = None


class CodexPlanLimitSnapshot(BaseModel):
    """Codex ChatGPT subscription limit snapshot."""

    limitId: str | None = None
    limitName: str | None = None
    primary: CodexPlanWindow | None = None
    secondary: CodexPlanWindow | None = None
    credits: dict[str, Any] | None = None
    individualLimit: dict[str, Any] | None = None
    planType: str | None = None
    rateLimitReachedType: str | None = None


class CodexPlanUsageResponse(BaseModel):
    """ChatGPT subscription Codex plan usage from Codex app-server."""

    available: bool
    source: str = "codex-app-server"
    codexLimit: CodexPlanLimitSnapshot | None = None
    limitsById: dict[str, CodexPlanLimitSnapshot] = Field(default_factory=dict)
    rateLimitResetCredits: dict[str, Any] | None = None
    updatedAt: str | None = None
    isCached: bool = False
    cacheAgeSeconds: int | None = None
    message: str | None = None


class ClaudeConfigUpdate(BaseModel):
    """Claude Code config update request."""

    oauth_token: str | None = None
    stats_cache_path: str | None = None
    usage_cache_path: str | None = None
