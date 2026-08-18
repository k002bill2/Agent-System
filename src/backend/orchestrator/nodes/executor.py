"""ExecutorNode — 태스크 실행·HITL 승인 체크·MCP 도구 통합.

MCP 는 optional 의존이다(위 planner 의 RAG 와 같은 구조·같은 주의).

테스트는 이 모듈 경로로 패치한다:
`orchestrator.nodes.executor.audit_task_status_change` ·
`orchestrator.nodes.executor.AuditService.log`.
"""

import json
import uuid
from typing import Any, cast

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool

from models.agent_state import AgentInfo, AgentRole, AgentState, TaskStatus
from models.hitl import ApprovalStatus, assess_operation_risk
from models.llm_usage import LLMUsageSource
from services.audit_service import (
    AuditAction,
    AuditService,
    ResourceType,
    audit_task_status_change,
    audit_tool_executed,
)
from utils.time import utcnow

from .base import BaseNode

try:
    from orchestrator.tools import MCPToolExecutor

    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False
    MCPToolExecutor = None


class ExecutorNode(BaseNode):
    """
    Executor node for task execution.

    Responsibilities:
    - Execute specific tasks
    - Use tools as needed
    - Report progress and results
    """

    SYSTEM_PROMPT = """You are the Executor agent in a multi-agent system.

Your role is to:
1. Execute the assigned task using the available tools
2. Choose the most appropriate tool for each step
3. Report results and any issues

Available tools:
- read_file: Read file contents
- write_file: Write content to a file
- edit_file: Replace a string in a file
- list_directory: List directory contents
- search_files: Search for files using glob patterns
- search_content: Search file contents using regex
- execute_bash: Execute shell commands
- run_tests: Run tests (pytest/jest)
- run_lint: Run linter
- run_typecheck: Run type checker

When you need to perform an action, use the appropriate tool.
Think step by step and use tools as needed to complete the task.
After completing all necessary tool calls, provide a final summary."""

    def __init__(self, llm: BaseChatModel | None = None, tools: list[BaseTool] | None = None):
        """Initialize ExecutorNode with LLM and tools."""
        super().__init__(llm)
        self.tools = tools or []
        self._tools_by_name = {tool.name: tool for tool in self.tools}

        # MCP Tool Executor 초기화
        self._mcp_executor: MCPToolExecutor | None = None
        if MCP_AVAILABLE and MCPToolExecutor:
            self._mcp_executor = MCPToolExecutor()

        # Bind tools to LLM if available
        if self.llm and self.tools:
            self.llm_with_tools = self.llm.bind_tools(self.tools)
        else:
            self.llm_with_tools = self.llm

    async def _execute_tool(
        self,
        tool_name: str,
        tool_args: dict,
        usage_context: dict[str, Any] | None = None,
    ) -> str:
        """
        Execute a tool and return the result.

        MCP 도구를 우선적으로 찾아 실행하고, 없으면 기본 도구를 실행합니다.
        """
        # 1. MCP 도구 먼저 확인
        if self._mcp_executor:
            await self._mcp_executor.initialize()
            mcp_tool = self._mcp_executor.find_mcp_tool(tool_name)

            if mcp_tool:
                result = await self._mcp_executor.execute(tool_name, tool_args)
                if result.success:
                    # content를 문자열로 변환
                    if result.content:
                        texts = []
                        for item in result.content:
                            if isinstance(item, dict) and item.get("type") == "text":
                                texts.append(item.get("text", ""))
                            elif isinstance(item, dict):
                                texts.append(json.dumps(item, ensure_ascii=False))
                            else:
                                texts.append(str(item))
                        return "\n".join(texts)
                    return "MCP tool executed successfully (no content)"
                else:
                    return f"MCP Error: {result.error}"

        # 2. 기본 도구 실행
        if tool_name not in self._tools_by_name:
            return f"Error: Unknown tool '{tool_name}'"

        tool = self._tools_by_name[tool_name]
        try:
            if tool_name == "warp_agent_run":
                from tools.warp_tools import _warp_agent_run_impl

                timeout = int(tool_args.get("timeout") or 300)
                return _warp_agent_run_impl(
                    prompt=tool_args.get("prompt", ""),
                    cwd=tool_args.get("cwd"),
                    model=tool_args.get("model"),
                    timeout=timeout,
                    usage_context=usage_context,
                )
            if tool_name == "warp_agent_with_mcp":
                from tools.warp_tools import _warp_agent_with_mcp_impl

                timeout = int(tool_args.get("timeout") or 300)
                return _warp_agent_with_mcp_impl(
                    prompt=tool_args.get("prompt", ""),
                    mcp_config=tool_args.get("mcp_config") or {},
                    cwd=tool_args.get("cwd"),
                    timeout=timeout,
                    usage_context=usage_context,
                )

            # Handle both sync and async tools
            result = await tool.ainvoke(tool_args)
            return str(result)
        except Exception as e:
            return f"Error executing {tool_name}: {str(e)}"

    def _check_approval_required(
        self,
        tool_name: str,
        tool_args: dict,
        task_id: str,
        session_id: str,
    ) -> tuple[bool, dict | None]:
        """
        Check if a tool call requires user approval.

        Returns:
            Tuple of (requires_approval, approval_request_dict)
        """
        risk_level, requires_approval, risk_description = assess_operation_risk(
            tool_name, tool_args
        )

        if not requires_approval:
            return False, None

        # Create approval request
        approval_id = str(uuid.uuid4())
        approval_request = {
            "id": approval_id,
            "session_id": session_id,
            "task_id": task_id,
            "tool_name": tool_name,
            "tool_args": tool_args,
            "risk_level": risk_level.value,
            "risk_description": risk_description,
            "status": ApprovalStatus.PENDING.value,
            "created_at": utcnow().isoformat(),
        }

        return True, approval_request

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Run executor logic with tool calling and HITL support."""
        current_task_id = state.get("current_task_id")
        tasks = state.get("tasks", {})
        session_id = state.get("session_id", "")
        project_id = state.get("project", {}).get("id")

        if not current_task_id or current_task_id not in tasks:
            return {
                "last_error": "No valid task to execute",
            }

        task = tasks[current_task_id]

        # Check if waiting for approval
        if state.get("waiting_for_approval") and task.pending_approval_id:
            pending_approvals = state.get("pending_approvals", {})
            approval = pending_approvals.get(task.pending_approval_id)

            if approval:
                if approval.get("status") == ApprovalStatus.PENDING.value:
                    # Still waiting - don't proceed
                    return {
                        "tasks": {current_task_id: task},
                        "waiting_for_approval": True,
                    }
                elif approval.get("status") == ApprovalStatus.DENIED.value:
                    # Denied - fail the task
                    task.status = TaskStatus.FAILED
                    task.error = f"Operation denied by user: {approval.get('resolver_note', 'No reason provided')}"
                    task.pending_approval_id = None
                    task.updated_at = utcnow()

                    return {
                        "tasks": {current_task_id: task},
                        "waiting_for_approval": False,
                        "messages": [self._create_message("system", f"Task denied: {task.error}")],
                    }
                # Approved - continue execution (will be handled below)

        # Mark task as in progress
        task.status = TaskStatus.IN_PROGRESS
        task.updated_at = utcnow()

        # Create/update agent for this task
        agent_id = f"executor-{current_task_id[:8]}"
        agents = state.get("agents", {})
        agents[agent_id] = AgentInfo(
            id=agent_id,
            role=AgentRole.EXECUTOR,
            name=f"Executor #{len(agents) + 1}",
            status=TaskStatus.IN_PROGRESS,
            current_task=current_task_id,
            capabilities=["read_file", "write_file", "execute_bash", "list_directory"],
        )

        # Audit: Log agent assignment
        AuditService.log(
            action=AuditAction.AGENT_ASSIGNED,
            resource_type=ResourceType.AGENT,
            resource_id=agent_id,
            session_id=session_id,
            project_id=project_id,
            agent_id=agent_id,
            metadata={"task_id": current_task_id, "role": AgentRole.EXECUTOR.value},
        )

        try:
            # Build message history for this execution
            messages = [
                SystemMessage(content=self.SYSTEM_PROMPT),
                HumanMessage(content=f"Execute this task: {task.description}"),
            ]

            # Add project context if available
            project_context = state.get("project")
            system_context = state.get("system_context")
            if project_context:
                context_msg = f"\n\nProject Context:\n- Name: {project_context.get('name')}\n- Path: {project_context.get('path')}"
                if system_context:
                    context_msg += f"\n\nProject Instructions:\n{system_context[:2000]}"
                messages[0] = SystemMessage(content=self.SYSTEM_PROMPT + context_msg)

            # Tool calling loop
            max_iterations = 10
            tool_results = []
            final_result = None
            pending_approvals = dict(state.get("pending_approvals", {}))

            # Track token usage across iterations.
            # `_extract_and_update_tokens` 는 넘겨받은 state 의 누계 위에 이번 회차를
            # 더해 새 dict 를 돌려준다. 기준선을 회차마다 굴려야 누계가 쌓인다.
            accumulated_token_updates: dict[str, Any] = {}
            token_baseline: AgentState = state
            llm, resolved_model, runtime_resolution = self._resolved_llm_for_state(state)
            llm_with_tools = llm.bind_tools(self.tools) if self.tools and llm else llm
            runtime_metadata = runtime_resolution.usage_metadata() if runtime_resolution else {}

            for _iteration in range(max_iterations):
                # Get LLM response
                if self.tools:
                    response = await llm_with_tools.ainvoke(messages)
                else:
                    response = await llm.ainvoke(messages)

                messages.append(response)

                # Extract and accumulate token usage
                token_update = self._extract_and_update_tokens(
                    response,
                    token_baseline,
                    "Executor",
                    model=resolved_model,
                    metadata=runtime_metadata,
                )
                if token_update:
                    accumulated_token_updates = token_update
                    token_baseline = cast(
                        AgentState,
                        {
                            **token_baseline,
                            "token_usage": token_update["token_usage"],
                            "total_cost": token_update["total_cost"],
                        },
                    )
                    # 원장에는 회차 델타(`_last_token_update`)만 기록되므로
                    # 원본 state 를 그대로 넘긴다 — 누적 기준선과 무관하다.
                    await self._record_token_update_usage(
                        token_update,
                        state,
                        task_id=current_task_id,
                    )

                # Check for tool calls
                tool_calls = getattr(response, "tool_calls", None)

                if not tool_calls:
                    # No more tool calls, use the response as final result
                    final_result = response.content
                    break

                # Process each tool call
                for tool_call in tool_calls:
                    tool_name = tool_call.get("name", "")
                    tool_args = tool_call.get("args", {})
                    tool_id = tool_call.get("id", str(uuid.uuid4()))

                    # HITL: Check if approval is required
                    requires_approval, approval_request = self._check_approval_required(
                        tool_name, tool_args, current_task_id, session_id
                    )

                    if requires_approval and approval_request:
                        # 승인은 "이 task"가 아니라 "이 도구 호출"에 바인딩된다.
                        #
                        # 승인 후 재진입한 executor 는 LLM 을 다시 호출하므로 모델이
                        # 승인받은 것과 다른 호출을 만들 수 있다. status 만 보고 통과시키면
                        # 이전 승인의 권한으로 그 호출이 실행된다(승인 바이패스).
                        # 승인 요청 객체가 tool_name/tool_args 를 담고 있으므로 그것이
                        # 바인딩의 정본이다 — `pending_approvals` 는 AgentState 의 정식
                        # 필드라 LangGraph 채널을 통과해 재진입 시에도 남는다.
                        approval_id = approval_request["id"]
                        existing_approval = pending_approvals.get(task.pending_approval_id)

                        approval_matches_call = bool(
                            existing_approval
                            and existing_approval.get("status") == ApprovalStatus.APPROVED.value
                            and existing_approval.get("tool_name") == tool_name
                            and existing_approval.get("tool_args") == tool_args
                        )

                        if approval_matches_call:
                            # 승인 대상과 동일한 호출 — 실행을 허용하고 승인을 소비한다.
                            # 승인은 1회용이다: 바인딩을 끊지 않으면 이후 iteration 에서
                            # 같은 승인으로 다시 실행할 수 있다.
                            task.pending_approval_id = None
                        else:
                            # Need approval - pause execution
                            task.status = TaskStatus.WAITING
                            task.pending_approval_id = approval_id
                            task.updated_at = utcnow()

                            pending_approvals[approval_id] = approval_request

                            # Audit: Log approval requested
                            AuditService.log(
                                action=AuditAction.APPROVAL_REQUESTED,
                                resource_type=ResourceType.APPROVAL,
                                resource_id=approval_id,
                                session_id=session_id,
                                project_id=project_id,
                                agent_id=agent_id,
                                metadata={
                                    "task_id": current_task_id,
                                    "tool_name": tool_name,
                                    "risk_level": approval_request["risk_level"],
                                },
                            )

                            return {
                                "tasks": {current_task_id: task},
                                "pending_approvals": pending_approvals,
                                "waiting_for_approval": True,
                                "messages": [
                                    self._create_message(
                                        "system",
                                        f"Approval required for {tool_name}: {approval_request['risk_description']}",
                                    )
                                ],
                            }

                    # Execute the tool
                    usage_context = {
                        "source": LLMUsageSource.ORCHESTRATOR,
                        "user_id": state.get("user_id"),
                        "organization_id": state.get("organization_id"),
                        "session_id": session_id,
                        "task_id": current_task_id,
                        "project_id": project_id,
                        "llm_access": state.get("llm_access"),
                        "metadata": {
                            "node": self.node_name,
                            "agent_id": agent_id,
                            "tool_name": tool_name,
                        },
                    }
                    result = await self._execute_tool(
                        tool_name,
                        tool_args,
                        usage_context=usage_context,
                    )
                    tool_results.append(
                        {
                            "tool": tool_name,
                            "args": tool_args,
                            "result": result[:500] if len(result) > 500 else result,
                        }
                    )

                    # Audit: Log tool execution
                    audit_tool_executed(
                        session_id=session_id,
                        tool_name=tool_name,
                        tool_args=tool_args,
                        result=result,
                        agent_id=agent_id,
                        task_id=current_task_id,
                        project_id=project_id,
                    )

                    # Add tool result to messages
                    messages.append(
                        ToolMessage(
                            content=result,
                            tool_call_id=tool_id,
                        )
                    )

            # Build final task result
            if tool_results:
                task.result = {
                    "summary": final_result or "Task completed with tool executions",
                    "tool_executions": tool_results,
                }
            else:
                task.result = final_result

            task.status = TaskStatus.COMPLETED
            task.pending_approval_id = None
            task.updated_at = utcnow()

            # Audit: Log task completion
            audit_task_status_change(
                session_id=session_id,
                task_id=current_task_id,
                old_status=TaskStatus.IN_PROGRESS.value,
                new_status=TaskStatus.COMPLETED.value,
                agent_id=agent_id,
                project_id=project_id,
            )

            # Update agent status to completed
            if agent_id in agents:
                agents[agent_id].status = TaskStatus.COMPLETED
                agents[agent_id].current_task = None

                # Audit: Log agent completion
                AuditService.log(
                    action=AuditAction.AGENT_COMPLETED,
                    resource_type=ResourceType.AGENT,
                    resource_id=agent_id,
                    session_id=session_id,
                    project_id=project_id,
                    agent_id=agent_id,
                    metadata={"task_id": current_task_id},
                )

            result = {
                "tasks": {current_task_id: task},
                "agents": agents,
                "messages": [self._create_message("assistant", f"Completed task: {task.title}")],
                "tool_results": tool_results,
            }

            # Include token usage updates
            if accumulated_token_updates:
                result.update(accumulated_token_updates)

            return result

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.updated_at = utcnow()

            # Audit: Log task failure
            audit_task_status_change(
                session_id=session_id,
                task_id=current_task_id,
                old_status=TaskStatus.IN_PROGRESS.value,
                new_status=TaskStatus.FAILED.value,
                agent_id=agent_id,
                project_id=project_id,
            )

            # Update agent status to failed
            if agent_id in agents:
                agents[agent_id].status = TaskStatus.FAILED
                agents[agent_id].current_task = None

            result = {
                "tasks": {current_task_id: task},
                "agents": agents,
                "last_error": str(e),
                "errors": state.get("errors", []) + [str(e)],
            }

            # Include token usage even on failure
            if accumulated_token_updates:
                result.update(accumulated_token_updates)

            return result
