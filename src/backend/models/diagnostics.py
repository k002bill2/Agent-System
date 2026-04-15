"""Project environment diagnostic models."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from utils.time import utcnow


class DiagnosticStatus(str, Enum):
    """Diagnostic check status."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class DiagnosticCategory(str, Enum):
    """Diagnostic category types."""

    WORKSPACE = "workspace"
    MCP = "mcp"
    GIT = "git"
    QUOTA = "quota"


class DiagnosticCheck(BaseModel):
    """Single diagnostic check result."""

    name: str
    status: DiagnosticStatus
    message: str = ""
    details: dict[str, Any] = Field(default_factory=dict)
    fixable: bool = False
    fix_action: str | None = None


class CategoryResult(BaseModel):
    """Aggregated result for a diagnostic category."""

    category: DiagnosticCategory
    status: DiagnosticStatus
    checks: list[DiagnosticCheck] = Field(default_factory=list)

    @property
    def healthy_count(self) -> int:
        return sum(1 for c in self.checks if c.status == DiagnosticStatus.HEALTHY)

    @property
    def total_count(self) -> int:
        return len(self.checks)


class ProjectDiagnostics(BaseModel):
    """Full diagnostic result for a project."""

    project_id: str
    project_name: str
    overall_status: DiagnosticStatus
    categories: dict[str, CategoryResult] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=utcnow)


class FixRequest(BaseModel):
    """Request to execute a self-healing fix action."""

    fix_action: str
    params: dict[str, Any] = Field(default_factory=dict)


class FixResult(BaseModel):
    """Result of a self-healing fix action."""

    fix_action: str
    success: bool
    message: str
    diagnostics: ProjectDiagnostics | None = None
