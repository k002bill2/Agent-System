"""Schemas for CLI-first LLM access profiles and entitlements."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LLMCLIProfileBase(BaseModel):
    """Shared CLI profile fields."""

    provider: str = Field(default="codex_cli", min_length=1, max_length=50)
    profile_name: str = Field(min_length=1, max_length=255)
    command: str = Field(default="codex", min_length=1, max_length=255)
    args_json: list[str] = Field(default_factory=list)
    working_directory: str | None = Field(default=None, max_length=1024)
    auth_status: str = Field(default="unknown", max_length=50)
    metadata: dict = Field(default_factory=dict)


class LLMCLIProfileCreate(LLMCLIProfileBase):
    """Create a CLI profile for a user or organization."""

    owner_user_id: str | None = None
    organization_id: str | None = None


class LLMCLIProfileUpdate(BaseModel):
    """Patchable CLI profile fields."""

    provider: str | None = Field(default=None, min_length=1, max_length=50)
    profile_name: str | None = Field(default=None, min_length=1, max_length=255)
    command: str | None = Field(default=None, min_length=1, max_length=255)
    args_json: list[str] | None = None
    working_directory: str | None = Field(default=None, max_length=1024)
    auth_status: str | None = Field(default=None, max_length=50)
    metadata: dict | None = None


class LLMCLIProfileResponse(LLMCLIProfileBase):
    """Public CLI profile response."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_user_id: str | None = None
    organization_id: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class LLMEntitlementBase(BaseModel):
    """Shared entitlement fields."""

    user_id: str = Field(min_length=1, max_length=255)
    organization_id: str | None = None
    provider: str = Field(default="codex_cli", min_length=1, max_length=50)
    mode: str = Field(default="cli", min_length=1, max_length=20)
    source_scope: str = Field(default="all", min_length=1, max_length=100)
    enabled: bool = True
    cli_profile_id: str | None = None
    allow_api_fallback: bool = False
    quota_policy_id: str | None = None


class LLMEntitlementCreate(LLMEntitlementBase):
    """Create a user/org LLM entitlement."""


class LLMEntitlementUpdate(BaseModel):
    """Patchable entitlement fields."""

    organization_id: str | None = None
    provider: str | None = Field(default=None, min_length=1, max_length=50)
    mode: str | None = Field(default=None, min_length=1, max_length=20)
    source_scope: str | None = Field(default=None, min_length=1, max_length=100)
    enabled: bool | None = None
    cli_profile_id: str | None = None
    allow_api_fallback: bool | None = None
    quota_policy_id: str | None = None


class LLMEntitlementResponse(LLMEntitlementBase):
    """Public entitlement response."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime
    updated_at: datetime | None = None


class LLMAccessResponse(BaseModel):
    """Current LLM access state for a user."""

    user_id: str
    api_fallback_enabled: bool
    profiles: list[LLMCLIProfileResponse] = Field(default_factory=list)
    entitlements: list[LLMEntitlementResponse] = Field(default_factory=list)


class LLMCLIProfileHealthCheckResponse(BaseModel):
    """Result of a short CLI profile health probe."""

    profile: LLMCLIProfileResponse
    auth_status: str
    command_found: bool
    exit_code: int | None = None
    latency_ms: int
    message: str
    checked_at: datetime
