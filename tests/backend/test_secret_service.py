"""Tests for secret service."""

import pytest

from models.secret import SecretCreate, SecretScope, SecretUpdate
from services.secret_service import SecretService


class TestSecretService:
    def setup_method(self):
        self.svc = SecretService()

    def test_create_secret(self):
        result = self.svc.create_secret(
            SecretCreate(name="API_KEY", value="secret123", scope=SecretScope.WORKFLOW, scope_id="wf1")
        )
        assert result["name"] == "API_KEY"
        assert "value" not in result  # value should not be in response

    def test_list_secrets(self):
        self.svc.create_secret(SecretCreate(name="A", value="1"))
        self.svc.create_secret(SecretCreate(name="B", value="2"))
        secrets = self.svc.list_secrets()
        assert len(secrets) == 2

    def test_list_secrets_by_scope(self):
        self.svc.create_secret(
            SecretCreate(name="A", value="1", scope=SecretScope.WORKFLOW, scope_id="wf1")
        )
        self.svc.create_secret(
            SecretCreate(name="B", value="2", scope=SecretScope.PROJECT, scope_id="p1")
        )
        wf_secrets = self.svc.list_secrets(scope=SecretScope.WORKFLOW)
        assert len(wf_secrets) == 1
        assert wf_secrets[0]["name"] == "A"

    def test_get_secret(self):
        created = self.svc.create_secret(SecretCreate(name="KEY", value="val"))
        fetched = self.svc.get_secret(created["id"])
        assert fetched is not None
        assert fetched["name"] == "KEY"

    def test_update_secret(self):
        created = self.svc.create_secret(SecretCreate(name="KEY", value="old"))
        updated = self.svc.update_secret(created["id"], SecretUpdate(value="new"))
        assert updated is not None

    def test_delete_secret(self):
        created = self.svc.create_secret(SecretCreate(name="KEY", value="val"))
        assert self.svc.delete_secret(created["id"]) is True
        assert self.svc.get_secret(created["id"]) is None

    def test_delete_nonexistent(self):
        assert self.svc.delete_secret("nope") is False

    def test_get_secrets_for_workflow(self):
        self.svc.create_secret(
            SecretCreate(name="WF_KEY", value="wf_val", scope=SecretScope.WORKFLOW, scope_id="wf1")
        )
        self.svc.create_secret(
            SecretCreate(name="GLOBAL_KEY", value="global_val", scope=SecretScope.GLOBAL)
        )
        self.svc.create_secret(
            SecretCreate(name="OTHER", value="other", scope=SecretScope.WORKFLOW, scope_id="wf2")
        )
        result = self.svc.get_secrets_for_workflow("wf1")
        assert "WF_KEY" in result
        assert "GLOBAL_KEY" in result
        assert "OTHER" not in result

    def test_duplicate_name_raises(self):
        self.svc.create_secret(SecretCreate(name="DUP", value="1"))
        with pytest.raises(ValueError, match="already exists"):
            self.svc.create_secret(SecretCreate(name="DUP", value="2"))

    def test_get_secrets_for_project(self):
        self.svc.create_secret(
            SecretCreate(name="PROJ_KEY", value="pv", scope=SecretScope.PROJECT, scope_id="p1")
        )
        result = self.svc.get_secrets_for_project("p1")
        assert "PROJ_KEY" in result
