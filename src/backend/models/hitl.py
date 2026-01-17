"""Human-in-the-Loop (HITL) approval system models."""

import re
from enum import Enum
from typing import Any, Literal
from datetime import datetime
from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    """Risk level for operations."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ApprovalStatus(str, Enum):
    """Status of an approval request."""
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    EXPIRED = "expired"


class OperationRisk(BaseModel):
    """Risk assessment for an operation."""

    tool_name: str
    risk_level: RiskLevel
    requires_approval: bool
    description: str
    patterns: list[str] = Field(default_factory=list)  # Regex patterns that trigger this risk


class ApprovalRequest(BaseModel):
    """A request for user approval."""

    id: str
    session_id: str
    task_id: str
    tool_name: str
    tool_args: dict[str, Any]
    risk_level: RiskLevel
    risk_description: str
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: datetime | None = None
    resolver_note: str | None = None


class ApprovalResponse(BaseModel):
    """Response to an approval request."""

    approved: bool
    note: str | None = None


# ─────────────────────────────────────────────────────────────
# Risk Registry
# ─────────────────────────────────────────────────────────────

# Tool-specific risk configurations
TOOL_RISK_CONFIG: dict[str, OperationRisk] = {
    "execute_bash": OperationRisk(
        tool_name="execute_bash",
        risk_level=RiskLevel.HIGH,
        requires_approval=True,
        description="Shell command execution can modify system state",
        patterns=[
            r"rm\s+(-rf?|--recursive)",  # Recursive delete
            r"sudo\s+",                   # Sudo commands
            r"chmod\s+",                  # Permission changes
            r"chown\s+",                  # Ownership changes
            r"mkfs\.",                    # Filesystem creation
            r"dd\s+if=",                  # Disk operations
            r">\s*/dev/",                 # Device writes
            r"curl.*\|\s*(ba)?sh",        # Pipe to shell
            r"wget.*\|\s*(ba)?sh",        # Pipe to shell
            r"npm\s+publish",             # Package publish
            r"git\s+push\s+.*--force",    # Force push
            r"docker\s+rm",               # Docker remove
            r"kubectl\s+delete",          # K8s delete
        ],
    ),
    "write_file": OperationRisk(
        tool_name="write_file",
        risk_level=RiskLevel.MEDIUM,
        requires_approval=False,  # Default: no approval needed
        description="File creation/overwrite",
        patterns=[
            r"\.env",           # Environment files
            r"\.ssh/",          # SSH config
            r"/etc/",           # System config
            r"\.bashrc",        # Shell config
            r"\.zshrc",         # Shell config
            r"credentials",     # Credential files
            r"password",        # Password files
            r"secret",          # Secret files
        ],
    ),
    "edit_file": OperationRisk(
        tool_name="edit_file",
        risk_level=RiskLevel.LOW,
        requires_approval=False,
        description="File modification",
        patterns=[
            r"\.env",           # Environment files
            r"\.ssh/",          # SSH config
            r"/etc/",           # System config
        ],
    ),
}

# Default risk for unknown tools
DEFAULT_RISK = OperationRisk(
    tool_name="unknown",
    risk_level=RiskLevel.LOW,
    requires_approval=False,
    description="Unknown operation",
)


def get_tool_risk(tool_name: str) -> OperationRisk:
    """Get risk configuration for a tool."""
    return TOOL_RISK_CONFIG.get(tool_name, DEFAULT_RISK)


def assess_operation_risk(
    tool_name: str,
    tool_args: dict[str, Any],
) -> tuple[RiskLevel, bool, str]:
    """
    Assess the risk of an operation and determine if approval is needed.

    Returns:
        Tuple of (risk_level, requires_approval, risk_description)
    """
    risk_config = get_tool_risk(tool_name)

    # Start with base configuration
    risk_level = risk_config.risk_level
    requires_approval = risk_config.requires_approval
    risk_description = risk_config.description

    # Check if any patterns match the arguments
    matched_patterns = []
    args_str = str(tool_args).lower()

    # Special handling for bash commands
    if tool_name == "execute_bash":
        command = tool_args.get("command", "")
        args_str = command.lower()

    # Special handling for file operations
    elif tool_name in ("write_file", "edit_file"):
        file_path = tool_args.get("path", tool_args.get("file_path", ""))
        args_str = file_path.lower()

    for pattern in risk_config.patterns:
        if re.search(pattern, args_str, re.IGNORECASE):
            matched_patterns.append(pattern)

    # Elevate risk if dangerous patterns matched
    if matched_patterns:
        if risk_level == RiskLevel.LOW:
            risk_level = RiskLevel.MEDIUM
        elif risk_level == RiskLevel.MEDIUM:
            risk_level = RiskLevel.HIGH

        requires_approval = True
        risk_description = f"{risk_config.description} - Matched dangerous patterns: {matched_patterns}"

    return risk_level, requires_approval, risk_description


def is_approval_required(tool_name: str, tool_args: dict[str, Any]) -> bool:
    """Quick check if approval is required for an operation."""
    _, requires_approval, _ = assess_operation_risk(tool_name, tool_args)
    return requires_approval
