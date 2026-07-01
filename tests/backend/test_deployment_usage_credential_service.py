"""Tests for deployment_usage_credential_service.verify_deployment_key.

Core regression: the External Usage "No data" bug came from verifying admin
keys against ``/v1/models`` (key-validity), which a chat key passes (200). The
fix verifies against the *real usage endpoint*; a chat key lacking org-usage
access returns 401/403 there, so ``usage_capable`` must be ``False``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.external_usage import DeploymentUsageKeyUpsert, ExternalProvider
from services import deployment_usage_credential_service as ducs


def _mock_client(status: int) -> AsyncMock:
    """Async-context-manager httpx client whose GET returns the given status."""
    mock_response = MagicMock()
    mock_response.status_code = status

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


async def _verify_with_status(status: int) -> tuple[object, AsyncMock]:
    """Run verify for OpenAI with a resolved key + canned status.

    Returns ``(result, mock_client)`` so callers can assert *which* URL was hit —
    the core of the bug fix (chat keys pass /v1/models but fail the usage API).
    """
    mock_client = _mock_client(status)
    with (
        patch.object(ducs, "resolve_admin_key", AsyncMock(return_value="sk-chat-key")),
        patch.object(ducs, "_get_row", AsyncMock(return_value=None)),
        patch(
            "services.deployment_usage_credential_service.httpx.AsyncClient",
            return_value=mock_client,
        ),
    ):
        result = await ducs.verify_deployment_key(AsyncMock(), ExternalProvider.OPENAI)
    return result, mock_client


def _called_url(mock_client: AsyncMock) -> str:
    return str(mock_client.get.call_args.args[0])


async def test_chat_key_401_is_not_usage_capable() -> None:
    """A 401 on the usage endpoint → invalid + not usage-capable (the bug fix)."""
    result, mock_client = await _verify_with_status(401)
    # Must probe the real usage endpoint — NOT the /v1/models key-validity check
    # that a chat key would pass (that reuse was the root cause).
    assert "organization/usage/completions" in _called_url(mock_client)
    assert "/v1/models" not in _called_url(mock_client)
    assert result.is_valid is False
    assert result.usage_capable is False
    assert result.status_code == 401


async def test_chat_key_403_authenticated_but_not_usage_capable() -> None:
    """A 403 means authenticated but lacking usage scope: valid, not capable."""
    result, mock_client = await _verify_with_status(403)
    assert "organization/usage/completions" in _called_url(mock_client)
    assert result.is_valid is True
    assert result.usage_capable is False
    assert result.status_code == 403


async def test_admin_key_200_is_usage_capable() -> None:
    """A 200 from the usage endpoint → valid and usage-capable."""
    result, mock_client = await _verify_with_status(200)
    assert "organization/usage/completions" in _called_url(mock_client)
    assert result.is_valid is True
    assert result.usage_capable is True
    assert result.status_code == 200


async def test_no_key_configured_short_circuits() -> None:
    """No resolvable key → not valid, not usage-capable, no HTTP call."""
    with patch.object(ducs, "resolve_admin_key", AsyncMock(return_value=None)):
        result = await ducs.verify_deployment_key(AsyncMock(), ExternalProvider.ANTHROPIC)
    assert result.is_valid is False
    assert result.usage_capable is False
    assert result.status_code is None
    assert result.error_message == "No usage key configured"


# ── upsert: partial update preserves the encrypted key (design A5) ──


async def test_upsert_existing_row_preserves_key_when_api_key_omitted() -> None:
    """Omitting api_key on an existing row keeps the key; only label/is_active change."""
    original_key = "sk-original-secret-1234567890"
    row = SimpleNamespace(
        provider=ExternalProvider.OPENAI.value,
        api_key=original_key,
        label="old-label",
        is_active=True,
        last_verified_at=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=None,
    )
    db = AsyncMock()
    data = DeploymentUsageKeyUpsert(api_key=None, label="old-label", is_active=False)

    with patch.object(ducs, "_get_row", AsyncMock(return_value=row)):
        result = await ducs.upsert_deployment_key(db, ExternalProvider.OPENAI, data)

    assert row.api_key == original_key  # encrypted key preserved
    assert row.is_active is False  # toggle applied
    assert result.is_active is False
    assert result.has_db_key is True
    db.commit.assert_awaited_once()


async def test_upsert_new_provider_without_key_is_rejected() -> None:
    """Creating a brand-new credential without api_key raises ValueError (→ HTTP 400)."""
    db = AsyncMock()
    data = DeploymentUsageKeyUpsert(api_key=None, is_active=True)

    with patch.object(ducs, "_get_row", AsyncMock(return_value=None)):
        with pytest.raises(ValueError, match="api_key is required"):
            await ducs.upsert_deployment_key(db, ExternalProvider.ANTHROPIC, data)

    db.commit.assert_not_awaited()
