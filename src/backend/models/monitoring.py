"""Monitoring models for project health checks."""

from datetime import datetime

from utils.time import utcnow
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class CheckType(str, Enum):
    """Types of project checks."""

    TEST = "test"
    LINT = "lint"
    TYPECHECK = "typecheck"
    BUILD = "build"


class CheckStatus(str, Enum):
    """Status of a check."""

    IDLE = "idle"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"


class CheckResult(BaseModel):
    """Result of a single check."""

    check_type: CheckType
    status: CheckStatus = CheckStatus.IDLE
    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = ConfigDict(use_enum_values=True)


class ProjectHealth(BaseModel):
    """Overall project health status."""

    project_id: str
    project_name: str
    project_path: str
    checks: dict[CheckType, CheckResult] = Field(default_factory=dict)
    last_updated: datetime = Field(default_factory=utcnow)

    def get_check(self, check_type: CheckType) -> CheckResult:
        """Get or create a check result."""
        if check_type not in self.checks:
            self.checks[check_type] = CheckResult(check_type=check_type)
        return self.checks[check_type]

    def update_check(self, result: CheckResult) -> None:
        """Update a check result."""
        self.checks[result.check_type] = result
        self.last_updated = utcnow()


class CheckStartedPayload(BaseModel):
    """Payload when a check starts."""

    project_id: str
    check_type: CheckType
    started_at: datetime


class CheckProgressPayload(BaseModel):
    """Payload for check progress (streaming output)."""

    project_id: str
    check_type: CheckType
    output: str
    is_stderr: bool = False


class CheckCompletedPayload(BaseModel):
    """Payload when a check completes."""

    project_id: str
    check_type: CheckType
    status: CheckStatus
    exit_code: int
    duration_ms: int
    stdout: str
    stderr: str
