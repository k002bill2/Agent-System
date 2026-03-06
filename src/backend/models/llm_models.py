"""Central LLM Model Registry.

이 파일은 모든 LLM 모델 정보의 단일 소스(Single Source of Truth)입니다.
모델 추가/수정 시 이 파일만 변경하면 전체 시스템에 반영됩니다.
"""

import os
from enum import Enum
from typing import Any

from pydantic import BaseModel


class LLMProvider(str, Enum):
    """Supported LLM providers."""

    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OPENAI = "openai"
    OLLAMA = "ollama"


class LLMModelConfig(BaseModel):
    """Configuration for an LLM model."""

    id: str  # "claude-sonnet-4-6"
    display_name: str  # "Claude Sonnet 4"
    provider: LLMProvider
    context_window: int  # Max context window size
    input_price: float  # USD per 1K tokens
    output_price: float  # USD per 1K tokens
    is_default: bool = False  # Default model for this provider
    is_enabled: bool = True  # Whether model is enabled
    supports_tools: bool = True  # Tool/function calling support
    supports_vision: bool = False  # Vision/image support


# ─────────────────────────────────────────────────────────────
# Central Model Registry
# ─────────────────────────────────────────────────────────────

# All supported models with their configurations
_MODELS: list[LLMModelConfig] = [
    # ─────────────────────────────────────────────────────────
    # Anthropic Claude Models
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="claude-opus-4-6",
        display_name="Claude Opus 4.6",
        provider=LLMProvider.ANTHROPIC,
        context_window=200000,
        input_price=0.015,
        output_price=0.075,
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-sonnet-4-6",
        display_name="Claude Sonnet 4.6",
        provider=LLMProvider.ANTHROPIC,
        context_window=200000,
        input_price=0.003,
        output_price=0.015,
        is_default=True,  # Default Anthropic model
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-haiku-4-5-20251001",
        display_name="Claude Haiku 4.5",
        provider=LLMProvider.ANTHROPIC,
        context_window=200000,
        input_price=0.001,
        output_price=0.005,
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # ─────────────────────────────────────────────────────────
    # Google Gemini Models
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="gemini-3-flash-preview",
        display_name="Gemini 3 Flash",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.0005,  # $0.50/1M tokens
        output_price=0.003,  # $3.00/1M tokens
        is_default=True,  # Default Google model
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-3-pro-preview",
        display_name="Gemini 3 Pro",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.002,  # $2.00/1M tokens (≤200K context)
        output_price=0.012,  # $12.00/1M tokens (≤200K context)
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-2.5-pro-preview-05-06",
        display_name="Gemini 2.5 Pro",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.00125,  # $1.25/1M tokens (≤200K context)
        output_price=0.01,  # $10.00/1M tokens (≤200K context)
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-2.5-flash-preview-05-20",
        display_name="Gemini 2.5 Flash",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.0001,  # $0.10/1M tokens
        output_price=0.0004,  # $0.40/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # ─────────────────────────────────────────────────────────
    # OpenAI Models
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="gpt-4o",
        display_name="GPT-4o",
        provider=LLMProvider.OPENAI,
        context_window=128000,
        input_price=0.0025,
        output_price=0.01,
        is_default=True,  # Default OpenAI model
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-4o-mini",
        display_name="GPT-4o Mini",
        provider=LLMProvider.OPENAI,
        context_window=128000,
        input_price=0.00015,
        output_price=0.0006,
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="o1",
        display_name="OpenAI o1",
        provider=LLMProvider.OPENAI,
        context_window=200000,
        input_price=0.015,
        output_price=0.06,
        is_default=False,
        supports_tools=False,  # o1 has limited tool support
        supports_vision=True,
    ),
    LLMModelConfig(
        id="o1-mini",
        display_name="OpenAI o1 Mini",
        provider=LLMProvider.OPENAI,
        context_window=128000,
        input_price=0.003,
        output_price=0.012,
        is_default=False,
        supports_tools=False,
        supports_vision=False,
    ),
    # ─────────────────────────────────────────────────────────
    # Ollama (Local) Models
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="exaone3.5:7.8b",
        display_name="EXAONE 3.5 7.8B",
        provider=LLMProvider.OLLAMA,
        context_window=32768,
        input_price=0.0,  # Local - free
        output_price=0.0,
        is_default=True,  # Default Ollama model
        supports_tools=True,
        supports_vision=False,
    ),
    LLMModelConfig(
        id="llama3:8b",
        display_name="Llama 3 8B",
        provider=LLMProvider.OLLAMA,
        context_window=8192,
        input_price=0.0,
        output_price=0.0,
        is_default=False,
        supports_tools=True,
        supports_vision=False,
    ),
    LLMModelConfig(
        id="mistral:7b",
        display_name="Mistral 7B",
        provider=LLMProvider.OLLAMA,
        context_window=32768,
        input_price=0.0,
        output_price=0.0,
        is_default=False,
        supports_tools=True,
        supports_vision=False,
    ),
    LLMModelConfig(
        id="codellama:7b",
        display_name="Code Llama 7B",
        provider=LLMProvider.OLLAMA,
        context_window=16384,
        input_price=0.0,
        output_price=0.0,
        is_default=False,
        supports_tools=False,
        supports_vision=False,
    ),
    LLMModelConfig(
        id="exaone3.5:7.8b",
        display_name="EXAONE 3.5 7.8B",
        provider=LLMProvider.OLLAMA,
        context_window=32768,
        input_price=0.0,
        output_price=0.0,
        is_default=False,
        supports_tools=True,
        supports_vision=False,
    ),
]

# Index by model ID for fast lookup
_MODEL_INDEX: dict[str, LLMModelConfig] = {m.id: m for m in _MODELS}


class LLMModelRegistry:
    """Central registry for LLM model configurations.

    Single source of truth for all model information.
    When USE_DATABASE=true, populated from DB on startup via load_from_db().
    Falls back to in-memory _MODELS list when DB is not available.
    """

    # DB-loaded cache (None = not yet loaded from DB, use _MODELS fallback)
    _db_cache: list[LLMModelConfig] | None = None
    _db_index: dict[str, LLMModelConfig] = {}

    @classmethod
    def _models(cls) -> list[LLMModelConfig]:
        """Return active model list: DB cache if loaded, else in-memory fallback."""
        return cls._db_cache if cls._db_cache is not None else _MODELS

    @classmethod
    def _index(cls) -> dict[str, LLMModelConfig]:
        """Return active model index: DB index if loaded, else in-memory fallback."""
        return cls._db_index if cls._db_cache is not None else _MODEL_INDEX

    @classmethod
    async def load_from_db(cls, session: Any) -> None:
        """Load model configurations from DB into in-memory cache.

        Called once on application startup when USE_DATABASE=true.
        After this, all registry methods serve data from DB.
        """
        from sqlalchemy import select

        try:
            from db.models import LLMModelConfigModel

            result = await session.execute(select(LLMModelConfigModel))
            db_models = result.scalars().all()

            if db_models:
                loaded = []
                for m in db_models:
                    try:
                        loaded.append(
                            LLMModelConfig(
                                id=m.id,
                                display_name=m.display_name,
                                provider=LLMProvider(m.provider),
                                context_window=m.context_window,
                                input_price=m.input_price,
                                output_price=m.output_price,
                                is_default=m.is_default,
                                is_enabled=m.is_enabled,
                                supports_tools=m.supports_tools,
                                supports_vision=m.supports_vision,
                            )
                        )
                    except Exception:
                        continue  # Skip malformed rows

                cls._db_cache = loaded
                cls._db_index = {m.id: m for m in loaded}
                print(f"✅ LLMModelRegistry loaded {len(loaded)} models from DB")
            else:
                print("⚠️  llm_model_configs table is empty, using in-memory fallback")
        except Exception as e:
            print(f"⚠️  Failed to load models from DB: {e}. Using in-memory fallback.")

    @classmethod
    def get_all(cls) -> list[LLMModelConfig]:
        """Get all registered models."""
        return cls._models().copy()

    @classmethod
    def get_enabled(cls) -> list[LLMModelConfig]:
        """Get all enabled models."""
        return [m for m in cls._models() if m.is_enabled]

    @classmethod
    def get_by_id(cls, model_id: str) -> LLMModelConfig | None:
        """Get a model by its ID."""
        return cls._index().get(model_id)

    @classmethod
    def get_by_provider(cls, provider: LLMProvider | str) -> list[LLMModelConfig]:
        """Get all models for a specific provider."""
        if isinstance(provider, str):
            try:
                provider = LLMProvider(provider)
            except ValueError:
                return []
        return [m for m in cls._models() if m.provider == provider and m.is_enabled]

    @classmethod
    def get_default(cls, provider: LLMProvider | str | None = None) -> str:
        """Get the default model ID for a provider.

        Args:
            provider: Specific provider, or None to use the first available.

        Returns:
            Default model ID string.
        """
        if provider:
            if isinstance(provider, str):
                try:
                    provider = LLMProvider(provider)
                except ValueError:
                    return "gemini-3-flash-preview"  # Fallback

            models = cls.get_by_provider(provider)
            for m in models:
                if m.is_default:
                    return m.id
            return models[0].id if models else "gemini-3-flash-preview"

        # No provider specified - return based on available API keys
        if os.getenv("GOOGLE_API_KEY"):
            return cls.get_default(LLMProvider.GOOGLE)
        elif os.getenv("ANTHROPIC_API_KEY"):
            return cls.get_default(LLMProvider.ANTHROPIC)
        elif os.getenv("OPENAI_API_KEY"):
            return cls.get_default(LLMProvider.OPENAI)
        else:
            return cls.get_default(LLMProvider.OLLAMA)

    @classmethod
    def get_pricing(cls, model_id: str) -> dict[str, float]:
        """Get pricing for a model.

        Returns:
            Dict with 'input' and 'output' prices per 1K tokens.
        """
        model = cls.get_by_id(model_id)
        if model:
            return {"input": model.input_price, "output": model.output_price}

        # Try partial match for unknown models
        model_lower = model_id.lower()
        for m in cls._models():
            if m.id.lower() in model_lower or model_lower in m.id.lower():
                return {"input": m.input_price, "output": m.output_price}

        # Default pricing for unknown models
        return {"input": 0.001, "output": 0.002}

    @classmethod
    def get_context_window(cls, model_id: str) -> int:
        """Get context window size for a model."""
        model = cls.get_by_id(model_id)
        return model.context_window if model else 128000

    @classmethod
    def get_provider(cls, model_id: str) -> LLMProvider | None:
        """Get the provider for a model."""
        model = cls.get_by_id(model_id)
        return model.provider if model else None

    @classmethod
    def exists(cls, model_id: str) -> bool:
        """Check if a model exists in the registry."""
        return model_id in cls._index()

    @classmethod
    def is_available(cls, model_id: str) -> bool:
        """Check if a model is available (exists and API key is set)."""
        model = cls.get_by_id(model_id)
        if not model or not model.is_enabled:
            return False

        provider = model.provider
        if provider == LLMProvider.GOOGLE:
            return bool(os.getenv("GOOGLE_API_KEY"))
        elif provider == LLMProvider.ANTHROPIC:
            return bool(os.getenv("ANTHROPIC_API_KEY"))
        elif provider == LLMProvider.OPENAI:
            return bool(os.getenv("OPENAI_API_KEY"))
        elif provider == LLMProvider.OLLAMA:
            return True  # Ollama is always "available" (local)
        return False

    @classmethod
    def get_available_models(cls) -> list[dict[str, Any]]:
        """Get all models with availability info.

        Returns a list suitable for API responses.
        """
        result = []
        for model in cls._models():
            if not model.is_enabled:
                continue

            result.append(
                {
                    "id": model.id,
                    "display_name": model.display_name,
                    "provider": model.provider.value,
                    "context_window": model.context_window,
                    "pricing": {
                        "input": model.input_price,
                        "output": model.output_price,
                    },
                    "available": cls.is_available(model.id),
                    "is_default": model.is_default,
                    "supports_tools": model.supports_tools,
                    "supports_vision": model.supports_vision,
                }
            )

        return result

    @classmethod
    def get_model_ids_by_provider(cls, provider: LLMProvider | str) -> list[str]:
        """Get list of model IDs for a provider.

        Useful for frontend dropdowns.
        """
        return [m.id for m in cls.get_by_provider(provider)]


# ─────────────────────────────────────────────────────────────
# Helper Functions for Backward Compatibility
# ─────────────────────────────────────────────────────────────


def get_cost_per_1k_tokens() -> dict[str, dict[str, float]]:
    """Get pricing dict in legacy format.

    For backward compatibility with existing code that uses COST_PER_1K_TOKENS.
    """
    return {
        model.id: {"input": model.input_price, "output": model.output_price} for model in _MODELS
    }


def get_model_configs() -> dict[str, dict[str, Any]]:
    """Get model configs in legacy format.

    For backward compatibility with existing MODEL_CONFIGS usage.
    """
    return {
        model.id: {
            "provider": model.provider.value,
            "model": model.id,
            "context_window": model.context_window,
            "pricing": {"input": model.input_price, "output": model.output_price},
        }
        for model in _MODELS
    }
