"""Service layer for CLI-first LLM access profiles and entitlements."""

from __future__ import annotations

import asyncio
import os
import shlex
import shutil
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from time import perf_counter
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import LLMCLIProfileModel, UserLLMEntitlementModel
from models.llm_access import (
    LLMAccessResponse,
    LLMCLIProfileCreate,
    LLMCLIProfileHealthCheckResponse,
    LLMCLIProfileResponse,
    LLMCLIProfileUpdate,
    LLMEntitlementCreate,
    LLMEntitlementResponse,
    LLMEntitlementUpdate,
)

DEFAULT_CODEX_PROFILE_ID = "default-codex-cli"
DEFAULT_CODEX_ENTITLEMENT_ID = "default-codex-cli-all"
DEFAULT_HEALTH_CHECK_TIMEOUT_SECONDS = 5


@dataclass(frozen=True)
class CLIHealthProbeResult:
    """Raw result from a short CLI command probe."""

    auth_status: str
    command_found: bool
    exit_code: int | None
    latency_ms: int
    message: str
    checked_at: datetime


CLIHealthProbeRunner = Callable[[Any], Awaitable[CLIHealthProbeResult]]


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _api_fallback_enabled() -> bool:
    return os.getenv("LLM_API_FALLBACK_ENABLED", "false").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _default_codex_args() -> list[str]:
    value = os.getenv("CODEX_CLI_ARGS", "exec --sandbox read-only --color never")
    return shlex.split(value)


def _profile_metadata(profile: Any) -> dict[str, Any]:
    metadata = getattr(profile, "metadata_json", None)
    if metadata is None:
        metadata = getattr(profile, "metadata", None)
    return dict(metadata or {})


def _set_profile_metadata(profile: Any, metadata: dict[str, Any]) -> None:
    if hasattr(profile, "metadata_json"):
        profile.metadata_json = metadata
    else:
        profile.metadata = metadata


def _health_check_args(profile: Any) -> list[str]:
    metadata = _profile_metadata(profile)
    args = metadata.get("health_check_args")
    if isinstance(args, str):
        return shlex.split(args)
    if isinstance(args, list):
        return [str(arg) for arg in args]
    return ["--version"]


def _compact_output(value: bytes, *, limit: int = 500) -> str:
    return value.decode(errors="replace").strip()[:limit]


def build_cli_profile_row(
    data: LLMCLIProfileCreate,
    *,
    owner_user_id: str | None = None,
) -> LLMCLIProfileModel:
    """Build an ORM CLI profile row from the create contract."""
    return LLMCLIProfileModel(
        owner_user_id=data.owner_user_id or owner_user_id,
        organization_id=data.organization_id,
        provider=data.provider,
        profile_name=data.profile_name,
        command=data.command,
        args_json=data.args_json,
        working_directory=data.working_directory,
        auth_status=data.auth_status,
        metadata_json=data.metadata,
    )


def build_entitlement_row(data: LLMEntitlementCreate) -> UserLLMEntitlementModel:
    """Build an ORM entitlement row from the create contract."""
    return UserLLMEntitlementModel(
        user_id=data.user_id,
        organization_id=data.organization_id,
        provider=data.provider,
        mode=data.mode,
        source_scope=data.source_scope,
        enabled=data.enabled,
        cli_profile_id=data.cli_profile_id,
        allow_api_fallback=data.allow_api_fallback,
        quota_policy_id=data.quota_policy_id,
    )


def apply_cli_profile_health_result(
    profile: Any,
    result: CLIHealthProbeResult,
) -> None:
    """Apply a health probe result to a profile row or response object."""
    metadata = _profile_metadata(profile)
    metadata["health_check"] = {
        "auth_status": result.auth_status,
        "command_found": result.command_found,
        "exit_code": result.exit_code,
        "latency_ms": result.latency_ms,
        "message": result.message,
        "checked_at": result.checked_at.isoformat(),
    }
    profile.auth_status = result.auth_status
    if hasattr(profile, "updated_at"):
        profile.updated_at = result.checked_at
    _set_profile_metadata(profile, metadata)


def build_cli_profile_health_response(
    profile: LLMCLIProfileResponse,
    result: CLIHealthProbeResult,
) -> LLMCLIProfileHealthCheckResponse:
    """Build the public health check response."""
    return LLMCLIProfileHealthCheckResponse(
        profile=profile,
        auth_status=result.auth_status,
        command_found=result.command_found,
        exit_code=result.exit_code,
        latency_ms=result.latency_ms,
        message=result.message,
        checked_at=result.checked_at,
    )


def cli_profile_to_response(row: Any) -> LLMCLIProfileResponse:
    """Convert a CLI profile row-like object to the response schema."""
    now = _now()
    return LLMCLIProfileResponse(
        id=str(row.id),
        owner_user_id=row.owner_user_id,
        organization_id=row.organization_id,
        provider=row.provider,
        profile_name=row.profile_name,
        command=row.command,
        args_json=list(row.args_json or []),
        working_directory=row.working_directory,
        auth_status=row.auth_status,
        metadata=row.metadata_json or {},
        created_at=row.created_at or now,
        updated_at=row.updated_at,
    )


def entitlement_to_response(row: Any) -> LLMEntitlementResponse:
    """Convert an entitlement row-like object to the response schema."""
    now = _now()
    return LLMEntitlementResponse(
        id=str(row.id),
        user_id=row.user_id,
        organization_id=row.organization_id,
        provider=row.provider,
        mode=row.mode,
        source_scope=row.source_scope,
        enabled=row.enabled,
        cli_profile_id=row.cli_profile_id,
        allow_api_fallback=row.allow_api_fallback,
        quota_policy_id=row.quota_policy_id,
        created_at=row.created_at or now,
        updated_at=row.updated_at,
    )


def default_access_response(user_id: str) -> LLMAccessResponse:
    """Return non-persisted default CLI-first access for a user."""
    now = _now()
    allow_api_fallback = _api_fallback_enabled()
    profile = LLMCLIProfileResponse(
        id=DEFAULT_CODEX_PROFILE_ID,
        owner_user_id=user_id,
        organization_id=None,
        provider="codex_cli",
        profile_name="Default Codex CLI",
        command=os.getenv("CODEX_CLI_COMMAND", "codex"),
        args_json=_default_codex_args(),
        working_directory=None,
        auth_status="unknown",
        metadata={"source": "env-default"},
        created_at=now,
        updated_at=now,
    )
    entitlement = LLMEntitlementResponse(
        id=DEFAULT_CODEX_ENTITLEMENT_ID,
        user_id=user_id,
        organization_id=None,
        provider="codex_cli",
        mode="cli",
        source_scope="all",
        enabled=True,
        cli_profile_id=DEFAULT_CODEX_PROFILE_ID,
        allow_api_fallback=allow_api_fallback,
        quota_policy_id=None,
        created_at=now,
        updated_at=now,
    )
    return LLMAccessResponse(
        user_id=user_id,
        api_fallback_enabled=allow_api_fallback,
        profiles=[profile],
        entitlements=[entitlement],
    )


async def run_cli_profile_health_probe(
    profile: Any,
    *,
    timeout_seconds: int = DEFAULT_HEALTH_CHECK_TIMEOUT_SECONDS,
) -> CLIHealthProbeResult:
    """Run a short local command probe for a CLI profile."""
    checked_at = _now()
    command = str(getattr(profile, "command", "") or "").strip()
    if not command:
        return CLIHealthProbeResult(
            auth_status="disconnected",
            command_found=False,
            exit_code=None,
            latency_ms=0,
            message="CLI command is empty",
            checked_at=checked_at,
        )

    executable = shutil.which(command)
    if executable is None:
        return CLIHealthProbeResult(
            auth_status="disconnected",
            command_found=False,
            exit_code=None,
            latency_ms=0,
            message=f"CLI command not found: {command}",
            checked_at=checked_at,
        )

    working_directory = getattr(profile, "working_directory", None)
    if working_directory and not os.path.isdir(working_directory):
        return CLIHealthProbeResult(
            auth_status="error",
            command_found=True,
            exit_code=None,
            latency_ms=0,
            message=f"Working directory not found: {working_directory}",
            checked_at=checked_at,
        )

    start = perf_counter()
    try:
        process = await asyncio.create_subprocess_exec(
            executable,
            *_health_check_args(profile),
            cwd=working_directory,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as exc:
        latency_ms = int((perf_counter() - start) * 1000)
        return CLIHealthProbeResult(
            auth_status="error",
            command_found=True,
            exit_code=None,
            latency_ms=latency_ms,
            message=f"CLI health check failed: {exc}",
            checked_at=checked_at,
        )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout_seconds,
        )
    except TimeoutError:
        process.kill()
        await process.communicate()
        latency_ms = int((perf_counter() - start) * 1000)
        return CLIHealthProbeResult(
            auth_status="error",
            command_found=True,
            exit_code=None,
            latency_ms=latency_ms,
            message=f"CLI health check timed out after {timeout_seconds}s",
            checked_at=checked_at,
        )

    latency_ms = int((perf_counter() - start) * 1000)
    message = _compact_output(stderr) or _compact_output(stdout)
    exit_code = process.returncode
    return CLIHealthProbeResult(
        auth_status="connected" if exit_code == 0 else "error",
        command_found=True,
        exit_code=exit_code,
        latency_ms=latency_ms,
        message=message or f"CLI health check exited with code {exit_code}",
        checked_at=checked_at,
    )


async def check_cli_profile_health(
    db: AsyncSession | None,
    profile_id: str,
    *,
    fallback_user_id: str | None = None,
    runner: CLIHealthProbeRunner | None = None,
) -> LLMCLIProfileHealthCheckResponse | None:
    """Probe a CLI profile and update persisted auth status when available."""
    probe_runner = runner or run_cli_profile_health_probe
    if profile_id == DEFAULT_CODEX_PROFILE_ID:
        profile = default_access_response(fallback_user_id or "anonymous").profiles[0]
        result = await probe_runner(profile)
        apply_cli_profile_health_result(profile, result)
        return build_cli_profile_health_response(profile, result)

    if db is None:
        return None

    result = await db.execute(
        select(LLMCLIProfileModel).where(LLMCLIProfileModel.id == profile_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None

    probe_result = await probe_runner(row)
    apply_cli_profile_health_result(row, probe_result)
    await db.flush()
    return build_cli_profile_health_response(
        cli_profile_to_response(row),
        probe_result,
    )


def _has_codex_cli_profile(profiles: list[LLMCLIProfileResponse]) -> bool:
    return any(profile.provider == "codex_cli" for profile in profiles)


def _has_codex_cli_entitlement(entitlements: list[LLMEntitlementResponse]) -> bool:
    return any(
        entitlement.provider == "codex_cli" and entitlement.mode == "cli"
        for entitlement in entitlements
    )


async def get_access_for_user(
    db: AsyncSession,
    user_id: str,
    *,
    organization_id: str | None = None,
) -> LLMAccessResponse:
    """Return persisted access plus synthesized defaults for a user."""
    profile_stmt = select(LLMCLIProfileModel).where(
        or_(
            LLMCLIProfileModel.owner_user_id == user_id,
            LLMCLIProfileModel.owner_user_id.is_(None),
        )
    )
    if organization_id:
        profile_stmt = profile_stmt.where(
            or_(
                LLMCLIProfileModel.organization_id == organization_id,
                LLMCLIProfileModel.organization_id.is_(None),
            )
        )
    else:
        profile_stmt = profile_stmt.where(LLMCLIProfileModel.organization_id.is_(None))

    entitlement_stmt = select(UserLLMEntitlementModel).where(
        UserLLMEntitlementModel.user_id == user_id
    )
    if organization_id:
        entitlement_stmt = entitlement_stmt.where(
            or_(
                UserLLMEntitlementModel.organization_id == organization_id,
                UserLLMEntitlementModel.organization_id.is_(None),
            )
        )
    else:
        entitlement_stmt = entitlement_stmt.where(UserLLMEntitlementModel.organization_id.is_(None))

    profile_result = await db.execute(profile_stmt)
    entitlement_result = await db.execute(entitlement_stmt)
    profiles = [cli_profile_to_response(row) for row in profile_result.scalars().all()]
    entitlements = [
        entitlement_to_response(row) for row in entitlement_result.scalars().all()
    ]

    defaults = default_access_response(user_id)
    if not _has_codex_cli_profile(profiles):
        profiles.insert(0, defaults.profiles[0])
    if not _has_codex_cli_entitlement(entitlements):
        entitlements.insert(0, defaults.entitlements[0])

    return LLMAccessResponse(
        user_id=user_id,
        api_fallback_enabled=_api_fallback_enabled(),
        profiles=profiles,
        entitlements=entitlements,
    )


async def list_cli_profiles(
    db: AsyncSession,
    *,
    owner_user_id: str | None = None,
    organization_id: str | None = None,
    provider: str | None = None,
) -> list[LLMCLIProfileResponse]:
    """List CLI profiles for admin Settings screens."""
    stmt = select(LLMCLIProfileModel)
    if owner_user_id:
        stmt = stmt.where(LLMCLIProfileModel.owner_user_id == owner_user_id)
    if organization_id:
        stmt = stmt.where(LLMCLIProfileModel.organization_id == organization_id)
    if provider:
        stmt = stmt.where(LLMCLIProfileModel.provider == provider)
    result = await db.execute(stmt.order_by(LLMCLIProfileModel.created_at.desc()))
    return [cli_profile_to_response(row) for row in result.scalars().all()]


async def create_cli_profile(
    db: AsyncSession,
    data: LLMCLIProfileCreate,
    *,
    owner_user_id: str | None = None,
) -> LLMCLIProfileResponse:
    """Create a CLI profile."""
    row = build_cli_profile_row(data, owner_user_id=owner_user_id)
    db.add(row)
    await db.flush()
    return cli_profile_to_response(row)


async def update_cli_profile(
    db: AsyncSession,
    profile_id: str,
    data: LLMCLIProfileUpdate,
) -> LLMCLIProfileResponse | None:
    """Patch a CLI profile."""
    result = await db.execute(
        select(LLMCLIProfileModel).where(LLMCLIProfileModel.id == profile_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None

    fields = data.model_fields_set
    for field in fields:
        value = getattr(data, field)
        if field == "metadata":
            row.metadata_json = value or {}
        else:
            setattr(row, field, value)
    await db.flush()
    return cli_profile_to_response(row)


async def delete_cli_profile(
    db: AsyncSession,
    profile_id: str,
) -> bool:
    """Delete a persisted CLI profile and detach entitlements that reference it."""
    if profile_id == DEFAULT_CODEX_PROFILE_ID:
        return False

    result = await db.execute(
        select(LLMCLIProfileModel).where(LLMCLIProfileModel.id == profile_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return False

    entitlement_result = await db.execute(
        select(UserLLMEntitlementModel).where(
            UserLLMEntitlementModel.cli_profile_id == profile_id
        )
    )
    updated_at = _now()
    for entitlement in entitlement_result.scalars().all():
        entitlement.cli_profile_id = None
        entitlement.updated_at = updated_at

    await db.delete(row)
    await db.flush()
    return True


async def list_entitlements(
    db: AsyncSession,
    *,
    user_id: str | None = None,
    organization_id: str | None = None,
    provider: str | None = None,
) -> list[LLMEntitlementResponse]:
    """List LLM entitlements."""
    stmt = select(UserLLMEntitlementModel)
    if user_id:
        stmt = stmt.where(UserLLMEntitlementModel.user_id == user_id)
    if organization_id:
        stmt = stmt.where(UserLLMEntitlementModel.organization_id == organization_id)
    if provider:
        stmt = stmt.where(UserLLMEntitlementModel.provider == provider)
    result = await db.execute(stmt.order_by(UserLLMEntitlementModel.created_at.desc()))
    return [entitlement_to_response(row) for row in result.scalars().all()]


async def create_entitlement(
    db: AsyncSession,
    data: LLMEntitlementCreate,
) -> LLMEntitlementResponse:
    """Create an LLM entitlement."""
    row = build_entitlement_row(data)
    db.add(row)
    await db.flush()
    return entitlement_to_response(row)


async def update_entitlement(
    db: AsyncSession,
    entitlement_id: str,
    data: LLMEntitlementUpdate,
) -> LLMEntitlementResponse | None:
    """Patch an LLM entitlement."""
    result = await db.execute(
        select(UserLLMEntitlementModel).where(UserLLMEntitlementModel.id == entitlement_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None

    fields = data.model_fields_set
    for field in fields:
        setattr(row, field, getattr(data, field))
    await db.flush()
    return entitlement_to_response(row)
