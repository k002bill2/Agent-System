"""LLM Models API endpoints.

중앙 LLM 레지스트리에서 모델 정보를 제공하는 API.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from models.llm_models import LLMModelRegistry, LLMProvider

router = APIRouter(prefix="/llm", tags=["llm"])


class ModelResponse(BaseModel):
    """Response model for a single LLM model."""

    id: str
    display_name: str
    provider: str
    context_window: int
    pricing: dict[str, float]
    available: bool
    is_default: bool
    supports_tools: bool
    supports_vision: bool


class ModelsListResponse(BaseModel):
    """Response model for models list endpoint."""

    models: list[ModelResponse]
    total: int


class DefaultModelResponse(BaseModel):
    """Response model for default model endpoint."""

    model_id: str
    provider: str
    display_name: str


@router.get("/models", response_model=ModelsListResponse)
async def get_models(
    provider: str | None = Query(None, description="Filter by provider (anthropic, google, openai, ollama)"),
    available_only: bool = Query(False, description="Only return models with available API keys"),
) -> ModelsListResponse:
    """Get list of available LLM models.

    Returns all registered models with their configurations and availability status.
    Optionally filter by provider or availability.
    """
    if provider:
        # Validate provider
        try:
            p = LLMProvider(provider)
            models = LLMModelRegistry.get_by_provider(p)
        except ValueError:
            return ModelsListResponse(models=[], total=0)
    else:
        models = LLMModelRegistry.get_enabled()

    # Build response
    result = []
    for model in models:
        is_available = LLMModelRegistry.is_available(model.id)

        if available_only and not is_available:
            continue

        result.append(ModelResponse(
            id=model.id,
            display_name=model.display_name,
            provider=model.provider.value,
            context_window=model.context_window,
            pricing={
                "input": model.input_price,
                "output": model.output_price,
            },
            available=is_available,
            is_default=model.is_default,
            supports_tools=model.supports_tools,
            supports_vision=model.supports_vision,
        ))

    return ModelsListResponse(models=result, total=len(result))


@router.get("/models/default", response_model=DefaultModelResponse)
async def get_default_model(
    provider: str | None = Query(None, description="Get default for specific provider"),
) -> DefaultModelResponse:
    """Get the default model.

    Returns the default model based on:
    1. If provider specified: default model for that provider
    2. If not specified: default model based on available API keys
       (priority: Google > Anthropic > OpenAI > Ollama)
    """
    model_id = LLMModelRegistry.get_default(provider)
    model = LLMModelRegistry.get_by_id(model_id)

    if model:
        return DefaultModelResponse(
            model_id=model.id,
            provider=model.provider.value,
            display_name=model.display_name,
        )

    # Fallback
    return DefaultModelResponse(
        model_id=model_id,
        provider="google",
        display_name=model_id,
    )


@router.get("/models/{model_id}")
async def get_model(model_id: str) -> ModelResponse | dict:
    """Get a specific model by ID."""
    model = LLMModelRegistry.get_by_id(model_id)

    if not model:
        return {"error": f"Model '{model_id}' not found"}

    return ModelResponse(
        id=model.id,
        display_name=model.display_name,
        provider=model.provider.value,
        context_window=model.context_window,
        pricing={
            "input": model.input_price,
            "output": model.output_price,
        },
        available=LLMModelRegistry.is_available(model.id),
        is_default=model.is_default,
        supports_tools=model.supports_tools,
        supports_vision=model.supports_vision,
    )


@router.get("/providers")
async def get_providers() -> dict:
    """Get list of supported providers with their models."""
    result = {}
    for provider in LLMProvider:
        models = LLMModelRegistry.get_by_provider(provider)
        result[provider.value] = {
            "models": [m.id for m in models],
            "default": LLMModelRegistry.get_default(provider),
            "count": len(models),
        }
    return result
