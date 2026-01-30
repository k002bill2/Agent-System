"""Token and cost tracking models."""

from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


# Cost per 1K tokens for different models (USD)
COST_PER_1K_TOKENS: dict[str, dict[str, float]] = {
    # Google Gemini models (pricing per 1M tokens, converted to per 1K)
    # Gemini 2.0 Flash: $0.10/1M input, $0.40/1M output (up to 128K context)
    "gemini-2.0-flash": {"input": 0.0001, "output": 0.0004},
    "gemini-2.0-flash": {"input": 0.0001, "output": 0.0004},
    # Gemini 1.5 Pro: $1.25/1M input, $5.00/1M output (up to 128K)
    "gemini-1.5-pro": {"input": 0.00125, "output": 0.005},
    # Gemini 1.5 Flash: $0.075/1M input, $0.30/1M output (up to 128K)
    "gemini-1.5-flash": {"input": 0.000075, "output": 0.0003},
    # Anthropic models
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
    "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
    "claude-3-opus-20240229": {"input": 0.015, "output": 0.075},
    "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125},
    # OpenAI models
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    # Ollama/Local models (free)
    "qwen2.5:7b": {"input": 0.0, "output": 0.0},
    "llama3:8b": {"input": 0.0, "output": 0.0},
    "mistral:7b": {"input": 0.0, "output": 0.0},
    "codellama:7b": {"input": 0.0, "output": 0.0},
}

# Default cost for unknown models
DEFAULT_COST = {"input": 0.001, "output": 0.002}


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
    """Get cost per 1K tokens for a model."""
    # Normalize model name
    model_lower = model.lower()

    # Try exact match first
    if model in COST_PER_1K_TOKENS:
        return COST_PER_1K_TOKENS[model]

    # Try partial match
    for known_model, cost in COST_PER_1K_TOKENS.items():
        if known_model.lower() in model_lower or model_lower in known_model.lower():
            return cost

    return DEFAULT_COST


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
    - Anthropic (response_metadata.usage)
    - OpenAI (response_metadata.token_usage)
    - LangChain (response.response_metadata)
    """
    try:
        # Try to get response_metadata
        metadata = getattr(response, "response_metadata", {})

        if not metadata:
            return None

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
        model_name = metadata.get("model", model) or model
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
