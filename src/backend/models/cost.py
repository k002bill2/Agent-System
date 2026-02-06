"""Token and cost tracking models."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from models.llm_models import LLMModelRegistry

# Default cost for unknown models
DEFAULT_COST = {"input": 0.001, "output": 0.002}


def estimate_tokens(text: str, model: str = "") -> int:
    """
    텍스트의 토큰 수 추정 (fallback용).

    평균적으로:
    - 영어: 1 token ≈ 4 characters
    - 한국어: 1 token ≈ 2 characters

    Args:
        text: 토큰 수를 추정할 텍스트
        model: 모델명 (현재 미사용, 향후 모델별 토크나이저 지원용)

    Returns:
        추정된 토큰 수
    """
    if not text:
        return 0

    # 문자 수 기반 추정 (단어 수보다 정확)
    char_count = len(text)

    # 한국어 비율 감지 (한글 유니코드 범위: AC00-D7A3)
    korean_chars = sum(1 for c in text if '\uac00' <= c <= '\ud7a3')
    korean_ratio = korean_chars / char_count if char_count > 0 else 0

    # 가중 평균: 영어 4자/토큰, 한국어 2자/토큰
    chars_per_token = 4 * (1 - korean_ratio) + 2 * korean_ratio

    return max(1, int(char_count / chars_per_token))


class TokenUsage(BaseModel):
    """Token usage for a single LLM call."""

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    model: str = ""
    cost_usd: float = 0.0
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentTokenUsage(BaseModel):
    """Aggregated token usage for an agent."""

    agent_name: str
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    call_count: int = 0
    history: list[TokenUsage] = Field(default_factory=list)

    def add_usage(self, usage: TokenUsage) -> None:
        """Add a token usage record."""
        self.total_input_tokens += usage.input_tokens
        self.total_output_tokens += usage.output_tokens
        self.total_tokens += usage.total_tokens
        self.total_cost_usd += usage.cost_usd
        self.call_count += 1
        self.history.append(usage)


class SessionTokenUsage(BaseModel):
    """Token usage for an entire session."""

    session_id: str
    agents: dict[str, AgentTokenUsage] = Field(default_factory=dict)
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0

    def add_agent_usage(self, agent_name: str, usage: TokenUsage) -> None:
        """Add token usage for a specific agent."""
        if agent_name not in self.agents:
            self.agents[agent_name] = AgentTokenUsage(agent_name=agent_name)

        self.agents[agent_name].add_usage(usage)

        # Update session totals
        self.total_input_tokens += usage.input_tokens
        self.total_output_tokens += usage.output_tokens
        self.total_tokens += usage.total_tokens
        self.total_cost_usd += usage.cost_usd


def get_model_cost(model: str) -> dict[str, float]:
    """Get cost per 1K tokens for a model.

    Uses the central LLMModelRegistry as the source of truth.
    """
    return LLMModelRegistry.get_pricing(model)


def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    model: str,
) -> float:
    """Calculate cost in USD for token usage."""
    costs = get_model_cost(model)
    input_cost = (input_tokens / 1000) * costs["input"]
    output_cost = (output_tokens / 1000) * costs["output"]
    return round(input_cost + output_cost, 6)


# ─────────────────────────────────────────────────────────────
# Cost Allocation Models (Enterprise)
# ─────────────────────────────────────────────────────────────


class BudgetPeriod(str):
    """Budget period types."""

    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class CostCenter(BaseModel):
    """Cost center for department/team billing."""

    id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    organization_id: str
    name: str
    code: str  # Accounting code (e.g., "DEPT-001", "PROJ-ALPHA")
    description: str | None = None

    # Budget settings
    budget_usd: float | None = None
    budget_period: str = "monthly"
    alert_threshold_percent: float = 80.0

    # Metadata
    tags: dict[str, str] = Field(default_factory=dict)
    owner_id: str | None = None
    parent_id: str | None = None  # For hierarchical cost centers

    # Status
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CostAllocation(BaseModel):
    """Cost allocation record linking sessions to cost centers."""

    id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    session_id: str
    project_id: str | None = None
    cost_center_id: str | None = None
    user_id: str | None = None

    # Cost breakdown
    total_cost_usd: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    model_costs: dict[str, float] = Field(default_factory=dict)

    # Allocation metadata
    allocation_tags: dict[str, str] = Field(default_factory=dict)
    allocation_percent: float = 100.0  # For split allocations

    # Timestamps
    period_start: datetime | None = None
    period_end: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CostReport(BaseModel):
    """Cost report for a period."""

    period: str
    start_date: datetime
    end_date: datetime
    generated_at: datetime = Field(default_factory=datetime.utcnow)

    # Totals
    total_cost_usd: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_sessions: int = 0

    # Breakdowns
    by_cost_center: dict[str, float] = Field(default_factory=dict)
    by_project: dict[str, float] = Field(default_factory=dict)
    by_user: dict[str, float] = Field(default_factory=dict)
    by_model: dict[str, float] = Field(default_factory=dict)
    by_day: dict[str, float] = Field(default_factory=dict)

    # Budget status
    budget_utilization: dict[str, dict] = Field(default_factory=dict)  # cost_center_id -> {budget, spent, percent}


class CostForecast(BaseModel):
    """Cost forecast based on historical data."""

    forecast_date: datetime
    period: str  # monthly, quarterly
    projected_cost_usd: float = 0.0
    confidence_interval: tuple[float, float] = (0.0, 0.0)

    # Trend
    trend_percent: float = 0.0  # +/- percent vs previous period
    average_daily_cost: float = 0.0

    # By category
    by_cost_center: dict[str, float] = Field(default_factory=dict)
    by_model: dict[str, float] = Field(default_factory=dict)


class ChargebackExport(BaseModel):
    """Chargeback export data for billing integration."""

    export_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    period_start: datetime
    period_end: datetime
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    format: str = "csv"  # csv, json, xlsx

    # Summary
    total_amount_usd: float = 0.0
    line_items: list[dict] = Field(default_factory=list)


class BudgetAlert(BaseModel):
    """Budget alert notification."""

    id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    cost_center_id: str
    cost_center_name: str
    alert_type: str  # warning, critical, exceeded
    threshold_percent: float
    current_percent: float
    budget_usd: float
    spent_usd: float
    message: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


def extract_token_usage(response: Any, model: str = "") -> TokenUsage | None:
    """
    Extract token usage from an LLM response.

    Supports various LLM providers:
    - Google Gemini (response.usage_metadata)
    - Anthropic (response_metadata.usage)
    - OpenAI (response_metadata.token_usage)
    - LangChain (response.response_metadata)
    """
    try:
        input_tokens = 0
        output_tokens = 0
        model_name = model

        # 1. usage_metadata 확인 (Google Gemini, 최신 LangChain)
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            usage = response.usage_metadata
            if isinstance(usage, dict):
                input_tokens = usage.get("input_tokens", 0)
                output_tokens = usage.get("output_tokens", 0)
            else:
                # Pydantic model인 경우
                input_tokens = getattr(usage, "input_tokens", 0)
                output_tokens = getattr(usage, "output_tokens", 0)
        else:
            # 2. response_metadata 확인 (Anthropic, OpenAI)
            metadata = getattr(response, "response_metadata", {})
            if not metadata:
                return None

            # 모델명 추출
            model_name = metadata.get("model", model) or model

            # Anthropic format
            usage = metadata.get("usage", {})
            if usage:
                input_tokens = usage.get("input_tokens", 0)
                output_tokens = usage.get("output_tokens", 0)
            else:
                # OpenAI format
                token_usage = metadata.get("token_usage", {})
                input_tokens = token_usage.get("prompt_tokens", 0)
                output_tokens = token_usage.get("completion_tokens", 0)

        if input_tokens == 0 and output_tokens == 0:
            return None

        total_tokens = input_tokens + output_tokens
        cost = calculate_cost(input_tokens, output_tokens, model_name)

        return TokenUsage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            model=model_name,
            cost_usd=cost,
        )

    except Exception:
        return None
