"""LLM Models API endpoints.

중앙 LLM 레지스트리에서 모델 정보를 제공하는 API.
DB가 활성화된 경우, 모델 목록은 llm_model_configs 테이블에서 로드됩니다.
"""

import os

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user_optional
from db.database import get_db
from db.models import UserModel
from models.llm_models import LLMModelConfig, LLMModelRegistry, LLMProvider

router = APIRouter(prefix="/llm", tags=["llm"])

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


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
    is_enabled: bool = True


class ModelsListResponse(BaseModel):
    """Response model for models list endpoint."""

    models: list[ModelResponse]
    total: int


class DefaultModelResponse(BaseModel):
    """Response model for default model endpoint."""

    model_id: str
    provider: str
    display_name: str


class ModelUpdateRequest(BaseModel):
    """Request to update a model's configuration."""

    display_name: str | None = None
    is_enabled: bool | None = None
    is_default: bool | None = None
    input_price: float | None = None
    output_price: float | None = None


def _model_to_response(model: LLMModelConfig) -> ModelResponse:
    """Convert LLMModelConfig to ModelResponse."""
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
        is_enabled=model.is_enabled,
    )


@router.get("/models", response_model=ModelsListResponse)
async def get_models(
    provider: str | None = Query(
        None, description="Filter by provider (anthropic, google, openai, ollama)"
    ),
    available_only: bool = Query(False, description="Only return models with available API keys"),
    include_disabled: bool = Query(False, description="Include disabled models (admin only)"),
) -> ModelsListResponse:
    """Get list of available LLM models.

    Returns all registered models with their configurations and availability status.
    Optionally filter by provider or availability.
    """
    if provider:
        try:
            p = LLMProvider(provider)
            models = LLMModelRegistry.get_by_provider(p)
        except ValueError:
            return ModelsListResponse(models=[], total=0)
    elif include_disabled:
        models = LLMModelRegistry.get_all()
    else:
        models = LLMModelRegistry.get_enabled()

    result = []
    for model in models:
        is_available = LLMModelRegistry.is_available(model.id)

        if available_only and not is_available:
            continue

        result.append(_model_to_response(model))

    return ModelsListResponse(models=result, total=len(result))


@router.get("/models/default", response_model=DefaultModelResponse)
async def get_default_model(
    provider: str | None = Query(None, description="Get default for specific provider"),
) -> DefaultModelResponse:
    """Get the default model."""
    model_id = LLMModelRegistry.get_default(provider)
    model = LLMModelRegistry.get_by_id(model_id)

    if model:
        return DefaultModelResponse(
            model_id=model.id,
            provider=model.provider.value,
            display_name=model.display_name,
        )

    return DefaultModelResponse(
        model_id=model_id,
        provider="google",
        display_name=model_id,
    )


@router.get("/models/{model_id}", response_model=ModelResponse)
async def get_model(model_id: str) -> ModelResponse:
    """Get a specific model by ID."""
    model = LLMModelRegistry.get_by_id(model_id)

    if not model:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")

    return _model_to_response(model)


@router.patch("/models/{model_id}", response_model=ModelResponse)
async def update_model(
    model_id: str,
    data: ModelUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_current_user_optional),
) -> ModelResponse:
    """Update a model's configuration (admin only, DB mode required).

    Allows enabling/disabling models, setting defaults, and adjusting pricing.
    Changes are persisted to DB and hot-reloaded into the registry cache.
    """
    if not USE_DATABASE:
        raise HTTPException(status_code=501, detail="USE_DATABASE=false: DB mode required")

    # Admin check
    if not current_user or not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")

    from db.models import LLMModelConfigModel

    result = await db.execute(select(LLMModelConfigModel).where(LLMModelConfigModel.id == model_id))
    db_model = result.scalar_one_or_none()

    if not db_model:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found in DB")

    # Apply updates
    updates: dict = {}
    if data.display_name is not None:
        updates["display_name"] = data.display_name
    if data.is_enabled is not None:
        updates["is_enabled"] = data.is_enabled
    if data.is_default is not None:
        updates["is_default"] = data.is_default
        # If setting this as default, unset others in same provider
        if data.is_default:
            await db.execute(
                update(LLMModelConfigModel)
                .where(
                    LLMModelConfigModel.provider == db_model.provider,
                    LLMModelConfigModel.id != model_id,
                )
                .values(is_default=False)
            )
    if data.input_price is not None:
        updates["input_price"] = data.input_price
    if data.output_price is not None:
        updates["output_price"] = data.output_price

    if updates:
        await db.execute(
            update(LLMModelConfigModel).where(LLMModelConfigModel.id == model_id).values(**updates)
        )
        await db.commit()

        # Reload registry cache from DB
        await LLMModelRegistry.load_from_db(db)

    updated = LLMModelRegistry.get_by_id(model_id)
    if not updated:
        raise HTTPException(status_code=500, detail="Registry reload failed")

    return _model_to_response(updated)


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
