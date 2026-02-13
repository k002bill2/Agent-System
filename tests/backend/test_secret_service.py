"""Tests for secret service (DB-backed)."""

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.secret import SecretCreate, SecretScope, SecretUpdate
from services.secret_service import SecretService


def _make_row(**kwargs):
    """Create a mock WorkflowSecretModel row."""
    row = MagicMock()
    row.id = kwargs.get("id", str(uuid.uuid4()))
    row.name = kwargs.get("name", "TEST_KEY")
    row.encrypted_value = kwargs.get("encrypted_value", "enc_value")
    row.scope = kwargs.get("scope", "workflow")
    row.scope_id = kwargs.get("scope_id", None)
    row.created_by = kwargs.get("created_by", None)
    row.created_at = kwargs.get("created_at", datetime(2024, 1, 1))
    row.updated_at = kwargs.get("updated_at", datetime(2024, 1, 1))
    return row


class TestSecretService:
    def setup_method(self):
        self.db = AsyncMock()
        self.svc = SecretService(self.db)

    @pytest.mark.asyncio
    async def test_list_secrets_empty(self):
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = []
        self.db.execute = AsyncMock(return_value=result_mock)

        secrets = await self.svc.list_secrets()
        assert secrets == []

    @pytest.mark.asyncio
    async def test_list_secrets_returns_without_values(self):
        rows = [_make_row(name="A"), _make_row(name="B")]
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = rows
        self.db.execute = AsyncMock(return_value=result_mock)

        secrets = await self.svc.list_secrets()
        assert len(secrets) == 2
        assert secrets[0]["name"] == "A"
        assert "value" not in secrets[0]
        assert "encrypted_value" not in secrets[0]

    @pytest.mark.asyncio
    async def test_create_secret_success(self):
        # No duplicate found
        no_dup = MagicMock()
        no_dup.scalar_one_or_none.return_value = None
        self.db.execute = AsyncMock(return_value=no_dup)
        self.db.add = MagicMock()
        self.db.flush = AsyncMock()

        result = await self.svc.create_secret(
            SecretCreate(name="API_KEY", value="secret123", scope=SecretScope.WORKFLOW, scope_id="wf1"),
            user_id="user-1",
        )
        assert result["name"] == "API_KEY"
        assert result["created_by"] == "user-1"
        assert "value" not in result
        self.db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_secret_duplicate_raises(self):
        dup_result = MagicMock()
        dup_result.scalar_one_or_none.return_value = _make_row(name="DUP")
        self.db.execute = AsyncMock(return_value=dup_result)

        with pytest.raises(ValueError, match="already exists"):
            await self.svc.create_secret(SecretCreate(name="DUP", value="val"))

    @pytest.mark.asyncio
    async def test_update_secret_success(self):
        row = _make_row(name="KEY")
        self.db.get = AsyncMock(return_value=row)
        self.db.flush = AsyncMock()

        result = await self.svc.update_secret(row.id, SecretUpdate(value="new_value"))
        assert result is not None
        assert row.encrypted_value == "new_value"

    @pytest.mark.asyncio
    async def test_update_secret_not_found(self):
        self.db.get = AsyncMock(return_value=None)
        result = await self.svc.update_secret("no-id", SecretUpdate(value="x"))
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_secret_success(self):
        del_result = MagicMock()
        del_result.rowcount = 1
        self.db.execute = AsyncMock(return_value=del_result)

        assert await self.svc.delete_secret("some-id") is True

    @pytest.mark.asyncio
    async def test_delete_secret_not_found(self):
        del_result = MagicMock()
        del_result.rowcount = 0
        self.db.execute = AsyncMock(return_value=del_result)

        assert await self.svc.delete_secret("nope") is False

    @pytest.mark.asyncio
    async def test_get_secrets_for_workflow(self):
        rows = [
            _make_row(name="WF_KEY", encrypted_value="wf_val", scope="workflow", scope_id="wf1"),
            _make_row(name="GLOBAL_KEY", encrypted_value="global_val", scope="global"),
        ]
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = rows
        self.db.execute = AsyncMock(return_value=result_mock)

        secrets = await self.svc.get_secrets_for_workflow("wf1")
        assert "WF_KEY" in secrets
        assert secrets["WF_KEY"] == "wf_val"
        assert "GLOBAL_KEY" in secrets

    @pytest.mark.asyncio
    async def test_get_secrets_for_project(self):
        rows = [
            _make_row(name="PROJ_KEY", encrypted_value="pv", scope="project", scope_id="p1"),
        ]
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = rows
        self.db.execute = AsyncMock(return_value=result_mock)

        secrets = await self.svc.get_secrets_for_project("p1")
        assert "PROJ_KEY" in secrets
        assert secrets["PROJ_KEY"] == "pv"

    @pytest.mark.asyncio
    async def test_get_secret_found(self):
        row = _make_row(name="KEY")
        self.db.get = AsyncMock(return_value=row)

        result = await self.svc.get_secret(row.id)
        assert result is not None
        assert result["name"] == "KEY"

    @pytest.mark.asyncio
    async def test_get_secret_not_found(self):
        self.db.get = AsyncMock(return_value=None)
        result = await self.svc.get_secret("nope")
        assert result is None
