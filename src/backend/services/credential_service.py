"""Service for managing user LLM credentials."""

from __future__ import annotations

import time
from datetime import datetime

import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import UserLLMCredentialModel
from models.external_usage import (
    ExternalProvider,
    LLMCredentialCreate,
    LLMCredentialResponse,
    LLMCredentialVerifyResponse,
)


def _mask_key(key: str) -> str:
    """Return masked version: first 6 chars + '...' + last 4 chars."""
    if len(key) <= 12:
        return key[:3] + "..." + key[-2:]
    return key[:6] + "..." + key[-4:]


async def list_user_credentials(
    db: AsyncSession, user_id: str
) -> list[LLMCredentialResponse]:
    """Return all active credentials for a user (keys masked)."""
    result = await db.execute(
        select(UserLLMCredentialModel)
        .where(
            and_(
                UserLLMCredentialModel.user_id == user_id,
                UserLLMCredentialModel.is_active == True,  # noqa: E712
            )
        )
        .order_by(UserLLMCredentialModel.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        LLMCredentialResponse(
            id=row.id,
            provider=ExternalProvider(row.provider),
            key_name=row.key_name,
            api_key_masked=_mask_key(row.api_key),
            is_active=row.is_active,
            last_verified_at=row.last_verified_at,
            created_at=row.created_at,
        )
        for row in rows
    ]


async def create_credential(
    db: AsyncSession, user_id: str, data: LLMCredentialCreate
) -> LLMCredentialResponse:
    """Store a new LLM API Key (encrypted by EncryptedString column type)."""
    row = UserLLMCredentialModel(
        user_id=user_id,
        provider=data.provider.value,
        key_name=data.key_name,
        api_key=data.api_key,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return LLMCredentialResponse(
        id=row.id,
        provider=ExternalProvider(row.provider),
        key_name=row.key_name,
        api_key_masked=_mask_key(data.api_key),
        is_active=row.is_active,
        last_verified_at=row.last_verified_at,
        created_at=row.created_at,
    )


async def delete_credential(
    db: AsyncSession, user_id: str, credential_id: str
) -> bool:
    """Soft-delete (deactivate) a credential. Returns False if not found/owned."""
    result = await db.execute(
        select(UserLLMCredentialModel).where(
            and_(
                UserLLMCredentialModel.id == credential_id,
                UserLLMCredentialModel.user_id == user_id,
            )
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return False
    row.is_active = False
    await db.commit()
    return True


async def verify_credential(
    db: AsyncSession, user_id: str, credential_id: str
) -> LLMCredentialVerifyResponse:
    """Test if the stored API key is valid by making a lightweight API call."""
    result = await db.execute(
        select(UserLLMCredentialModel).where(
            and_(
                UserLLMCredentialModel.id == credential_id,
                UserLLMCredentialModel.user_id == user_id,
            )
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return LLMCredentialVerifyResponse(
            is_valid=False,
            provider=ExternalProvider.OPENAI,
            error_message="Credential not found",
        )

    provider = ExternalProvider(row.provider)
    api_key = row.api_key  # decrypted automatically by EncryptedString

    t0 = time.monotonic()
    try:
        is_valid, error = await _test_key(provider, api_key)
        latency = (time.monotonic() - t0) * 1000
        if is_valid:
            row.last_verified_at = datetime.utcnow()
            await db.commit()
        return LLMCredentialVerifyResponse(
            is_valid=is_valid,
            provider=provider,
            error_message=error,
            latency_ms=round(latency, 1),
        )
    except Exception as e:
        return LLMCredentialVerifyResponse(
            is_valid=False,
            provider=provider,
            error_message=str(e),
        )


async def _test_key(provider: ExternalProvider, api_key: str) -> tuple[bool, str | None]:
    """Make a minimal API call to verify the key."""
    async with httpx.AsyncClient(timeout=10) as client:
        if provider == ExternalProvider.OPENAI:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                return True, None
            return False, f"OpenAI: HTTP {resp.status_code}"

        elif provider == ExternalProvider.ANTHROPIC:
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
            )
            if resp.status_code == 200:
                return True, None
            return False, f"Anthropic: HTTP {resp.status_code}"

        elif provider == ExternalProvider.GOOGLE_GEMINI:
            resp = await client.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
            )
            if resp.status_code == 200:
                return True, None
            return False, f"Gemini: HTTP {resp.status_code}"

    return False, f"Unsupported provider: {provider}"


async def get_raw_key(
    db: AsyncSession, user_id: str, provider: ExternalProvider
) -> str | None:
    """Return decrypted API key for a user+provider (for proxy use). None if not found."""
    result = await db.execute(
        select(UserLLMCredentialModel)
        .where(
            and_(
                UserLLMCredentialModel.user_id == user_id,
                UserLLMCredentialModel.provider == provider.value,
                UserLLMCredentialModel.is_active == True,  # noqa: E712
            )
        )
        .order_by(UserLLMCredentialModel.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row.api_key if row else None
