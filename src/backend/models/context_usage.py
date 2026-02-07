"""Context window usage tracking models."""

from enum import Enum

from pydantic import BaseModel, Field


class LLMProvider(str, Enum):
    """Supported LLM providers."""

    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OPENAI = "openai"
    OLLAMA = "ollama"


# Provider context window limits (tokens)
PROVIDER_CONTEXT_LIMITS = {
    LLMProvider.ANTHROPIC: {
        "claude-3-opus": 200_000,
        "claude-3-sonnet": 200_000,
        "claude-sonnet-4-20250514": 200_000,
        "claude-3-haiku": 200_000,
        "default": 200_000,
    },
    LLMProvider.GOOGLE: {
        "gemini-1.5-pro": 1_000_000,
        "gemini-1.5-flash": 1_000_000,
        "gemini-2.0-flash": 1_000_000,
        "gemini-pro": 32_000,
        "default": 1_000_000,
    },
    LLMProvider.OPENAI: {
        "gpt-4-turbo": 128_000,
        "gpt-4": 8_192,
        "gpt-4-32k": 32_768,
        "gpt-3.5-turbo": 16_385,
        "gpt-4o": 128_000,
        "default": 128_000,
    },
    LLMProvider.OLLAMA: {
        "qwen2.5:7b": 32_000,
        "llama3:8b": 8_000,
        "mistral:7b": 32_000,
        "codellama": 16_000,
        "default": 32_000,
    },
}


class ContextUsageLevel(str, Enum):
    """Context usage warning levels."""

    NORMAL = "normal"  # 0-60%
    WARNING = "warning"  # 60-80%
    CRITICAL = "critical"  # 80-100%


class ContextUsage(BaseModel):
    """Context window usage metrics."""

    current_tokens: int = Field(0, description="Current tokens in context")
    max_tokens: int = Field(200_000, description="Maximum context window size")
    percentage: float = Field(0.0, description="Usage percentage (0-100)")
    level: ContextUsageLevel = Field(ContextUsageLevel.NORMAL, description="Warning level")
    provider: str = Field("unknown", description="LLM provider name")
    model: str = Field("unknown", description="Model name")
    warning_threshold: float = Field(80.0, description="Warning threshold percentage")
    critical_threshold: float = Field(90.0, description="Critical threshold percentage")

    # Breakdown
    system_tokens: int = Field(0, description="System prompt tokens")
    message_tokens: int = Field(0, description="Conversation message tokens")
    task_tokens: int = Field(0, description="Task context tokens")
    rag_tokens: int = Field(0, description="RAG retrieval tokens")

    @classmethod
    def calculate(
        cls,
        current_tokens: int,
        max_tokens: int,
        provider: str = "unknown",
        model: str = "unknown",
        system_tokens: int = 0,
        message_tokens: int = 0,
        task_tokens: int = 0,
        rag_tokens: int = 0,
        warning_threshold: float = 80.0,
        critical_threshold: float = 90.0,
    ) -> "ContextUsage":
        """Calculate context usage with level."""
        percentage = (current_tokens / max_tokens * 100) if max_tokens > 0 else 0

        if percentage >= critical_threshold:
            level = ContextUsageLevel.CRITICAL
        elif percentage >= warning_threshold:
            level = ContextUsageLevel.WARNING
        else:
            level = ContextUsageLevel.NORMAL

        return cls(
            current_tokens=current_tokens,
            max_tokens=max_tokens,
            percentage=round(percentage, 2),
            level=level,
            provider=provider,
            model=model,
            warning_threshold=warning_threshold,
            critical_threshold=critical_threshold,
            system_tokens=system_tokens,
            message_tokens=message_tokens,
            task_tokens=task_tokens,
            rag_tokens=rag_tokens,
        )


def get_context_limit(provider: str, model: str) -> int:
    """Get context window limit for a provider/model combination."""
    try:
        provider_enum = LLMProvider(provider.lower())
        limits = PROVIDER_CONTEXT_LIMITS.get(provider_enum, {})

        # Try exact model match
        for key, limit in limits.items():
            if key != "default" and key in model.lower():
                return limit

        # Fall back to default
        return limits.get("default", 100_000)
    except (ValueError, KeyError):
        return 100_000  # Safe default
