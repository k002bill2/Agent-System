"""동적 MCP 도구는 위험도 판정에서 fail-closed 여야 한다.

`orchestrator/tools.py:create_mcp_tool` 은 MCP 서버의 도구를
`mcp_<server_id>_<tool_name>` 이름으로 런타임에 만들어 executor 에 넘긴다.
이 이름들은 `TOOL_RISK_CONFIG` 에 존재할 수 없다(서버가 붙어야 알 수 있다).

그런데 `get_tool_risk` 는 미등록 이름에 `DEFAULT_RISK`(LOW, 승인 불필요)를
돌려준다 — 즉 외부 MCP 서버가 노출한 임의의 도구가 **HITL 승인 없이** 실행된다.
경계는 "모르는 MCP 도구 = HIGH + 승인 필요"다.

기존 명시 정책(execute_bash / write_file / edit_file / 비-MCP 미등록 도구)은
그대로 유지돼야 한다 — 이 파일이 그 회귀도 함께 잠근다.
"""

from unittest.mock import MagicMock

import pytest

from models.hitl import (
    DEFAULT_RISK,
    TOOL_RISK_CONFIG,
    RiskLevel,
    assess_operation_risk,
    get_tool_risk,
    is_approval_required,
)
from orchestrator.nodes.executor import ExecutorNode

# create_mcp_tool 이 실제로 만들어내는 이름 형태들.
# server_id 에 밑줄이 들어가는 경우(claude_ai_Figma)와 tool 이름에 밑줄이
# 들어가는 경우 모두 실재하므로, 세그먼트 개수로 판정하면 새어 나간다.
DYNAMIC_MCP_TOOL_NAMES = (
    "mcp_github_create_issue",
    "mcp_filesystem_write_file",
    "mcp_claude_ai_Figma_create_new_file",
    "mcp_tavily_search",
    # 밑줄이 하나뿐인 형태도 MCP 표면이므로 함께 닫는다.
    # (`TOOL_PERMISSION_MAP` 의 mcp_call 이 여기 해당 — 의도적 확대)
    "mcp_call",
)


@pytest.mark.parametrize("tool_name", DYNAMIC_MCP_TOOL_NAMES)
def test_dynamic_mcp_tool_is_high_risk(tool_name):
    """미등록 MCP 도구는 HIGH 로 판정된다."""
    risk = get_tool_risk(tool_name)

    assert risk.risk_level is RiskLevel.HIGH, f"{tool_name} 가 {risk.risk_level} 로 샜다"
    assert risk.requires_approval is True


@pytest.mark.parametrize("tool_name", DYNAMIC_MCP_TOOL_NAMES)
def test_dynamic_mcp_tool_requires_approval(tool_name):
    """인자 내용과 무관하게 승인이 필요하다 (패턴 매칭에 기대지 않는다)."""
    risk_level, requires_approval, _ = assess_operation_risk(tool_name, {"arguments": {}})

    assert risk_level is RiskLevel.HIGH
    assert requires_approval is True
    assert is_approval_required(tool_name, {"arguments": {}}) is True


def test_executor_creates_high_risk_approval_request_for_mcp_tool():
    """executor 경로가 실제로 PENDING 승인 요청을 만든다 (계약의 종착점)."""
    node = ExecutorNode(llm=MagicMock(), tools=[])

    requires_approval, request = node._check_approval_required(
        tool_name="mcp_github_create_issue",
        tool_args={"arguments": {"title": "hello"}},
        task_id="task-1",
        session_id="session-1",
    )

    assert requires_approval is True
    assert request is not None
    assert request["risk_level"] == RiskLevel.HIGH.value
    assert request["tool_name"] == "mcp_github_create_issue"
    assert request["status"] == "pending"


def test_default_risk_singleton_is_not_mutated():
    """MCP 판정이 모듈 싱글턴 DEFAULT_RISK 를 오염시키지 않는다."""
    get_tool_risk("mcp_github_create_issue")

    assert DEFAULT_RISK.risk_level is RiskLevel.LOW
    assert DEFAULT_RISK.requires_approval is False
    assert DEFAULT_RISK.tool_name == "unknown"


@pytest.mark.parametrize("tool_name", ("read_file", "list_directory", "totally_unknown_tool"))
def test_non_mcp_unknown_tools_keep_default_policy(tool_name):
    """비-MCP 미등록 도구의 기존 동작은 바뀌지 않는다."""
    risk = get_tool_risk(tool_name)

    assert risk.risk_level is RiskLevel.LOW
    assert risk.requires_approval is False


@pytest.mark.parametrize("tool_name", sorted(TOOL_RISK_CONFIG))
def test_explicitly_configured_tools_keep_exact_policy(tool_name):
    """명시 등록된 도구는 등록된 설정 객체를 그대로 돌려준다."""
    assert get_tool_risk(tool_name) is TOOL_RISK_CONFIG[tool_name]


def test_execute_bash_policy_unchanged():
    """execute_bash 의 기존 판정(HIGH + 승인)은 그대로다."""
    risk_level, requires_approval, _ = assess_operation_risk("execute_bash", {"command": "ls -la"})

    assert risk_level is RiskLevel.HIGH
    assert requires_approval is True


def test_write_file_policy_unchanged():
    """write_file 은 평범한 경로면 MEDIUM·승인 불필요, .env 면 HIGH·승인 필요."""
    plain_level, plain_approval, _ = assess_operation_risk("write_file", {"path": "/tmp/notes.txt"})
    assert plain_level is RiskLevel.MEDIUM
    assert plain_approval is False

    env_level, env_approval, _ = assess_operation_risk("write_file", {"path": "/app/.env"})
    assert env_level is RiskLevel.HIGH
    assert env_approval is True
