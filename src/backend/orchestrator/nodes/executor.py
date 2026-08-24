"""ExecutorNode — 태스크 실행·HITL 승인 체크·MCP 도구 통합.

MCP 는 optional 의존이다(위 planner 의 RAG 와 같은 구조·같은 주의).

테스트는 이 모듈 경로로 패치한다:
`orchestrator.nodes.executor.audit_task_status_change` ·
`orchestrator.nodes.executor.AuditService.log`.
"""

import json
import logging
import uuid
from typing import Any, cast

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool

from models.agent_state import AgentInfo, AgentRole, AgentState, TaskStatus
from models.hitl import APPROVAL_STATE_LOCK, ApprovalStatus, assess_operation_risk
from models.llm_usage import LLMUsageSource
from services.audit_service import (
    AuditAction,
    AuditService,
    ResourceType,
    audit_task_status_change,
    audit_tool_executed,
)
from services.session_service import SessionService, get_session_service
from utils.time import utcnow

from .base import BaseNode

logger = logging.getLogger(__name__)

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

    def __init__(
        self,
        llm: BaseChatModel | None = None,
        tools: list[BaseTool] | None = None,
        session_service: SessionService | None = None,
    ):
        """Initialize ExecutorNode with LLM and tools.

        `session_service` 는 승인 소비를 기록할 저장소다. 엔진이 커스텀 서비스를
        주입받았는데 노드가 전역 인스턴스에 쓰면, 소비 기록이 엔진이 읽는 곳과
        **다른 저장소**로 가서 재시작 후 승인이 다시 살아난다.
        """
        super().__init__(llm)
        self.session_service = session_service
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

    async def _consume_approval(
        self,
        state: AgentState,
        pending_approvals: dict[str, Any],
        approval: dict[str, Any],
    ) -> bool:
        """승인을 1회용으로 소비한다. 소비에 성공했을 때만 True.

        승인은 1회용이다 — 바인딩을 끊지 않으면 이후 iteration 이나 다른 실행이
        같은 승인으로 다시 도구를 돌릴 수 있다. 바인딩은 `task.pending_approval_id`
        를 지우는 대신 승인 레코드를 `CONSUMED` 로 전이해 끊는다. 대조가
        `status == APPROVED` 를 요구하므로 효과는 같고, 포인터를 남기면 실행 도중
        죽었을 때 "어느 승인으로 무엇을 하다 멈췄는지"가 남아 스케줄러가 잔재를
        실패로 정리할 수 있다(`is_task_orphaned_by_consumed_approval`).

        락 안에서 상태를 **다시 확인**하는 compare-and-set 이다. 병렬 배치
        (`execute_batch`)는 여러 executor 가 같은 세션에 동시에 쓰는데
        `update_session` 은 세션 JSON 전체를 덮으므로, 직렬화하지 않으면 늦게
        도착한 낡은 스냅샷이 다른 소비를 `approved` 로 되돌린다.

        사본이 아니라 **레코드 자체를** 바꾼다. 이 dict 는 `state["pending_approvals"]`
        를 거쳐 엔진 캐시가 들고 있는 바로 그 객체다 — 사본에만 쓰면 저장소는
        `consumed`, 캐시는 `approved` 로 갈라지고, 그래프가 최종 state 를 저장하기
        전에 실패하면 다음 시도가 낡은 캐시를 읽어 다시 승인한다.

        메모리 사본만 보지 않고 **저장소의 승인 상태를 다시 읽는다**. 캐시가 빈
        상태에서 같은 세션에 그래프 실행 둘이 겹치면 각자 독립된 `approved` 사본을
        들고 오므로, 로컬 사본만 보는 검사는 둘 다 통과시킨다.

        영속화가 실패하면 전이를 되돌리고 예외를 올린다 — 소비는 도구 실행 **전**에
        기록하므로 저장이 실패한 시점에는 도구가 아직 실행되지 않았다. 되돌려야
        나중에 정당하게 재시도할 수 있다. 저장이 실제로는 반영됐는데 예외만 올라온
        경우(타임아웃 등)는 위 재검증이 걸러낸다.
        """
        async with APPROVAL_STATE_LOCK.lock():
            if approval.get("status") != ApprovalStatus.APPROVED.value:
                return False  # 다른 실행이 먼저 소비했다

            if not await self._approval_is_claimable_in_storage(state, approval):
                return False  # 다른 실행이 저장소에서 먼저 가져갔다

            before = dict(approval)
            approval["status"] = ApprovalStatus.CONSUMED.value
            approval["consumed_at"] = utcnow().isoformat()
            try:
                await self._persist_approval_consumption(state, pending_approvals)
            except Exception:
                approval.clear()
                approval.update(before)
                raise

        return True

    async def _approval_is_claimable_in_storage(
        self,
        state: AgentState,
        approval: dict[str, Any],
    ) -> bool:
        """저장소에 남은 승인이 아직 `approved` 인가.

        저장소에서 **세션 자체**를 찾을 수 없으면(서비스를 거치지 않고 만든 state·
        이미 삭제된 세션) 판정 근거가 없으므로 막지 않는다 — 그런 세션은 재시작 시
        통째로 사라져 재실행 창도 함께 사라진다.

        반대로 세션은 있는데 그 승인만 없으면 **막는다**. 그건 "영속 저장소가 없다"가
        아니라 "이 승인은 더 이상 유효하지 않다"는 뜻이고, 그대로 진행하면 뒤이은
        전체 state 저장이 없어진 승인을 되살린 뒤 도구까지 실행한다.
        """
        session_id = state.get("session_id", "")
        if not session_id:
            return True

        service = self.session_service or get_session_service()
        stored = await service.get_session(session_id)
        if not stored:
            return True

        stored_approval = stored.get("pending_approvals", {}).get(approval.get("id"))
        if not stored_approval:
            return False

        return bool(stored_approval.get("status") == ApprovalStatus.APPROVED.value)

    async def _persist_approval_consumption(
        self,
        state: AgentState,
        pending_approvals: dict[str, Any],
    ) -> None:
        """승인 소비를 즉시 저장한다 — 반드시 도구 실행 **전에** 호출한다.

        그래프 전체가 끝난 뒤의 일괄 저장(`engine.run`)에만 기대면, 도구가
        비가역 부수효과를 낸 뒤 저장 전에 프로세스가 죽었을 때 재시작 후 승인이
        다시 살아나 같은 작업이 재실행된다.

        저장 실패(예외)는 삼키지 않는다 — 소비를 기록할 수 없으면 실행해서도
        안 된다. 호출자의 try/except 가 task 실패로 처리한다.
        """
        session_id = state.get("session_id", "")
        service = self.session_service or get_session_service()
        persisted = await service.update_session(
            session_id,
            cast(AgentState, {**state, "pending_approvals": pending_approvals}),
        )
        if not persisted:
            # 저장소에 없는 세션이다(이미 삭제됐거나 서비스를 거치지 않고 만든 state).
            # 재시작하면 세션 자체가 사라지므로 재실행 창도 함께 사라진다 —
            # 실행을 막을 이유는 없으나 조용히 넘기지는 않는다.
            logger.warning(
                "Approval consumption was not persisted (session=%s)",
                session_id,
            )

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

        # try 밖에서 바인딩한다 — except 절이 이 값을 결과에 실어 보내므로,
        # 루프 진입 전에 예외가 나면 unbound 가 된다.
        pending_approvals = dict(state.get("pending_approvals", {}))

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

                        # 승인 대상과 동일한 호출이면 소비하고 실행을 허용한다.
                        consumed = approval_matches_call and await self._consume_approval(
                            state,
                            pending_approvals,
                            cast(dict[str, Any], existing_approval),
                        )

                        if not consumed:
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

            node_result: dict[str, Any] = {
                "tasks": {current_task_id: task},
                "agents": agents,
                "messages": [self._create_message("assistant", f"Completed task: {task.title}")],
                "tool_results": tool_results,
                # 소비된 승인을 채널에 돌려보낸다. 빠뜨리면 그래프 종료 시의 전체
                # state 저장이 `consumed` 를 `approved` 로 되돌려 놓는다.
                "pending_approvals": pending_approvals,
            }

            # Include token usage updates
            if accumulated_token_updates:
                node_result.update(accumulated_token_updates)

            return node_result

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

            error_result: dict[str, Any] = {
                "tasks": {current_task_id: task},
                "agents": agents,
                "last_error": str(e),
                "errors": state.get("errors", []) + [str(e)],
                # 실패 경로에서도 소비 기록은 유지해야 한다 — 위와 같은 이유다.
                "pending_approvals": pending_approvals,
            }

            # Include token usage even on failure
            if accumulated_token_updates:
                error_result.update(accumulated_token_updates)

            return error_result
