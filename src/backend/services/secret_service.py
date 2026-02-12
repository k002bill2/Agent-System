"""Workflow secret management service."""

import uuid
from datetime import datetime
from typing import Any

from models.secret import SecretCreate, SecretScope, SecretUpdate


class SecretService:
    """In-memory secret management with encryption simulation."""

    def __init__(self):
        self._secrets: dict[str, dict[str, Any]] = {}

    def list_secrets(
        self, scope: SecretScope | None = None, scope_id: str | None = None
    ) -> list[dict]:
        """List secrets, optionally filtered by scope."""
        secrets = list(self._secrets.values())
        if scope:
            secrets = [s for s in secrets if s["scope"] == scope]
        if scope_id:
            secrets = [s for s in secrets if s.get("scope_id") == scope_id]
        return [self._to_response(s) for s in secrets]

    def get_secret(self, secret_id: str) -> dict | None:
        """Get a secret by ID (without value)."""
        secret = self._secrets.get(secret_id)
        return self._to_response(secret) if secret else None

    def get_secrets_for_workflow(self, workflow_id: str) -> dict[str, str]:
        """Get all secret name->value pairs applicable to a workflow."""
        result: dict[str, str] = {}
        for s in self._secrets.values():
            if s["scope"] == SecretScope.GLOBAL:
                result[s["name"]] = s["value"]
            elif s["scope"] == SecretScope.WORKFLOW and s.get("scope_id") == workflow_id:
                result[s["name"]] = s["value"]
        return result

    def get_secrets_for_project(self, project_id: str) -> dict[str, str]:
        """Get all secret name->value pairs applicable to a project."""
        result: dict[str, str] = {}
        for s in self._secrets.values():
            if s["scope"] == SecretScope.GLOBAL:
                result[s["name"]] = s["value"]
            elif s["scope"] == SecretScope.PROJECT and s.get("scope_id") == project_id:
                result[s["name"]] = s["value"]
        return result

    def create_secret(self, data: SecretCreate, user_id: str | None = None) -> dict:
        """Create a new secret."""
        # Check for duplicate name within scope
        for s in self._secrets.values():
            if s["name"] == data.name and s["scope"] == data.scope and s.get("scope_id") == data.scope_id:
                raise ValueError(f"Secret '{data.name}' already exists in this scope")

        secret_id = str(uuid.uuid4())
        now = datetime.utcnow()
        secret = {
            "id": secret_id,
            "name": data.name,
            "value": data.value,  # In production: encrypt with Fernet
            "scope": data.scope,
            "scope_id": data.scope_id,
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
        }
        self._secrets[secret_id] = secret
        return self._to_response(secret)

    def update_secret(self, secret_id: str, data: SecretUpdate) -> dict | None:
        """Update a secret."""
        secret = self._secrets.get(secret_id)
        if not secret:
            return None
        if data.value is not None:
            secret["value"] = data.value
        if data.scope is not None:
            secret["scope"] = data.scope
        if data.scope_id is not None:
            secret["scope_id"] = data.scope_id
        secret["updated_at"] = datetime.utcnow()
        return self._to_response(secret)

    def delete_secret(self, secret_id: str) -> bool:
        """Delete a secret."""
        return self._secrets.pop(secret_id, None) is not None

    def _to_response(self, secret: dict) -> dict:
        """Convert to response format (without value)."""
        return {
            "id": secret["id"],
            "name": secret["name"],
            "scope": secret["scope"],
            "scope_id": secret.get("scope_id"),
            "created_by": secret.get("created_by"),
            "created_at": secret["created_at"],
            "updated_at": secret["updated_at"],
        }


# Singleton
_service: SecretService | None = None


def get_secret_service() -> SecretService:
    global _service
    if _service is None:
        _service = SecretService()
    return _service
