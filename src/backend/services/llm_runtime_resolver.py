"""Resolve CLI-first LLM runtime policy from access entitlements."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from models.llm_access import (
    LLMAccessResponse,
    LLMCLIProfileResponse,
    LLMEntitlementResponse,
)
from models.llm_models import LLMModelRegistry


class LLMRuntimeResolutionError(PermissionError):
    """Raised when a user is not allowed to use the requested runtime."""


@dataclass(frozen=True)
class LLMRuntimeRequest:
    """Runtime resolution input."""

    user_id: str | None
    source: str
    requested_model_id: str | None = None
    organization_id: str | None = None


@dataclass(frozen=True)
class LLMRuntimeResolution:
    """Resolved runtime selection."""

    model_id: str
    provider: str
    mode: str
    source: str
    entitlement_id: str
    source_scope: str
    cli_profile_id: str | None = None
    cli_profile: LLMCLIProfileResponse | None = None
    allow_api_fallback: bool = False

    def usage_metadata(self) -> dict[str, Any]:
        """Return compact metadata suitable for the usage ledger."""
        return {
            "runtime_provider": self.provider,
            "runtime_mode": self.mode,
            "entitlement_id": self.entitlement_id,
            "source_scope": self.source_scope,
            "cli_profile_id": self.cli_profile_id,
            "api_fallback_allowed": self.allow_api_fallback,
        }


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _runtime_mode_for_provider(provider: str) -> str:
    if provider.endswith("_cli"):
        return "cli"
    if provider == "ollama":
        return "local"
    return "api"


def _source_matches(scope: str, source: str) -> bool:
    return scope == "all" or scope == source or source.startswith(f"{scope}_")


def _enabled_entitlements(
    access: LLMAccessResponse,
    request: LLMRuntimeRequest,
) -> list[LLMEntitlementResponse]:
    source = str(_enum_value(request.source))
    return [
        entitlement
        for entitlement in access.entitlements
        if entitlement.enabled
        and _source_matches(entitlement.source_scope, source)
        and (
            request.organization_id is None
            or entitlement.organization_id in (None, request.organization_id)
        )
    ]


def _provider_for_requested_model(requested_model_id: str | None) -> str | None:
    if not requested_model_id:
        return None
    provider = LLMModelRegistry.get_provider(requested_model_id)
    if provider is None:
        raise LLMRuntimeResolutionError(f"Unknown model: {requested_model_id}")
    return provider.value


def _select_entitlement(
    entitlements: list[LLMEntitlementResponse],
    *,
    provider: str | None,
    mode: str | None,
) -> LLMEntitlementResponse:
    if provider and mode:
        for entitlement in entitlements:
            if entitlement.provider == provider and entitlement.mode == mode:
                return entitlement
        raise LLMRuntimeResolutionError(
            f"No enabled LLM entitlement for provider={provider}, mode={mode}"
        )

    # Prefer the CLI-first default when the caller did not request a model.
    for entitlement in entitlements:
        if entitlement.provider == "codex_cli" and entitlement.mode == "cli":
            return entitlement
    for entitlement in entitlements:
        if entitlement.mode == "cli":
            return entitlement
    return entitlements[0]


def _profile_for_entitlement(
    access: LLMAccessResponse,
    entitlement: LLMEntitlementResponse,
) -> LLMCLIProfileResponse | None:
    if entitlement.cli_profile_id:
        for profile in access.profiles:
            if profile.id == entitlement.cli_profile_id:
                return profile
    for profile in access.profiles:
        if profile.provider == entitlement.provider:
            return profile
    return None


def _model_for_resolution(
    requested_model_id: str | None,
    entitlement: LLMEntitlementResponse,
) -> str:
    if requested_model_id:
        return requested_model_id
    return LLMModelRegistry.get_default(entitlement.provider)


def resolve_llm_runtime(
    access: LLMAccessResponse,
    request: LLMRuntimeRequest,
) -> LLMRuntimeResolution:
    """Resolve the runtime a user may use for a source/model request."""
    source = str(_enum_value(request.source))
    entitlements = _enabled_entitlements(access, request)
    if not entitlements:
        raise LLMRuntimeResolutionError(f"No enabled LLM entitlement for source={source}")

    requested_provider = _provider_for_requested_model(request.requested_model_id)
    requested_mode = _runtime_mode_for_provider(requested_provider) if requested_provider else None
    entitlement = _select_entitlement(
        entitlements,
        provider=requested_provider,
        mode=requested_mode,
    )

    if entitlement.mode == "api" and not (
        access.api_fallback_enabled and entitlement.allow_api_fallback
    ):
        raise LLMRuntimeResolutionError("API fallback is disabled for this entitlement")

    cli_profile = (
        _profile_for_entitlement(access, entitlement) if entitlement.mode == "cli" else None
    )
    model_id = _model_for_resolution(request.requested_model_id, entitlement)

    return LLMRuntimeResolution(
        model_id=model_id,
        provider=entitlement.provider,
        mode=entitlement.mode,
        source=source,
        entitlement_id=entitlement.id,
        source_scope=entitlement.source_scope,
        cli_profile_id=entitlement.cli_profile_id,
        cli_profile=cli_profile,
        allow_api_fallback=entitlement.allow_api_fallback,
    )
