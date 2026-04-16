"""LLM Model Update Service.

Periodically checks provider APIs for new/updated models and syncs
changes to the registry. New models are discovered but added as
disabled — admin must explicitly enable them.
"""

import logging
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

from models.llm_models import LLMModelRegistry, LLMProvider
from utils.time import utcnow

logger = logging.getLogger(__name__)

# Environment config
UPDATE_CHECK_INTERVAL_HOURS = int(os.getenv("LLM_UPDATE_CHECK_INTERVAL_HOURS", "24"))
UPDATE_CHECK_TIMEOUT = int(os.getenv("LLM_UPDATE_CHECK_TIMEOUT", "30"))

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


# ─────────────────────────────────────────────────────────────
# Data Structures
# ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class DiscoveredModel:
    """A model discovered from a provider API."""

    id: str
    display_name: str
    provider: LLMProvider
    context_window: int | None = None
    supports_tools: bool = True
    supports_vision: bool = False


@dataclass
class ModelChange:
    """A detected change between registry and provider API."""

    model_id: str
    change_type: str  # "new", "context_window", "capabilities"
    field: str | None = None
    old_value: Any = None
    new_value: Any = None


@dataclass
class UpdateCheckResult:
    """Result of checking one or all providers."""

    provider: str
    status: str  # "success", "partial", "failed"
    models_discovered: int = 0
    new_models: list[ModelChange] = field(default_factory=list)
    updates: list[ModelChange] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────
# Provider Fetchers
# ─────────────────────────────────────────────────────────────


async def _fetch_anthropic_models(client: httpx.AsyncClient) -> list[DiscoveredModel]:
    """Fetch models from Anthropic API."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")

    resp = await client.get(
        "https://api.anthropic.com/v1/models",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    resp.raise_for_status()
    data = resp.json()

    models: list[DiscoveredModel] = []
    for item in data.get("data", []):
        model_id = item.get("id", "")
        # Skip snapshot/dated variants — only keep canonical IDs
        # e.g. "claude-sonnet-4-6-20250514" → skip if "claude-sonnet-4-6" exists
        display_name = item.get("display_name", model_id)

        models.append(
            DiscoveredModel(
                id=model_id,
                display_name=display_name,
                provider=LLMProvider.ANTHROPIC,
                supports_tools=True,
                supports_vision=True,
            )
        )
    return models


async def _fetch_openai_models(client: httpx.AsyncClient) -> list[DiscoveredModel]:
    """Fetch models from OpenAI API."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set")

    resp = await client.get(
        "https://api.openai.com/v1/models",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    resp.raise_for_status()
    data = resp.json()

    # Filter to chat-capable models (gpt-*, o1*, o3*, o4*)
    chat_prefixes = ("gpt-", "o1", "o3", "o4")

    models: list[DiscoveredModel] = []
    for item in data.get("data", []):
        model_id = item.get("id", "")
        if not any(model_id.startswith(p) for p in chat_prefixes):
            continue
        # Skip fine-tuned models
        if "ft:" in model_id:
            continue

        models.append(
            DiscoveredModel(
                id=model_id,
                display_name=model_id,
                provider=LLMProvider.OPENAI,
                supports_tools=True,
                supports_vision="vision" not in model_id,  # most modern models support vision
            )
        )
    return models


async def _fetch_google_models(client: httpx.AsyncClient) -> list[DiscoveredModel]:
    """Fetch models from Google Generative AI API."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not set")

    resp = await client.get(
        "https://generativelanguage.googleapis.com/v1/models",
        params={"key": api_key},
    )
    resp.raise_for_status()
    data = resp.json()

    models: list[DiscoveredModel] = []
    for item in data.get("models", []):
        # name is "models/gemini-2.5-pro" — strip prefix
        raw_name = item.get("name", "")
        model_id = raw_name.replace("models/", "")
        if not model_id:
            continue

        # Only include generative models
        methods = item.get("supportedGenerationMethods", [])
        if "generateContent" not in methods:
            continue

        context_window = item.get("inputTokenLimit")
        display_name = item.get("displayName", model_id)

        models.append(
            DiscoveredModel(
                id=model_id,
                display_name=display_name,
                provider=LLMProvider.GOOGLE,
                context_window=context_window,
                supports_tools=True,
                supports_vision=True,
            )
        )
    return models


_FETCHERS: dict[LLMProvider, Any] = {
    LLMProvider.ANTHROPIC: _fetch_anthropic_models,
    LLMProvider.OPENAI: _fetch_openai_models,
    LLMProvider.GOOGLE: _fetch_google_models,
    # Ollama is local — not checked
}


# ─────────────────────────────────────────────────────────────
# Diff Engine
# ─────────────────────────────────────────────────────────────


def _diff_models(
    discovered: list[DiscoveredModel],
    provider: LLMProvider,
) -> tuple[list[ModelChange], list[ModelChange]]:
    """Compare discovered models against the registry.

    Returns (new_models, updates) where:
    - new_models: models in discovered but not in registry
    - updates: metadata changes for existing models
    """
    existing = {m.id: m for m in LLMModelRegistry.get_all() if m.provider == provider}

    new_models: list[ModelChange] = []
    updates: list[ModelChange] = []

    for disc in discovered:
        reg = existing.get(disc.id)
        if reg is None:
            new_models.append(
                ModelChange(
                    model_id=disc.id,
                    change_type="new",
                    new_value={
                        "display_name": disc.display_name,
                        "provider": disc.provider.value,
                        "context_window": disc.context_window,
                    },
                )
            )
            continue

        # Check for metadata changes
        if disc.context_window and disc.context_window != reg.context_window:
            updates.append(
                ModelChange(
                    model_id=disc.id,
                    change_type="context_window",
                    field="context_window",
                    old_value=reg.context_window,
                    new_value=disc.context_window,
                )
            )

    return new_models, updates


# ─────────────────────────────────────────────────────────────
# Core Service
# ─────────────────────────────────────────────────────────────


class ModelUpdateService:
    """Service for checking and applying LLM model updates."""

    @staticmethod
    async def check_provider(
        provider: LLMProvider,
        *,
        apply_updates: bool = True,
    ) -> UpdateCheckResult:
        """Check a single provider for model updates.

        Args:
            provider: The provider to check.
            apply_updates: If True, apply discovered changes to DB.

        Returns:
            UpdateCheckResult with details of what was found.
        """
        fetcher = _FETCHERS.get(provider)
        if not fetcher:
            return UpdateCheckResult(
                provider=provider.value,
                status="failed",
                errors=[f"No fetcher for provider: {provider.value}"],
            )

        try:
            async with httpx.AsyncClient(timeout=UPDATE_CHECK_TIMEOUT) as client:
                discovered = await fetcher(client)
        except ValueError as e:
            # Missing API key — expected for unconfigured providers
            return UpdateCheckResult(
                provider=provider.value,
                status="failed",
                errors=[str(e)],
            )
        except httpx.HTTPStatusError as e:
            return UpdateCheckResult(
                provider=provider.value,
                status="failed",
                errors=[f"API error {e.response.status_code}: {e.response.text[:200]}"],
            )
        except httpx.RequestError as e:
            return UpdateCheckResult(
                provider=provider.value,
                status="failed",
                errors=[f"Request failed: {e}"],
            )

        new_models, updates = _diff_models(discovered, provider)

        result = UpdateCheckResult(
            provider=provider.value,
            status="success",
            models_discovered=len(discovered),
            new_models=new_models,
            updates=updates,
        )

        # Apply changes to DB
        if apply_updates and USE_DATABASE and (new_models or updates):
            try:
                await ModelUpdateService._apply_changes(new_models, updates)
            except Exception as e:
                result.errors.append(f"Failed to apply changes: {e}")
                result.status = "partial"

        return result

    @staticmethod
    async def check_all_providers(
        *,
        apply_updates: bool = True,
        is_manual: bool = False,
        triggered_by: str | None = None,
    ) -> list[UpdateCheckResult]:
        """Check all configured providers for model updates.

        Args:
            apply_updates: If True, apply discovered changes to DB.
            is_manual: Whether this is a manually triggered check.
            triggered_by: User ID or "scheduler".

        Returns:
            List of results, one per provider.
        """
        results: list[UpdateCheckResult] = []

        for provider in _FETCHERS:
            # Skip providers without API keys
            if not LLMModelRegistry.is_available(LLMModelRegistry.get_default(provider)):
                continue

            result = await ModelUpdateService.check_provider(provider, apply_updates=apply_updates)
            results.append(result)

        # Log to DB
        if USE_DATABASE:
            await ModelUpdateService._save_log(results, is_manual, triggered_by)

        return results

    @staticmethod
    async def _apply_changes(
        new_models: list[ModelChange],
        updates: list[ModelChange],
    ) -> int:
        """Apply discovered changes to the database.

        New models are inserted as disabled (is_enabled=False).
        Metadata updates are applied directly.
        """
        from sqlalchemy import update
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        from db.database import async_session_factory
        from db.models import LLMModelConfigModel

        applied = 0

        async with async_session_factory() as session:
            # Insert new models as disabled
            for change in new_models:
                info = change.new_value or {}
                values = {
                    "id": change.model_id,
                    "display_name": info.get("display_name", change.model_id),
                    "provider": info.get("provider", ""),
                    "context_window": info.get("context_window") or 128000,
                    "input_price": 0.0,  # Unknown — admin sets manually
                    "output_price": 0.0,
                    "is_default": False,
                    "is_enabled": False,  # Requires admin activation
                    "supports_tools": True,
                    "supports_vision": False,
                }
                stmt = (
                    pg_insert(LLMModelConfigModel)
                    .values(**values)
                    .on_conflict_do_nothing(index_elements=["id"])
                )
                await session.execute(stmt)
                applied += 1

            # Apply metadata updates to existing models
            for change in updates:
                if change.field:
                    stmt = (
                        update(LLMModelConfigModel)
                        .where(LLMModelConfigModel.id == change.model_id)
                        .values({change.field: change.new_value})
                    )
                    await session.execute(stmt)
                    applied += 1

            await session.commit()

        # Reload registry cache
        async with async_session_factory() as session:
            await LLMModelRegistry.load_from_db(session)

        return applied

    @staticmethod
    async def _save_log(
        results: list[UpdateCheckResult],
        is_manual: bool,
        triggered_by: str | None,
    ) -> None:
        """Save update check results to the log table."""
        from db.database import async_session_factory
        from db.models import ModelUpdateLogModel

        try:
            async with async_session_factory() as session:
                for result in results:
                    changes = {
                        "new": [
                            {
                                "model_id": c.model_id,
                                "info": c.new_value,
                            }
                            for c in result.new_models
                        ],
                        "updated": [
                            {
                                "model_id": c.model_id,
                                "field": c.field,
                                "old": c.old_value,
                                "new": c.new_value,
                            }
                            for c in result.updates
                        ],
                        "errors": result.errors,
                    }

                    log = ModelUpdateLogModel(
                        provider=result.provider,
                        status=result.status,
                        models_discovered=result.models_discovered,
                        new_models_found=len(result.new_models),
                        updates_found=len(result.updates),
                        updates_applied=(
                            len(result.new_models) + len(result.updates)
                            if result.status != "failed"
                            else 0
                        ),
                        is_manual=is_manual,
                        changes=changes,
                        error_message="; ".join(result.errors) if result.errors else None,
                        triggered_by=triggered_by or ("manual" if is_manual else "scheduler"),
                        checked_at=utcnow(),
                    )
                    session.add(log)

                await session.commit()
        except Exception:
            logger.warning("Failed to save model update log", exc_info=True)

    @staticmethod
    async def get_update_history(
        provider: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict]:
        """Get model update check history from DB."""
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import ModelUpdateLogModel

        async with async_session_factory() as session:
            query = select(ModelUpdateLogModel).order_by(ModelUpdateLogModel.checked_at.desc())
            if provider:
                query = query.where(ModelUpdateLogModel.provider == provider)

            query = query.offset(offset).limit(limit)
            result = await session.execute(query)
            logs = result.scalars().all()

            return [
                {
                    "id": log.id,
                    "provider": log.provider,
                    "status": log.status,
                    "models_discovered": log.models_discovered,
                    "new_models_found": log.new_models_found,
                    "updates_found": log.updates_found,
                    "updates_applied": log.updates_applied,
                    "is_manual": log.is_manual,
                    "changes": log.changes,
                    "error_message": log.error_message,
                    "triggered_by": log.triggered_by,
                    "checked_at": log.checked_at.isoformat() if log.checked_at else None,
                }
                for log in logs
            ]

    @staticmethod
    async def get_update_status() -> dict:
        """Get current update check status (last check time, next scheduled, etc.)."""
        last_check = None
        if USE_DATABASE:
            try:
                from sqlalchemy import select

                from db.database import async_session_factory
                from db.models import ModelUpdateLogModel

                async with async_session_factory() as session:
                    query = (
                        select(ModelUpdateLogModel)
                        .order_by(ModelUpdateLogModel.checked_at.desc())
                        .limit(1)
                    )
                    result = await session.execute(query)
                    log = result.scalar_one_or_none()
                    if log:
                        last_check = {
                            "checked_at": log.checked_at.isoformat() if log.checked_at else None,
                            "provider": log.provider,
                            "status": log.status,
                            "new_models_found": log.new_models_found,
                            "updates_found": log.updates_found,
                        }
            except Exception:
                logger.warning("Failed to get last check", exc_info=True)

        return {
            "enabled": USE_DATABASE,
            "check_interval_hours": UPDATE_CHECK_INTERVAL_HOURS,
            "last_check": last_check,
            "configured_providers": [
                p.value
                for p in _FETCHERS
                if LLMModelRegistry.is_available(LLMModelRegistry.get_default(p))
            ],
        }
