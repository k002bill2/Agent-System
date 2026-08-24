"""Service for deployment-wide usage API credentials.

Distinct from ``credential_service`` (per-user chat keys): this module manages
org-level keys used **solely to read External Usage APIs** (org usage / metrics),
managed by admins/managers. The key resolution order is:

1. active DB row (decrypted), then
2. ``EXTERNAL_*`` environment variable fallback, then
3. ``None``.

The ``verify`` path deliberately calls the **real usage endpoints** (not the
generic ``/v1/models`` key-validity check that ``credential_service`` uses —
that was the root cause of chat keys appearing usage-capable). It observes only
the HTTP status code; it never hardcodes or inspects scope strings.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime, timedelta
from typing import cast

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from db.models import DeploymentUsageCredentialModel
from models.external_usage import (
    DeploymentUsageKeyResponse,
    DeploymentUsageKeyUpsert,
    DeploymentUsageKeyVerifyResponse,
    ExternalProvider,
)
from utils.time import utcnow

logger = logging.getLogger(__name__)

# Provider → environment-variable fallback name.
ENV_MAP: dict[ExternalProvider, str] = {
    ExternalProvider.OPENAI: "EXTERNAL_OPENAI_ADMIN_KEY",
    ExternalProvider.ANTHROPIC: "EXTERNAL_ANTHROPIC_ADMIN_KEY",
    ExternalProvider.GITHUB_COPILOT: "EXTERNAL_GITHUB_TOKEN",
}

# Providers that support a deployment usage credential.
SUPPORTED_PROVIDERS: tuple[ExternalProvider, ...] = (
    ExternalProvider.OPENAI,
    ExternalProvider.ANTHROPIC,
    ExternalProvider.GITHUB_COPILOT,
)


def _mask_key(key: str) -> str:
    """Return masked version: first 6 chars + '...' + last 4 chars."""
    if len(key) <= 12:
        return key[:3] + "..." + key[-2:]
    return key[:6] + "..." + key[-4:]


async def _get_row(
    db: AsyncSession, provider: ExternalProvider
) -> DeploymentUsageCredentialModel | None:
    """Return the single credential row for a provider (active or not)."""
    result = await db.execute(
        select(DeploymentUsageCredentialModel).where(
            DeploymentUsageCredentialModel.provider == provider.value
        )
    )
    return result.scalar_one_or_none()


async def _get_active_row(
    db: AsyncSession, provider: ExternalProvider
) -> DeploymentUsageCredentialModel | None:
    """Return the ACTIVE credential row for a provider (used for collection)."""
    result = await db.execute(
        select(DeploymentUsageCredentialModel).where(
            DeploymentUsageCredentialModel.provider == provider.value,
            DeploymentUsageCredentialModel.is_active == True,  # noqa: E712
        )
    )
    return result.scalar_one_or_none()


async def resolve_admin_key(db: AsyncSession, provider: ExternalProvider) -> str | None:
    """Resolve the usage admin key: active DB row > env var > None."""
    row = await _get_active_row(db, provider)
    if row is not None:
        return cast(str, row.api_key)  # decrypted automatically by EncryptedString

    env_name = ENV_MAP.get(provider)
    if env_name:
        env_value = os.getenv(env_name)
        if env_value:
            return env_value

    return None


def _build_response(
    provider: ExternalProvider,
    row: DeploymentUsageCredentialModel | None,
) -> DeploymentUsageKeyResponse:
    """Compose a status response from a DB row + env fallback (key masked)."""
    env_name = ENV_MAP.get(provider)
    env_value = os.getenv(env_name) if env_name else None

    has_db_key = row is not None
    is_active = bool(row.is_active) if row is not None else False

    if has_db_key and is_active:
        source = "db"
    elif env_value:
        source = "env"
    else:
        source = "none"

    # Mask the key that is actually the effective source — not merely whichever
    # row exists. An inactive DB row with an env fallback reports source="env",
    # so it must show the env key's mask, not the (unused) inactive DB key.
    if source == "db" and row is not None:
        masked = _mask_key(row.api_key)
    elif source == "env" and env_value:
        masked = _mask_key(env_value)
    else:
        masked = None

    return DeploymentUsageKeyResponse(
        provider=provider,
        has_db_key=has_db_key,
        is_active=is_active,
        source=source,
        api_key_masked=masked,
        label=row.label if row is not None else None,
        last_verified_at=row.last_verified_at if row is not None else None,
        created_at=row.created_at if row is not None else None,
        updated_at=row.updated_at if row is not None else None,
    )


async def list_deployment_keys(db: AsyncSession) -> list[DeploymentUsageKeyResponse]:
    """Return per-provider usage key status for all supported providers."""
    responses: list[DeploymentUsageKeyResponse] = []
    for provider in SUPPORTED_PROVIDERS:
        row = await _get_row(db, provider)
        responses.append(_build_response(provider, row))
    return responses


async def upsert_deployment_key(
    db: AsyncSession, provider: ExternalProvider, data: DeploymentUsageKeyUpsert
) -> DeploymentUsageKeyResponse:
    """Insert or update the single usage key for a provider.

    Partial-update semantics (design A5): only fields present in the request
    body are written. ``api_key`` omitted preserves the current key; ``label``
    / ``is_active`` omitted preserve their current values (so a label-only edit
    never wipes ``is_active`` and an is_active-only toggle never wipes the
    label). Creating a new row requires ``api_key``. Rejected when field
    encryption is unavailable, so a high-privilege admin key is never written to
    the DB in plaintext.
    """
    fields = data.model_fields_set
    row = await _get_row(db, provider)

    if row is None and data.api_key is None:
        raise ValueError("api_key is required to create a new usage credential")
    if (row is None or data.api_key is not None) and not get_settings().encryption_master_key:
        raise ValueError(
            "ENCRYPTION_MASTER_KEY must be configured before storing a usage admin key"
        )

    if row is None:
        row = DeploymentUsageCredentialModel(
            provider=provider.value,
            api_key=data.api_key,
            label=data.label,
            is_active=data.is_active,
        )
        db.add(row)
    else:
        if data.api_key is not None:
            row.api_key = data.api_key
        if "label" in fields:
            row.label = data.label
        if "is_active" in fields:
            row.is_active = data.is_active
        row.updated_at = utcnow()

    await db.commit()
    await db.refresh(row)
    return _build_response(provider, row)


async def delete_deployment_key(db: AsyncSession, provider: ExternalProvider) -> bool:
    """Hard-delete the usage key for a provider. Returns False if none exists."""
    row = await _get_row(db, provider)
    if row is None:
        return False
    await db.delete(row)
    await db.commit()
    return True


def _classify_status(status_code: int) -> tuple[bool, bool]:
    """Map an HTTP status to ``(is_valid, usage_capable)`` — status only.

    - 200 → authenticated and usage-capable.
    - 401 → not authenticated (bad key).
    - 403 → authenticated but lacks usage permission/scope.
    - other → treat as not valid / not usage-capable.
    """
    if status_code == 200:
        return True, True
    if status_code == 403:
        return True, False
    return False, False


def _status_result(status_code: int) -> tuple[int, str | None]:
    return status_code, None if status_code == 200 else f"HTTP {status_code}"


async def _probe_openai(
    client: httpx.AsyncClient, api_key: str, start: datetime, now: datetime
) -> tuple[int | None, str | None]:
    resp = await client.get(
        "https://api.openai.com/v1/organization/usage/completions",
        headers={"Authorization": f"Bearer {api_key}"},
        params={
            "start_time": int(start.timestamp()),
            "end_time": int(now.timestamp()),
            "bucket_width": "1d",
            "limit": 1,
        },
    )
    return _status_result(resp.status_code)


async def _probe_anthropic(
    client: httpx.AsyncClient, api_key: str, start: datetime, now: datetime
) -> tuple[int | None, str | None]:
    resp = await client.get(
        "https://api.anthropic.com/v1/organizations/usage_report/messages",
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
        params={
            "starting_at": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "ending_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "bucket_width": "1d",
            "limit": 1,
        },
    )
    return _status_result(resp.status_code)


async def _probe_github(client: httpx.AsyncClient, api_key: str) -> tuple[int | None, str | None]:
    org = os.getenv("EXTERNAL_GITHUB_ORG")
    if not org:
        return None, "EXTERNAL_GITHUB_ORG not configured"
    resp = await client.get(
        f"https://api.github.com/orgs/{org}/copilot/metrics",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    return _status_result(resp.status_code)


async def _probe_usage_endpoint(
    provider: ExternalProvider, api_key: str
) -> tuple[int | None, str | None]:
    """Call the provider's real usage endpoint. Returns (status_code, error_msg).

    Observes HTTP status only — no scope-string inspection.
    """
    now = datetime.now(tz=UTC)
    start = now - timedelta(days=1)
    async with httpx.AsyncClient(timeout=10) as client:
        if provider == ExternalProvider.OPENAI:
            return await _probe_openai(client, api_key, start, now)
        if provider == ExternalProvider.ANTHROPIC:
            return await _probe_anthropic(client, api_key, start, now)
        if provider == ExternalProvider.GITHUB_COPILOT:
            return await _probe_github(client, api_key)
    return None, f"Unsupported provider for usage verification: {provider.value}"


async def _record_verification(db: AsyncSession, provider: ExternalProvider) -> None:
    """Stamp ``last_verified_at`` on the ACTIVE DB row only.

    An env-sourced key has no active row, so nothing is stamped — this prevents
    an inactive row from appearing "recently verified" when the env key was the
    one actually probed.
    """
    row = await _get_active_row(db, provider)
    if row is not None:
        row.last_verified_at = utcnow()
        await db.commit()


async def verify_deployment_key(
    db: AsyncSession, provider: ExternalProvider
) -> DeploymentUsageKeyVerifyResponse:
    """Verify the resolved usage key against the provider's real usage endpoint."""
    api_key = await resolve_admin_key(db, provider)
    if not api_key:
        return DeploymentUsageKeyVerifyResponse(
            provider=provider,
            is_valid=False,
            usage_capable=False,
            error_message="No usage key configured",
        )

    t0 = time.monotonic()
    try:
        status_code, error_message = await _probe_usage_endpoint(provider, api_key)
    except Exception as exc:  # network/timeout/etc.
        # Log detail server-side; never echo the exception (may embed the key).
        logger.warning("Usage endpoint probe failed for %s: %s", provider.value, exc)
        return DeploymentUsageKeyVerifyResponse(
            provider=provider,
            is_valid=False,
            usage_capable=False,
            error_message="Usage endpoint request failed",
            latency_ms=round((time.monotonic() - t0) * 1000, 1),
        )

    latency = round((time.monotonic() - t0) * 1000, 1)
    if status_code is None:
        return DeploymentUsageKeyVerifyResponse(
            provider=provider,
            is_valid=False,
            usage_capable=False,
            status_code=None,
            error_message=error_message,
            latency_ms=latency,
        )

    is_valid, usage_capable = _classify_status(status_code)
    if is_valid:
        await _record_verification(db, provider)

    return DeploymentUsageKeyVerifyResponse(
        provider=provider,
        is_valid=is_valid,
        usage_capable=usage_capable,
        status_code=status_code,
        error_message=error_message,
        latency_ms=latency,
    )
