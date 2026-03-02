"""Workflow secret management service — DB-backed with AES-256-GCM encryption."""

import uuid

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import WorkflowSecretModel
from models.secret import SecretCreate, SecretScope, SecretUpdate
from utils.time import utcnow


class SecretService:
    """Database-backed secret management.

    Encryption is handled transparently by the ``EncryptedString`` column type
    (AES-256-GCM via ``KeyManager``).  This service only deals with CRUD and
    scope-based filtering.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── List / Read ───────────────────────────────────────────

    async def list_secrets(
        self,
        scope: SecretScope | None = None,
        scope_id: str | None = None,
    ) -> list[dict]:
        """List secrets (values are never returned)."""
        stmt = select(WorkflowSecretModel)
        if scope is not None:
            stmt = stmt.where(WorkflowSecretModel.scope == scope.value)
        if scope_id is not None:
            stmt = stmt.where(WorkflowSecretModel.scope_id == scope_id)
        stmt = stmt.order_by(WorkflowSecretModel.created_at.desc())

        result = await self._db.execute(stmt)
        return [self._to_response(row) for row in result.scalars().all()]

    async def get_secret(self, secret_id: str) -> dict | None:
        """Get a single secret metadata (without value)."""
        row = await self._db.get(WorkflowSecretModel, secret_id)
        return self._to_response(row) if row else None

    async def get_secrets_for_workflow(self, workflow_id: str) -> dict[str, str]:
        """Return name→decrypted-value pairs applicable to a workflow.

        Includes global secrets + workflow-scoped secrets for *workflow_id*.
        """
        stmt = select(WorkflowSecretModel).where(
            (WorkflowSecretModel.scope == SecretScope.GLOBAL.value)
            | (
                and_(
                    WorkflowSecretModel.scope == SecretScope.WORKFLOW.value,
                    WorkflowSecretModel.scope_id == workflow_id,
                )
            )
        )
        result = await self._db.execute(stmt)
        return {row.name: row.encrypted_value for row in result.scalars().all()}

    async def get_secrets_for_project(self, project_id: str) -> dict[str, str]:
        """Return name→decrypted-value pairs applicable to a project.

        Includes global secrets + project-scoped secrets for *project_id*.
        """
        stmt = select(WorkflowSecretModel).where(
            (WorkflowSecretModel.scope == SecretScope.GLOBAL.value)
            | (
                and_(
                    WorkflowSecretModel.scope == SecretScope.PROJECT.value,
                    WorkflowSecretModel.scope_id == project_id,
                )
            )
        )
        result = await self._db.execute(stmt)
        return {row.name: row.encrypted_value for row in result.scalars().all()}

    # ── Create ────────────────────────────────────────────────

    async def create_secret(self, data: SecretCreate, user_id: str | None = None) -> dict:
        """Create a new secret (value is encrypted by EncryptedString)."""
        # Duplicate check
        existing = await self._db.execute(
            select(WorkflowSecretModel).where(
                and_(
                    WorkflowSecretModel.name == data.name,
                    WorkflowSecretModel.scope == data.scope.value,
                    WorkflowSecretModel.scope_id == data.scope_id,
                )
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Secret '{data.name}' already exists in this scope")

        now = utcnow()
        row = WorkflowSecretModel(
            id=str(uuid.uuid4()),
            name=data.name,
            encrypted_value=data.value,  # EncryptedString encrypts on bind
            scope=data.scope.value,
            scope_id=data.scope_id,
            created_by=user_id,
            created_at=now,
            updated_at=now,
        )
        self._db.add(row)
        await self._db.flush()
        return self._to_response(row)

    # ── Update ────────────────────────────────────────────────

    async def update_secret(self, secret_id: str, data: SecretUpdate) -> dict | None:
        """Update a secret's value / scope."""
        row = await self._db.get(WorkflowSecretModel, secret_id)
        if not row:
            return None
        if data.value is not None:
            row.encrypted_value = data.value
        if data.scope is not None:
            row.scope = data.scope.value
        if data.scope_id is not None:
            row.scope_id = data.scope_id
        row.updated_at = utcnow()
        await self._db.flush()
        return self._to_response(row)

    # ── Delete ────────────────────────────────────────────────

    async def delete_secret(self, secret_id: str) -> bool:
        """Delete a secret by ID."""
        result = await self._db.execute(
            delete(WorkflowSecretModel).where(WorkflowSecretModel.id == secret_id)
        )
        return result.rowcount > 0  # type: ignore[union-attr]

    # ── Helpers ───────────────────────────────────────────────

    @staticmethod
    def _to_response(row: WorkflowSecretModel) -> dict:
        """Convert a DB row to a response dict (value excluded)."""
        return {
            "id": row.id,
            "name": row.name,
            "scope": row.scope,
            "scope_id": row.scope_id,
            "created_by": row.created_by,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
