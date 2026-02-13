"""Workflow secret models."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class SecretScope(str, Enum):
    WORKFLOW = "workflow"
    PROJECT = "project"
    GLOBAL = "global"


class SecretCreate(BaseModel):
    name: str
    value: str
    scope: SecretScope = SecretScope.WORKFLOW
    scope_id: str | None = None  # workflow_id or project_id


class SecretUpdate(BaseModel):
    value: str | None = None
    scope: SecretScope | None = None
    scope_id: str | None = None


class SecretResponse(BaseModel):
    id: str
    name: str
    scope: SecretScope
    scope_id: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    # Note: value is never returned


class SecretListResponse(BaseModel):
    secrets: list[SecretResponse]
    total: int
