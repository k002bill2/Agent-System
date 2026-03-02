"""Config version models for version control."""

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from utils.time import utcnow


class ConfigType(str, Enum):
    """Type of configuration being versioned."""

    AGENT = "agent"
    SESSION = "session"
    PROJECT = "project"
    WORKFLOW = "workflow"
    PERMISSION = "permission"
    NOTIFICATION_RULE = "notification_rule"
    LLM_ROUTER = "llm_router"


class VersionStatus(str, Enum):
    """Status of a config version."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    ROLLED_BACK = "rolled_back"


class ConfigVersion(BaseModel):
    """A versioned configuration snapshot."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    config_type: ConfigType
    config_id: str  # ID of the config being versioned
    version: int = 1
    label: str | None = None  # Optional human-readable label (e.g., "v1.2-stable")
    description: str | None = None
    status: VersionStatus = VersionStatus.ACTIVE
    # The actual config data
    data: dict[str, Any] = {}
    # Change tracking
    changes_summary: str | None = None  # Human-readable summary of changes
    diff_from_previous: dict[str, Any] | None = None  # JSON diff
    # Metadata
    created_by: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    # Rollback tracking
    rolled_back_from: str | None = None  # Version ID this was rolled back from
    rolled_back_at: datetime | None = None


class ConfigVersionCreate(BaseModel):
    """Request to create a new config version."""

    config_type: ConfigType
    config_id: str
    data: dict[str, Any]
    label: str | None = None
    description: str | None = None
    created_by: str | None = None


class ConfigVersionCompare(BaseModel):
    """Result of comparing two config versions."""

    version_a: ConfigVersion
    version_b: ConfigVersion
    diff: dict[str, Any]  # JSON diff
    added_keys: list[str] = []
    removed_keys: list[str] = []
    modified_keys: list[str] = []
    is_identical: bool = False


class ConfigVersionHistory(BaseModel):
    """History of versions for a config."""

    config_type: ConfigType
    config_id: str
    versions: list[ConfigVersion] = []
    current_version: int = 0
    total_versions: int = 0


class RollbackRequest(BaseModel):
    """Request to rollback to a specific version."""

    target_version_id: str
    reason: str | None = None
    created_by: str | None = None


class RollbackResult(BaseModel):
    """Result of a rollback operation."""

    success: bool
    new_version: ConfigVersion | None = None
    message: str = ""
    rolled_back_from_version: int = 0
    rolled_back_to_version: int = 0


class ConfigVersionStats(BaseModel):
    """Statistics about config versions."""

    total_versions: int = 0
    versions_by_type: dict[str, int] = {}
    versions_by_status: dict[str, int] = {}
    recent_versions: list[ConfigVersion] = []
    most_versioned_configs: list[dict[str, Any]] = []
