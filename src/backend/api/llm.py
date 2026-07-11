"""LLM Models API endpoints.

중앙 LLM 레지스트리에서 모델 정보를 제공하는 API.
DB가 활성화된 경우, 모델 목록은 llm_model_configs 테이블에서 로드됩니다.
"""

import logging
import os
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user_optional
from db.database import get_db
from db.models import UserModel
from models.llm_models import LLMModelConfig, LLMModelRegistry, LLMProvider

router = APIRouter(prefix="/llm", tags=["llm"])

logger = logging.getLogger(__name__)

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


class ModelDeleteResponse(BaseModel):
    """Response for a hard model deletion (config removed + suppression recorded)."""

    model_id: str
    provider: str
    suppressed_at: datetime
    reason: str | None = None


class SuppressionDeleteResponse(BaseModel):
    """Response for un-suppressing a model (suppression row removed)."""

    model_id: str
    unsuppressed: bool


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


def _require_admin(current_user: UserModel | None) -> None:
    """Authorize an admin-only action from an optional-auth dependency.

    Distinguishes 401 (no/invalid token) from 403 (authenticated but inactive or
    non-admin). ``is_active`` is enforced so a deactivated admin cannot retain
    destructive privileges — mirroring the canonical ``get_current_user`` guard.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not current_user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    if not (current_user.role == "admin" or current_user.is_admin):
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/models", response_model=ModelsListResponse)
async def get_models(
    provider: str | None = Query(
        None, description="Filter by provider (codex_cli, anthropic, google, openai, ollama)"
    ),
    available_only: bool = Query(False, description="Only return models with available API keys"),
    include_disabled: bool = Query(False, description="Include disabled models in the listing"),
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

    _require_admin(current_user)

    from db.models import LLMModelConfigModel

    # Lock the target row FOR UPDATE so a concurrent DELETE (which also locks it)
    # serializes with this default transfer — the "unset others → promote target"
    # sequence can't interleave with a delete of the target (which would leave 0
    # rows updated and lose the provider default). Same lock ordering as DELETE.
    result = await db.execute(
        select(LLMModelConfigModel).where(LLMModelConfigModel.id == model_id).with_for_update()
    )
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


# NOTE: the 2-segment `/models/suppressions/{model_id}` path is NOT swallowed by
# the 1-segment `/models/{model_id}` matcher (a single path param never spans a
# `/`), so route ordering between the two DELETEs is safe.
@router.delete("/models/suppressions/{model_id}", response_model=SuppressionDeleteResponse)
async def unsuppress_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_current_user_optional),
) -> SuppressionDeleteResponse:
    """Remove a model's suppression (admin only, DB mode required).

    Un-suppression is backend/API only: it does NOT re-register the model
    immediately. The next ``sync_to_db`` (startup) or discovery (24h) run will
    re-insert it automatically.
    """
    if not USE_DATABASE:
        raise HTTPException(status_code=501, detail="USE_DATABASE=false: DB mode required")
    _require_admin(current_user)

    from db.models import LLMModelSuppressionModel

    result = await db.execute(
        select(LLMModelSuppressionModel).where(LLMModelSuppressionModel.model_id == model_id)
    )
    suppression = result.scalar_one_or_none()
    if not suppression:
        raise HTTPException(status_code=404, detail=f"No suppression found for model '{model_id}'")

    await db.execute(
        delete(LLMModelSuppressionModel).where(LLMModelSuppressionModel.model_id == model_id)
    )
    await db.commit()

    return SuppressionDeleteResponse(model_id=model_id, unsuppressed=True)


@router.delete("/models/{model_id}", response_model=ModelDeleteResponse)
async def delete_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_current_user_optional),
) -> ModelDeleteResponse:
    """Hard-delete a model (admin only, DB mode required).

    Removes the model's DB config row and records a suppression so neither
    startup sync nor discovery re-registers it. Refuses to delete a provider's
    default model (409) — transfer the default first. The code ``_MODELS`` list
    (pricing/settlement source of truth) is intentionally untouched.
    """
    if not USE_DATABASE:
        raise HTTPException(status_code=501, detail="USE_DATABASE=false: DB mode required")
    _require_admin(current_user)

    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from db.models import LLMModelConfigModel, LLMModelSuppressionModel

    # Lock the config row FOR UPDATE so a concurrent PATCH that promotes this
    # model to default (UPDATE ... WHERE id==model_id) serializes behind us and
    # the is_default guard below is judged from the locked row — closing the
    # TOCTOU window where a newly-promoted default could be deleted.
    result = await db.execute(
        select(LLMModelConfigModel).where(LLMModelConfigModel.id == model_id).with_for_update()
    )
    db_model = result.scalar_one_or_none()
    if not db_model:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found in DB")
    if db_model.is_default:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete default model '{model_id}'. "
                "Transfer the provider default to another model first."
            ),
        )

    provider = db_model.provider

    # One transaction: record suppression (idempotent) + delete the config row.
    await db.execute(
        pg_insert(LLMModelSuppressionModel)
        .values(model_id=model_id, provider=provider, reason="admin deletion")
        .on_conflict_do_nothing(index_elements=["model_id"])
    )
    # Confirm the response data WITHIN this transaction, before commit, so a
    # concurrent un-suppress that deletes the row right after our commit cannot
    # null it out (a post-commit read-back would race → AttributeError/500).
    result = await db.execute(
        select(LLMModelSuppressionModel).where(LLMModelSuppressionModel.model_id == model_id)
    )
    suppression = result.scalar_one_or_none()
    await db.execute(delete(LLMModelConfigModel).where(LLMModelConfigModel.id == model_id))
    await db.commit()

    # Never 500: if the suppression row was not readable (extremely rare — a
    # concurrent un-suppress removed a pre-existing row mid-transaction), fall
    # back to the values we just wrote so the response stays well-formed.
    if suppression is not None:
        suppressed_at_value = suppression.suppressed_at
        reason_value = suppression.reason
    else:
        suppressed_at_value = datetime.now(UTC)
        reason_value = "admin deletion"

    # Reload registry cache so the deleted model disappears from GET /models.
    # Belt-and-suspenders: if the reload does not reflect the removal (empty
    # result, failure, or stale read), evict the id directly so a hard-deleted
    # model never lingers in the cache. Response stays 200 (delete committed).
    await LLMModelRegistry.load_from_db(db)
    if LLMModelRegistry.get_by_id(model_id) is not None:
        LLMModelRegistry.evict(model_id)
        logger.warning("registry reload did not drop deleted model %s; evicted directly", model_id)

    return ModelDeleteResponse(
        model_id=model_id,
        provider=provider,
        suppressed_at=suppressed_at_value,
        reason=reason_value,
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


# ─────────────────────────────────────────────────────────────
# Model Update Check Endpoints
# ─────────────────────────────────────────────────────────────


class UpdateCheckResponse(BaseModel):
    """Response for a model update check."""

    provider: str
    status: str
    models_discovered: int
    new_models_found: int
    updates_found: int
    errors: list[str]


class UpdateHistoryEntry(BaseModel):
    """A single update history entry."""

    id: str
    provider: str
    status: str
    models_discovered: int
    new_models_found: int
    updates_found: int
    updates_applied: int
    is_manual: bool
    changes: dict | None = None
    error_message: str | None = None
    triggered_by: str | None = None
    checked_at: str | None = None


class UpdateStatusResponse(BaseModel):
    """Current update check status."""

    enabled: bool
    check_interval_hours: int
    last_check: dict | None = None
    configured_providers: list[str]


@router.post("/models/check-updates", response_model=list[UpdateCheckResponse])
async def check_model_updates(
    provider: str | None = Query(None, description="Check specific provider only"),
    current_user: UserModel | None = Depends(get_current_user_optional),
) -> list[UpdateCheckResponse]:
    """Manually trigger a model update check.

    Queries provider APIs (Anthropic, OpenAI, Google) for new or updated models.
    New models are added as disabled — admin must enable them manually.
    Requires DB mode and admin access.
    """
    if not USE_DATABASE:
        raise HTTPException(status_code=501, detail="USE_DATABASE=false: DB mode required")
    _require_admin(current_user)

    from services.model_update_service import ModelUpdateService

    user_id = current_user.id

    if provider:
        try:
            p = LLMProvider(provider)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid provider: {provider}")

        result = await ModelUpdateService.check_provider(p, apply_updates=True)
        # Save log for single provider
        await ModelUpdateService._save_log([result], is_manual=True, triggered_by=str(user_id))
        results = [result]
    else:
        results = await ModelUpdateService.check_all_providers(
            apply_updates=True, is_manual=True, triggered_by=str(user_id)
        )

    return [
        UpdateCheckResponse(
            provider=r.provider,
            status=r.status,
            models_discovered=r.models_discovered,
            new_models_found=len(r.new_models),
            updates_found=len(r.updates),
            errors=r.errors,
        )
        for r in results
    ]


@router.get("/models/update-history", response_model=list[UpdateHistoryEntry])
async def get_update_history(
    provider: str | None = Query(None, description="Filter by provider"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[UpdateHistoryEntry]:
    """Get model update check history."""
    if not USE_DATABASE:
        raise HTTPException(status_code=501, detail="USE_DATABASE=false: DB mode required")

    from services.model_update_service import ModelUpdateService

    logs = await ModelUpdateService.get_update_history(
        provider=provider, limit=limit, offset=offset
    )
    return [UpdateHistoryEntry(**log) for log in logs]


@router.get("/models/update-status", response_model=UpdateStatusResponse)
async def get_update_status() -> UpdateStatusResponse:
    """Get current model update check status."""
    from services.model_update_service import ModelUpdateService

    status = await ModelUpdateService.get_update_status()
    return UpdateStatusResponse(**status)


# NOTE: dynamic `/models/{model_id}` must be defined AFTER all static `/models/*` routes
# (update-history, update-status, check-updates) — FastAPI matches routes in declaration
# order; placing this earlier caused static paths to be swallowed as {model_id} → 404.
@router.get("/models/{model_id}", response_model=ModelResponse)
async def get_model(model_id: str) -> ModelResponse:
    """Get a specific model by ID."""
    model = LLMModelRegistry.get_by_id(model_id)

    if not model:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")

    return _model_to_response(model)
