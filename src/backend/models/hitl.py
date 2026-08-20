"""Human-in-the-Loop (HITL) approval system models."""

import re
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from models.agent_state import TaskNode, TaskStatus
from utils.locks import LoopBoundLockPool
from utils.time import utcnow

# 승인 상태를 바꾸는 **모든** 경로가 공유하는 락:
# REST·WebSocket 전이(`api/hitl.py`)와 executor 의 소비(`nodes/executor.py`).
#
# 두 경로 모두 세션 JSON 전체를 덮어쓰며 저장한다. 직렬화하지 않으면 늦게 도착한
# 낡은 스냅샷이 다른 전이를 되돌린다 — 병렬 배치(`execute_batch`)에서 승인된
# 위험 task 가 둘 이상이면 실제로 겹친다.
#
# 락 안에서 그래프를 돌리지 말 것(교착) — 승인 API 는 저장까지만 잡고 놓은 뒤
# `engine.run` 을 호출하며, 그 안에서 executor 가 같은 락을 다시 잡는다.
APPROVAL_STATE_LOCK = LoopBoundLockPool()


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
    # 승인이 실제 도구 호출에 쓰였음. executor 가 도구 실행 **전에** 전이·영속화하며,
    # 이 상태가 되면 같은 승인으로는 다시 실행할 수 없다(1회용 보장의 정본).
    CONSUMED = "consumed"


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
    created_at: datetime = Field(default_factory=utcnow)
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
            r"sudo\s+",  # Sudo commands
            r"chmod\s+",  # Permission changes
            r"chown\s+",  # Ownership changes
            r"mkfs\.",  # Filesystem creation
            r"dd\s+if=",  # Disk operations
            r">\s*/dev/",  # Device writes
            r"curl.*\|\s*(ba)?sh",  # Pipe to shell
            r"wget.*\|\s*(ba)?sh",  # Pipe to shell
            r"npm\s+publish",  # Package publish
            r"git\s+push\s+.*--force",  # Force push
            r"docker\s+rm",  # Docker remove
            r"kubectl\s+delete",  # K8s delete
        ],
    ),
    "write_file": OperationRisk(
        tool_name="write_file",
        risk_level=RiskLevel.MEDIUM,
        requires_approval=False,  # Default: no approval needed
        description="File creation/overwrite",
        patterns=[
            r"\.env",  # Environment files
            r"\.ssh/",  # SSH config
            r"/etc/",  # System config
            r"\.bashrc",  # Shell config
            r"\.zshrc",  # Shell config
            r"credentials",  # Credential files
            r"password",  # Password files
            r"secret",  # Secret files
        ],
    ),
    "edit_file": OperationRisk(
        tool_name="edit_file",
        risk_level=RiskLevel.LOW,
        requires_approval=False,
        description="File modification",
        patterns=[
            r"\.env",  # Environment files
            r"\.ssh/",  # SSH config
            r"/etc/",  # System config
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


def is_task_resumable_after_approval(
    task: TaskNode,
    pending_approvals: dict[str, Any],
) -> bool:
    """승인이 완료돼 실행을 재개해야 하는 승인 대기 task 인가.

    승인 대기 task 는 `TaskStatus.WAITING` 이라 PENDING 만 보는 스케줄러에서
    누락된다. 승인 후 그래프를 다시 돌려도 executor 로 돌아가지 못하는 원인이다.

    `APPROVED` 일 때만 True 다 — "PENDING 이 아님"이 아니라 "APPROVED 임"으로
    판정한다. DENIED/EXPIRED/PENDING, 승인 레코드 부재, `pending_approval_id`
    부재는 모두 False.
    """
    if task.status != TaskStatus.WAITING or not task.pending_approval_id:
        return False

    approval = pending_approvals.get(task.pending_approval_id)
    if not approval:
        return False

    return bool(approval.get("status") == ApprovalStatus.APPROVED.value)


ORPHANED_APPROVAL_ERROR = "승인이 이미 소비됐다 — 실행 결과를 알 수 없어 재승인이 필요하다"


def is_task_orphaned_by_consumed_approval(
    task: TaskNode,
    pending_approvals: dict[str, Any],
) -> bool:
    """소비된 승인에 매달린 채 남은 task 인가.

    승인 소비는 도구 실행 **전에** 영속화되므로, 실행 도중 프로세스가 죽으면
    `consumed` 승인 + 실행 중(IN_PROGRESS)이거나 대기 중(WAITING)인 task 가
    남는다. 도구가 실제로 부수효과를 냈는지는 알 수 없다 — 자동 재개는
    금지이고(비가역 작업 중복 실행), 그렇다고 조용히 멈추면 세션이 영영
    끝나지 않는다. 스케줄러는 이 판정으로 잔재를 실패로 드러낸다.
    """
    if task.status not in (TaskStatus.IN_PROGRESS, TaskStatus.WAITING):
        return False

    if not task.pending_approval_id:
        return False

    approval = pending_approvals.get(task.pending_approval_id)
    if not approval:
        return False

    return bool(approval.get("status") == ApprovalStatus.CONSUMED.value)


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
        risk_description = (
            f"{risk_config.description} - Matched dangerous patterns: {matched_patterns}"
        )

    return risk_level, requires_approval, risk_description


def is_approval_required(tool_name: str, tool_args: dict[str, Any]) -> bool:
    """Quick check if approval is required for an operation."""
    _, requires_approval, _ = assess_operation_risk(tool_name, tool_args)
    return requires_approval
