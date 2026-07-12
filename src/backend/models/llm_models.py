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
    CODEX_CLI = "codex_cli"
    CLAUDE_CLI = "claude_cli"
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
    # Anthropic Claude Models (updated 2026-05-30)
    # Pricing: USD per 1K tokens. Docs: https://docs.anthropic.com/en/docs/about-claude/models
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="claude-opus-4-8",
        display_name="Claude Opus 4.8",
        provider=LLMProvider.ANTHROPIC,
        context_window=1000000,  # 1M tokens
        input_price=0.005,  # $5.00/1M tokens
        output_price=0.025,  # $25.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-sonnet-5",
        display_name="Claude Sonnet 5",
        provider=LLMProvider.ANTHROPIC,
        context_window=1000000,  # 1M tokens
        input_price=0.003,  # $3.00/1M tokens
        output_price=0.015,  # $15.00/1M tokens
        is_default=True,  # Default Anthropic model
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-sonnet-4-6",
        display_name="Claude Sonnet 4.6",
        provider=LLMProvider.ANTHROPIC,
        context_window=1000000,  # 1M tokens
        input_price=0.003,  # $3.00/1M tokens
        output_price=0.015,  # $15.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-haiku-4-5-20251001",
        display_name="Claude Haiku 4.5",
        provider=LLMProvider.ANTHROPIC,
        context_window=200000,
        input_price=0.001,  # $1.00/1M tokens
        output_price=0.005,  # $5.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # ─────────────────────────────────────────────────────────
    # Google Gemini Models (updated 2026-05-30)
    # Pricing: USD per 1K tokens. Docs: https://ai.google.dev/gemini-api/docs/models
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
        id="gemini-3.1-pro-preview",
        display_name="Gemini 3.1 Pro",
        provider=LLMProvider.GOOGLE,
        context_window=2097152,  # 2M tokens (released 2026-02-19)
        input_price=0.002,  # $2.00/1M tokens (≤200K context)
        output_price=0.012,  # $12.00/1M tokens (≤200K context)
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-3.1-flash-lite-preview",
        display_name="Gemini 3.1 Flash-Lite",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.00025,  # $0.25/1M tokens
        output_price=0.0015,  # $1.50/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-2.5-pro",
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
        id="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.0003,  # $0.30/1M tokens
        output_price=0.0025,  # $2.50/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # ─────────────────────────────────────────────────────────
    # OpenAI Models
    # Pricing: USD per 1K tokens. Docs: https://platform.openai.com/docs/pricing
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="gpt-4o-mini",
        display_name="GPT-4o Mini",
        provider=LLMProvider.OPENAI,
        context_window=128000,
        input_price=0.00015,  # $0.15/1M tokens
        output_price=0.0006,  # $0.60/1M tokens
        is_default=True,  # Conservative default for broad API project access
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-4o",
        display_name="GPT-4o",
        provider=LLMProvider.OPENAI,
        context_window=128000,
        input_price=0.005,  # $5.00/1M tokens
        output_price=0.015,  # $15.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-5.5",
        display_name="GPT-5.5",
        provider=LLMProvider.OPENAI,
        context_window=1000000,
        input_price=0.005,
        output_price=0.03,
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-5.4",
        display_name="GPT-5.4",
        provider=LLMProvider.OPENAI,
        context_window=1050000,
        input_price=0.0025,
        output_price=0.015,
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-5.4-mini",
        display_name="GPT-5.4 Mini",
        provider=LLMProvider.OPENAI,
        context_window=400000,
        input_price=0.00075,
        output_price=0.0045,
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-5.4-nano",
        display_name="GPT-5.4 Nano",
        provider=LLMProvider.OPENAI,
        context_window=400000,
        input_price=0.0002,
        output_price=0.00125,
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="o3",
        display_name="OpenAI o3",
        provider=LLMProvider.OPENAI,
        context_window=200000,
        input_price=0.002,  # $2.00/1M tokens
        output_price=0.008,  # $8.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="o4-mini",
        display_name="OpenAI o4 Mini",
        provider=LLMProvider.OPENAI,
        context_window=200000,
        input_price=0.00055,  # $0.55/1M tokens
        output_price=0.0022,  # $2.20/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # ─────────────────────────────────────────────────────────
    # Codex CLI (ChatGPT subscription-backed local CLI)
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="codex-cli",
        display_name="Codex CLI",
        provider=LLMProvider.CODEX_CLI,
        context_window=200000,
        input_price=0.0,
        output_price=0.0,
        is_default=True,
        supports_tools=False,
        supports_vision=False,
    ),
    # ─────────────────────────────────────────────────────────
    # Claude CLI (Claude subscription-backed local CLI)
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="claude-cli",
        display_name="Claude CLI",
        provider=LLMProvider.CLAUDE_CLI,
        context_window=200000,
        input_price=0.0,
        output_price=0.0,
        is_default=True,
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

            if loaded:
                cls._db_cache = loaded
                cls._db_index = {m.id: m for m in loaded}
                print(f"✅ LLMModelRegistry loaded {len(loaded)} models from DB")
            elif cls._db_cache is not None:
                # Empty but successful query while already in DB mode (e.g. the
                # last models were deleted). Honor the now-empty table so the
                # cache is not left stale — a successful empty result must clear
                # the cache, distinct from an exception (handled below).
                cls._db_cache = []
                cls._db_index = {}
                print("⚠️  llm_model_configs table is empty, cache cleared")
            else:
                # First load on a fresh/empty DB (no cache yet): keep the
                # in-memory _MODELS fallback rather than serving nothing.
                print("⚠️  llm_model_configs table is empty, using in-memory fallback")
        except Exception as e:
            # Exception (not an empty result): leave the existing cache/fallback
            # untouched rather than clobbering it with a partial/failed read.
            print(f"⚠️  Failed to load models from DB: {e}. Using in-memory fallback.")

    @classmethod
    def evict(cls, model_id: str) -> None:
        """Remove a single model id from the DB cache (immutable rebuild).

        Belt-and-suspenders for the DELETE endpoint: if a post-delete
        ``load_from_db`` fails to reflect the removal, the endpoint evicts the
        id directly so a hard-deleted model never lingers in a stale cache.
        Works even in in-memory fallback mode: when no DB cache exists yet, it
        materializes one from ``_MODELS`` minus the evicted id, so a hard-deleted
        model is not resurrected by the fallback path after a failed reload.
        """
        base = cls._db_cache if cls._db_cache is not None else _MODELS
        cls._db_cache = [m for m in base if m.id != model_id]
        cls._db_index = {m.id: m for m in cls._db_cache}

    @classmethod
    async def sync_to_db(cls, session: Any) -> dict[str, int]:
        """Sync code-defined _MODELS to DB via upsert.

        - INSERT new models that don't exist in DB
        - UPDATE metadata fields for existing models (preserving admin-controlled fields)
        - Does NOT delete models from DB that are no longer in code

        Returns:
            Dict with 'inserted' and 'updated' counts.
        """
        from sqlalchemy import delete, select, update
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        from db.models import LLMModelConfigModel, LLMModelSuppressionModel

        # Suppressed ids must never be re-registered (durable hard-delete).
        # Queried first so downstream inserts/defaults ignore these models.
        result = await session.execute(select(LLMModelSuppressionModel.model_id))
        suppressed_ids = {row[0] for row in result.fetchall()}

        # Self-heal: hard-remove any config row that is currently suppressed.
        # Closes the snapshot↔DELETE race — if a concurrent DELETE commits after
        # another path snapshotted suppressions and then re-INSERTed a config,
        # this bulk delete on the *next* sync removes the stray row, making the
        # "deleted stays deleted" invariant self-correcting.
        # synchronize_session=False: the WHERE uses a subquery that cannot be
        # evaluated in Python, and this fresh session has no identity map to sync.
        await session.execute(
            delete(LLMModelConfigModel)
            .where(LLMModelConfigModel.id.in_(select(LLMModelSuppressionModel.model_id)))
            .execution_options(synchronize_session=False)
        )

        # Get existing IDs to distinguish insert vs update
        result = await session.execute(select(LLMModelConfigModel.id))
        existing_ids = {row[0] for row in result.fetchall()}

        # Providers that already have an ENABLED default row in DB.
        # Guard: a NEW model with is_default=True must not create a second
        # default for a provider whose DB default is admin-controlled.
        # A disabled default row does not count — the new model should
        # still become the provider default in that case.
        result = await session.execute(
            select(LLMModelConfigModel.provider).where(
                LLMModelConfigModel.is_default.is_(True),
                LLMModelConfigModel.is_enabled.is_(True),
            )
        )
        providers_with_db_default = {row[0] for row in result.fetchall()}

        inserted = 0
        updated = 0

        for model in _MODELS:
            # Skip suppressed models entirely: no upsert, no count, no default
            # clearing. This is the startup re-INSERT guard (regression a).
            if model.id in suppressed_ids:
                continue

            is_default = model.is_default
            if (
                is_default
                and model.id not in existing_ids
                and model.provider.value in providers_with_db_default
            ):
                # Respect the existing DB default for this provider:
                # insert the new model as non-default to avoid dual defaults.
                is_default = False

            if is_default and model.id not in existing_ids:
                # This new model is about to be INSERTed as the provider
                # default (the guard above passed, so any remaining default
                # rows for this provider are disabled). Clear their
                # is_default flag so a later admin re-enable of an old row
                # cannot resurrect a second default for the provider.
                # is_enabled=False is part of the WHERE on purpose: under
                # READ COMMITTED an admin could re-enable the old default
                # between the guard SELECT and this UPDATE, so the "only
                # clear DISABLED defaults" invariant must live in the SQL
                # itself, not just in the pre-check.
                await session.execute(
                    update(LLMModelConfigModel)
                    .where(
                        LLMModelConfigModel.provider == model.provider.value,
                        LLMModelConfigModel.is_default.is_(True),
                        LLMModelConfigModel.is_enabled.is_(False),
                        LLMModelConfigModel.id != model.id,
                    )
                    .values(is_default=False)
                )

            values = {
                "id": model.id,
                "display_name": model.display_name,
                "provider": model.provider.value,
                "context_window": model.context_window,
                "input_price": model.input_price,
                "output_price": model.output_price,
                "is_default": is_default,
                "is_enabled": model.is_enabled,
                "supports_tools": model.supports_tools,
                "supports_vision": model.supports_vision,
            }

            # Metadata-only fields to update on conflict
            # Preserves admin-controlled fields: is_enabled, is_default
            update_fields = {
                "display_name": model.display_name,
                "context_window": model.context_window,
                "input_price": model.input_price,
                "output_price": model.output_price,
                "supports_tools": model.supports_tools,
                "supports_vision": model.supports_vision,
            }

            stmt = (
                pg_insert(LLMModelConfigModel)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=["id"],
                    set_=update_fields,
                )
            )
            await session.execute(stmt)

            if model.id in existing_ids:
                updated += 1
            else:
                inserted += 1

        await session.commit()
        await cls.load_from_db(session)

        return {"inserted": inserted, "updated": updated}

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
                    return "codex-cli"  # Fallback

            models = cls.get_by_provider(provider)
            for m in models:
                if m.is_default:
                    return m.id
            return models[0].id if models else "codex-cli"

        # No provider specified - resolve from the configured provider so the
        # registry default stays consistent with LLM_PROVIDER (headless deploys
        # set google/openai; local dev defaults to codex_cli). `or` guards the
        # empty-string case to avoid recursing back into this branch.
        return cls.get_default(os.getenv("LLM_PROVIDER") or "codex_cli")

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
        # CLI providers report available=True to mean "no API key required"
        # (subscription-backed local CLI), NOT "binary is installed". Binary
        # presence is probed separately by LLM Access health checks. Do NOT
        # "fix" this with a shutil.which() gate: it would change existing Codex
        # API behavior and false-negative in CI where the binary is absent.
        # Deliberate rejection of Codex review P2.
        elif provider == LLMProvider.CODEX_CLI:
            return True
        elif provider == LLMProvider.CLAUDE_CLI:
            return True  # CLI subscription runtime is always "available" (local)
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
