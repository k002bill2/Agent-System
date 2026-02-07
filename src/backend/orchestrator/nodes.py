"""LangGraph node implementations."""

import json
import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool

from models.agent_state import AgentInfo, AgentRole, AgentState, TaskNode, TaskStatus
from models.cost import TokenUsage, estimate_tokens, extract_token_usage
from models.hitl import (
    ApprovalStatus,
    assess_operation_risk,
)
from models.task_plan import (
    PLANNER_SYSTEM_PROMPT,
    PLANNER_USER_TEMPLATE,
    SubtaskPlan,
    TaskPlanResult,
)

# Audit logging
from services.audit_service import (
    AuditAction,
    AuditService,
    ResourceType,
    audit_task_created,
    audit_task_status_change,
    audit_tool_executed,
)

# Optional RAG service - gracefully handle missing dependencies
try:
    from services.rag_service import get_project_context

    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False

    def get_project_context(*args, **kwargs):
        return ""


# Optional MCP Tool Executor - gracefully handle missing dependencies
try:
    from orchestrator.tools import MCPToolExecutor

    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False
    MCPToolExecutor = None


class BaseNode(ABC):
    """Base class for all graph nodes."""

    def __init__(self, llm: BaseChatModel | None = None):
        self.llm = llm
        self.node_name = self.__class__.__name__

    @abstractmethod
    async def run(self, state: AgentState) -> dict[str, Any]:
        """Execute the node logic."""
        pass

    def _create_message(self, role: str, content: str) -> dict:
        """Create a message dict for state."""
        return {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
        }

    def _extract_and_update_tokens(
        self,
        response: Any,
        state: AgentState,
        agent_name: str | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        """
        Extract token usage from LLM response and update state.

        Returns dict with token_usage updates for state.
        """
        usage = extract_token_usage(response, model or "")

        if not usage:
            # Fallback: 추정값 사용
            content = getattr(response, "content", "")
            if isinstance(content, list):
                # 리스트 형태의 content 처리
                content = " ".join(
                    item.get("text", str(item)) if isinstance(item, dict) else str(item)
                    for item in content
                )
            elif not isinstance(content, str):
                content = str(content) if content else ""

            if content:
                estimated_output = estimate_tokens(content, model or "")
                usage = TokenUsage(
                    input_tokens=0,  # 입력은 정확한 추정 불가
                    output_tokens=estimated_output,
                    total_tokens=estimated_output,
                    model=model or "",
                    cost_usd=0.0,  # 입력 토큰 없으므로 비용 0
                )
            else:
                return {}

        agent = agent_name or self.node_name

        # Get current token usage from state
        token_usage = dict(state.get("token_usage", {}))
        total_cost = state.get("total_cost", 0.0)

        # Initialize agent usage if needed
        if agent not in token_usage:
            token_usage[agent] = {
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_tokens": 0,
                "total_cost_usd": 0.0,
                "call_count": 0,
            }

        # Update agent totals
        token_usage[agent]["total_input_tokens"] += usage.input_tokens
        token_usage[agent]["total_output_tokens"] += usage.output_tokens
        token_usage[agent]["total_tokens"] += usage.total_tokens
        token_usage[agent]["total_cost_usd"] += usage.cost_usd
        token_usage[agent]["call_count"] += 1

        # Update session total
        total_cost += usage.cost_usd

        return {
            "token_usage": token_usage,
            "total_cost": total_cost,
            "_last_token_update": {
                "agent_name": agent,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "total_tokens": usage.total_tokens,
                "model": usage.model,
                "cost_usd": usage.cost_usd,
            },
        }


class OrchestratorNode(BaseNode):
    """
    Main orchestrator node.

    Responsibilities:
    - Analyze current state
    - Decide next action (plan, execute, review, or finish)
    - Coordinate between agents
    """

    SYSTEM_PROMPT = """You are the Orchestrator agent in a multi-agent system.

Your role is to:
1. Analyze the current task state
2. Decide the next action: "plan", "execute", "review", or "finish"
3. Coordinate work between specialized agents

Current capabilities:
- plan: Break down complex tasks into subtasks
- execute: Run a specific task using appropriate tools
- review: Verify completed work and suggest improvements
- finish: Complete the orchestration when all tasks are done

Respond with a JSON object containing:
{
    "thought": "Your reasoning about the current state",
    "next_action": "plan|execute|review|finish",
    "target_task_id": "task_id to act on (if applicable)"
}"""

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Run orchestrator logic."""
        # Increment iteration count
        iteration_count = state.get("iteration_count", 0) + 1

        # Check termination conditions
        if iteration_count >= state.get("max_iterations", 100):
            return {
                "next_action": None,
                "iteration_count": iteration_count,
                "errors": state.get("errors", []) + ["Max iterations reached"],
            }

        # If no tasks exist, we need to plan
        if not state.get("tasks") or not state.get("root_task_id"):
            return {
                "next_action": "plan",
                "iteration_count": iteration_count,
            }

        # Check task statuses
        tasks = state.get("tasks", {})
        root_task_id = state.get("root_task_id")

        if root_task_id and root_task_id in tasks:
            root_task = tasks[root_task_id]

            if root_task.status == TaskStatus.COMPLETED:
                return {
                    "next_action": None,  # Finish
                    "iteration_count": iteration_count,
                }

            # Find next task to execute (respecting dependencies)
            pending_tasks = [
                t
                for t in tasks.values()
                if t.status == TaskStatus.PENDING and t.parent_id == root_task_id
            ]

            # Get dependency map from plan_metadata if available
            plan_metadata = state.get("plan_metadata", {})
            dependencies = plan_metadata.get("dependencies", {})

            if pending_tasks:
                # Filter tasks whose dependencies are all completed
                ready_tasks = []
                for task in pending_tasks:
                    task_deps = dependencies.get(task.id, [])
                    if not task_deps:
                        ready_tasks.append(task)
                    else:
                        # Check if all dependencies are completed
                        all_deps_complete = all(
                            tasks.get(dep_id, TaskNode(id="", title="")).status
                            == TaskStatus.COMPLETED
                            for dep_id in task_deps
                        )
                        if all_deps_complete:
                            ready_tasks.append(task)

                if ready_tasks:
                    if len(ready_tasks) >= 2:
                        # Multiple independent tasks ready - use parallel execution
                        # Limit to max 3 concurrent tasks
                        batch_task_ids = [t.id for t in ready_tasks[:3]]
                        return {
                            "next_action": "execute_batch",
                            "batch_task_ids": batch_task_ids,
                            "iteration_count": iteration_count,
                        }
                    else:
                        # Single task - use sequential execution
                        next_task = ready_tasks[0]
                        return {
                            "next_action": "execute",
                            "current_task_id": next_task.id,
                            "iteration_count": iteration_count,
                        }
                elif pending_tasks:
                    # Has pending tasks but none ready (circular dependency or error)
                    return {
                        "next_action": None,
                        "iteration_count": iteration_count,
                        "errors": state.get("errors", [])
                        + ["Dependency deadlock: no tasks ready to execute"],
                    }

            # Check if all children are complete
            all_children_complete = all(
                tasks[child_id].status == TaskStatus.COMPLETED
                for child_id in root_task.children
                if child_id in tasks
            )

            if all_children_complete and root_task.children:
                return {
                    "next_action": "review",
                    "current_task_id": root_task_id,
                    "iteration_count": iteration_count,
                }

        return {
            "next_action": None,
            "iteration_count": iteration_count,
        }


class PlannerNode(BaseNode):
    """
    Planner node for LLM-based task decomposition.

    Responsibilities:
    - Analyze user requests using LLM
    - Break down complex tasks into subtasks with dependencies
    - Create task hierarchy with effort estimates
    """

    def __init__(self, llm: BaseChatModel | None = None, tools: list[BaseTool] | None = None):
        """Initialize PlannerNode with LLM and optional tools list."""
        super().__init__(llm)
        self.tools = tools or []

    def _get_available_tools_str(self) -> str:
        """Get formatted string of available tools."""
        if not self.tools:
            return "read_file, write_file, edit_file, list_directory, search_files, search_content, execute_bash, run_tests, run_lint, run_typecheck"
        return ", ".join(tool.name for tool in self.tools)

    async def _get_project_context(self, state: AgentState, task_description: str = "") -> str:
        """
        Extract project context from state using RAG if available.

        If the project has been indexed, uses semantic search to find
        relevant documentation. Otherwise falls back to truncated CLAUDE.md.

        Args:
            state: Current agent state
            task_description: The task to find context for (used for RAG query)

        Returns:
            Formatted project context string
        """
        project = state.get("project")
        system_context = state.get("system_context", "")

        if not project:
            return "No project context available"

        project_id = project.get("id")
        project_name = project.get("name", "Unknown")
        project_path = project.get("path", "Unknown")

        context = f"Project: {project_name}\nPath: {project_path}"

        # Try RAG-based context retrieval if project is indexed
        if project_id and task_description:
            try:
                rag_context = await get_project_context(
                    project_id=project_id,
                    query=task_description,
                    k=5,  # Get top 5 relevant chunks
                )
                if rag_context:
                    context += f"\n\nRelevant Project Context (from RAG):\n{rag_context}"
                    return context
            except Exception:
                # Fall through to truncated context if RAG fails
                pass

        # Fallback: Truncated system context
        if system_context:
            truncated = (
                system_context[:2000] + "..." if len(system_context) > 2000 else system_context
            )
            context += f"\n\nProject Instructions:\n{truncated}"

        return context

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Run LLM-based planner logic."""
        messages = state.get("messages", [])

        # Get the latest user message for planning
        user_messages = [m for m in messages if m.get("role") == "user"]

        if not user_messages:
            return {
                "last_error": "No user message found for planning",
            }

        latest_message = user_messages[-1]
        task_description = latest_message.get("content", "")

        # Prepare context for LLM (using RAG if available)
        project_context = await self._get_project_context(state, task_description)
        available_tools = self._get_available_tools_str()

        user_prompt = PLANNER_USER_TEMPLATE.format(
            task_description=task_description,
            project_context=project_context,
            available_tools=available_tools,
        )

        try:
            # Use structured output if available, otherwise parse JSON
            if hasattr(self.llm, "with_structured_output"):
                structured_llm = self.llm.with_structured_output(TaskPlanResult)
                plan_result: TaskPlanResult = await structured_llm.ainvoke(
                    [
                        SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                        HumanMessage(content=user_prompt),
                    ]
                )
            else:
                # Fallback: Parse JSON from response
                response = await self.llm.ainvoke(
                    [
                        SystemMessage(
                            content=PLANNER_SYSTEM_PROMPT + "\n\nRespond with valid JSON only."
                        ),
                        HumanMessage(content=user_prompt),
                    ]
                )

                # Extract JSON from response
                content = response.content
                if isinstance(content, str):
                    # Try to find JSON in the response
                    json_start = content.find("{")
                    json_end = content.rfind("}") + 1
                    if json_start >= 0 and json_end > json_start:
                        json_str = content[json_start:json_end]
                        plan_data = json.loads(json_str)
                        plan_result = TaskPlanResult(**plan_data)
                    else:
                        raise ValueError("No valid JSON found in response")
                else:
                    raise ValueError(f"Unexpected response type: {type(content)}")

        except Exception as e:
            # Fallback to simple single-task plan
            plan_result = TaskPlanResult(
                analysis=f"Failed to parse LLM plan: {str(e)}. Using simple execution.",
                is_complex=False,
                subtasks=[
                    SubtaskPlan(
                        title="Execute task",
                        description=task_description,
                        estimated_effort="medium",
                        dependencies=[],
                        required_tools=[],
                    )
                ],
            )

        # Create root task
        root_task_id = str(uuid.uuid4())
        root_task = TaskNode(
            id=root_task_id,
            title="Root Task",
            description=task_description,
            status=TaskStatus.IN_PROGRESS,
        )

        # Create subtasks from plan
        tasks: dict[str, TaskNode] = {root_task_id: root_task}
        subtask_ids: list[str] = []
        title_to_id: dict[str, str] = {}

        # First pass: Create all subtasks
        for subtask_plan in plan_result.subtasks:
            subtask_id = str(uuid.uuid4())
            subtask = TaskNode(
                id=subtask_id,
                parent_id=root_task_id,
                title=subtask_plan.title,
                description=subtask_plan.description,
                status=TaskStatus.PENDING,
            )
            tasks[subtask_id] = subtask
            subtask_ids.append(subtask_id)
            title_to_id[subtask_plan.title] = subtask_id

        # Second pass: Set up dependencies
        for i, subtask_plan in enumerate(plan_result.subtasks):
            subtask_id = subtask_ids[i]
            subtask = tasks[subtask_id]

            # Convert title-based dependencies to ID-based
            dep_ids = []
            for dep_title in subtask_plan.dependencies:
                if dep_title in title_to_id:
                    dep_ids.append(title_to_id[dep_title])

            # Store dependencies in context for orchestrator
            if dep_ids:
                subtask.description = f"{subtask.description}\n[Dependencies: {', '.join(dep_ids)}]"

        root_task.children = subtask_ids

        # Audit: Log task creation for all tasks
        session_id = state.get("session_id", "")
        audit_task_created(
            session_id=session_id,
            task_id=root_task_id,
            task_data={"title": root_task.title, "description": task_description},
        )
        for subtask_id in subtask_ids:
            subtask = tasks[subtask_id]
            audit_task_created(
                session_id=session_id,
                task_id=subtask_id,
                task_data={
                    "title": subtask.title,
                    "description": subtask.description,
                    "parent_id": root_task_id,
                },
            )

        return {
            "tasks": tasks,
            "root_task_id": root_task_id,
            "messages": [
                self._create_message(
                    "system",
                    f"Created task plan: {plan_result.analysis}\nSubtasks: {len(subtask_ids)}",
                )
            ],
            # Store plan metadata for later use
            "plan_metadata": {
                "analysis": plan_result.analysis,
                "is_complex": plan_result.is_complex,
                "subtask_count": len(subtask_ids),
                "dependencies": {
                    subtask_ids[i]: [
                        title_to_id.get(dep, dep) for dep in plan_result.subtasks[i].dependencies
                    ]
                    for i in range(len(plan_result.subtasks))
                },
            },
        }


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

    async def _execute_tool(self, tool_name: str, tool_args: dict) -> str:
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
            "created_at": datetime.utcnow().isoformat(),
        }

        return True, approval_request

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Run executor logic with tool calling and HITL support."""
        current_task_id = state.get("current_task_id")
        tasks = state.get("tasks", {})
        session_id = state.get("session_id", "")

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
                    task.updated_at = datetime.utcnow()

                    return {
                        "tasks": {current_task_id: task},
                        "waiting_for_approval": False,
                        "messages": [self._create_message("system", f"Task denied: {task.error}")],
                    }
                # Approved - continue execution (will be handled below)

        # Mark task as in progress
        task.status = TaskStatus.IN_PROGRESS
        task.updated_at = datetime.utcnow()

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

            # Track token usage across iterations
            accumulated_token_updates: dict[str, Any] = {}

            for _iteration in range(max_iterations):
                # Get LLM response
                if self.tools:
                    response = await self.llm_with_tools.ainvoke(messages)
                else:
                    response = await self.llm.ainvoke(messages)

                messages.append(response)

                # Extract and accumulate token usage
                token_update = self._extract_and_update_tokens(response, state, "Executor")
                if token_update:
                    accumulated_token_updates = token_update

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
                        # Check if this was already approved
                        approval_id = approval_request["id"]
                        existing_approval = pending_approvals.get(task.pending_approval_id)

                        if (
                            existing_approval
                            and existing_approval.get("status") == ApprovalStatus.APPROVED.value
                        ):
                            # Already approved - proceed with execution
                            pass
                        else:
                            # Need approval - pause execution
                            task.status = TaskStatus.WAITING
                            task.pending_approval_id = approval_id
                            task.updated_at = datetime.utcnow()

                            pending_approvals[approval_id] = approval_request

                            # Audit: Log approval requested
                            AuditService.log(
                                action=AuditAction.APPROVAL_REQUESTED,
                                resource_type=ResourceType.APPROVAL,
                                resource_id=approval_id,
                                session_id=session_id,
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
                                # Store pending tool call for resume
                                "pending_tool_call": {
                                    "tool_name": tool_name,
                                    "tool_args": tool_args,
                                    "tool_id": tool_id,
                                    "approval_id": approval_id,
                                },
                            }

                    # Execute the tool
                    result = await self._execute_tool(tool_name, tool_args)
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
            task.updated_at = datetime.utcnow()

            # Audit: Log task completion
            audit_task_status_change(
                session_id=session_id,
                task_id=current_task_id,
                old_status=TaskStatus.IN_PROGRESS.value,
                new_status=TaskStatus.COMPLETED.value,
                agent_id=agent_id,
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
            task.updated_at = datetime.utcnow()

            # Audit: Log task failure
            audit_task_status_change(
                session_id=session_id,
                task_id=current_task_id,
                old_status=TaskStatus.IN_PROGRESS.value,
                new_status=TaskStatus.FAILED.value,
                agent_id=agent_id,
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


class ReviewerNode(BaseNode):
    """
    Reviewer node for quality assurance.

    Responsibilities:
    - Review completed work
    - Verify correctness
    - Suggest improvements
    """

    SYSTEM_PROMPT = """You are the Reviewer agent in a multi-agent system.

Your role is to:
1. Review the completed task results
2. Verify correctness and quality
3. Approve or request revisions

Respond with a JSON object containing:
{
    "analysis": "Your review of the work",
    "issues": ["List of issues found"],
    "approved": true|false,
    "suggestions": ["Improvement suggestions"]
}"""

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Run reviewer logic."""
        current_task_id = state.get("current_task_id")
        tasks = state.get("tasks", {})

        if not current_task_id or current_task_id not in tasks:
            return {
                "last_error": "No valid task to review",
            }

        task = tasks[current_task_id]

        # Check all subtasks are completed
        all_children_complete = all(
            tasks[child_id].status == TaskStatus.COMPLETED
            for child_id in task.children
            if child_id in tasks
        )

        if all_children_complete:
            # Aggregate results from children
            child_results = [
                tasks[child_id].result
                for child_id in task.children
                if child_id in tasks and tasks[child_id].result
            ]

            task.status = TaskStatus.COMPLETED
            task.result = {
                "summary": "All subtasks completed successfully",
                "child_results": child_results,
            }
            task.updated_at = datetime.utcnow()

            return {
                "tasks": {current_task_id: task},
                "messages": [self._create_message("system", f"Review complete for: {task.title}")],
            }

        return {
            "messages": [self._create_message("system", "Review: Some subtasks still pending")],
        }


class SelfCorrectionNode(BaseNode):
    """
    Self-correction node for automatic error recovery.

    Responsibilities:
    - Analyze failed task errors
    - Generate corrected approach using LLM
    - Update task description for retry
    - Track retry history
    """

    SYSTEM_PROMPT = """You are the Self-Correction agent in a multi-agent system.

A task has failed and you need to analyze the error and suggest a corrected approach.

Your role is to:
1. Analyze the error message and understand what went wrong
2. Consider the original task description and context
3. Generate a modified approach that avoids the error
4. Provide clear instructions for the retry attempt

Respond with a JSON object containing:
{
    "error_analysis": "What went wrong and why",
    "root_cause": "The underlying cause of the failure",
    "correction_strategy": "How to fix or work around the issue",
    "updated_description": "Modified task description with corrections",
    "should_retry": true|false,
    "confidence": "low|medium|high"
}

Be specific about what changes are needed. If the error suggests the task is impossible, set should_retry to false."""

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Analyze failed task and prepare for retry."""
        current_task_id = state.get("current_task_id")
        tasks = dict(state.get("tasks", {}))

        if not current_task_id or current_task_id not in tasks:
            return {
                "last_error": "No valid task for self-correction",
            }

        task = tasks[current_task_id]

        # Check if we've exceeded max retries
        if task.retry_count >= task.max_retries:
            return {
                "messages": [
                    self._create_message(
                        "system",
                        f"Task '{task.title}' has exceeded maximum retries ({task.max_retries}). "
                        f"Error history: {task.error_history}",
                    )
                ],
                "tasks": {current_task_id: task},
            }

        # Only process failed tasks
        if task.status != TaskStatus.FAILED:
            return {
                "messages": [self._create_message("system", "Task is not in failed state")],
            }

        # Use LLM to analyze error and suggest correction
        error_context = f"""
Task Title: {task.title}
Task Description: {task.description}

Error: {task.error}

Previous Attempts: {task.retry_count}
Error History: {task.error_history}
"""

        try:
            if hasattr(self.llm, "with_structured_output"):
                # Use structured output if available
                from pydantic import BaseModel

                class CorrectionResult(BaseModel):
                    error_analysis: str
                    root_cause: str
                    correction_strategy: str
                    updated_description: str
                    should_retry: bool
                    confidence: str

                structured_llm = self.llm.with_structured_output(CorrectionResult)
                response = await structured_llm.ainvoke(
                    [
                        SystemMessage(content=self.SYSTEM_PROMPT),
                        HumanMessage(content=error_context),
                    ]
                )

                correction = {
                    "error_analysis": response.error_analysis,
                    "root_cause": response.root_cause,
                    "correction_strategy": response.correction_strategy,
                    "updated_description": response.updated_description,
                    "should_retry": response.should_retry,
                    "confidence": response.confidence,
                }
            else:
                # Fallback: Parse JSON from response
                llm_response = await self.llm.ainvoke(
                    [
                        SystemMessage(
                            content=self.SYSTEM_PROMPT + "\n\nRespond with valid JSON only."
                        ),
                        HumanMessage(content=error_context),
                    ]
                )

                content = llm_response.content
                if isinstance(content, str):
                    json_start = content.find("{")
                    json_end = content.rfind("}") + 1
                    if json_start >= 0 and json_end > json_start:
                        json_str = content[json_start:json_end]
                        correction = json.loads(json_str)
                    else:
                        raise ValueError("No valid JSON found in response")
                else:
                    raise ValueError(f"Unexpected response type: {type(content)}")

            # Extract token usage
            token_updates = self._extract_and_update_tokens(
                response if hasattr(response, "response_metadata") else llm_response,
                state,
                "SelfCorrection",
            )

        except Exception as e:
            # Fallback correction strategy
            correction = {
                "error_analysis": f"LLM analysis failed: {str(e)}",
                "root_cause": "Unable to determine",
                "correction_strategy": "Retry with original approach",
                "updated_description": task.description,
                "should_retry": task.retry_count < task.max_retries - 1,  # Leave one retry
                "confidence": "low",
            }
            token_updates = {}

        # Update task based on correction
        if correction.get("should_retry", False):
            # Add current error to history
            task.error_history = task.error_history + [task.error or "Unknown error"]
            task.retry_count += 1
            task.status = TaskStatus.PENDING  # Reset for retry
            task.error = None

            # Update description with correction strategy
            original_desc = task.description.split("\n[Correction:")[
                0
            ]  # Remove previous corrections
            task.description = (
                f"{original_desc}\n\n"
                f"[Correction: Retry #{task.retry_count}]\n"
                f"Strategy: {correction.get('correction_strategy', 'No strategy provided')}\n"
                f"Root cause: {correction.get('root_cause', 'Unknown')}"
            )

            if (
                correction.get("updated_description")
                and correction["updated_description"] != original_desc
            ):
                task.description = correction["updated_description"]

            task.updated_at = datetime.utcnow()

            result = {
                "tasks": {current_task_id: task},
                "messages": [
                    self._create_message(
                        "system",
                        f"Self-correction: Retry #{task.retry_count} for '{task.title}'. "
                        f"Analysis: {correction.get('error_analysis', 'N/A')}",
                    )
                ],
                "next_action": "execute",  # Signal to execute again
            }
        else:
            # Don't retry - keep task as failed
            final_error = (
                f"Task failed after {task.retry_count} retries. "
                f"Final analysis: {correction.get('error_analysis', task.error)}"
            )
            task.error = final_error
            task.updated_at = datetime.utcnow()

            result = {
                "tasks": {current_task_id: task},
                "messages": [
                    self._create_message(
                        "system",
                        f"Self-correction determined task cannot be retried: {correction.get('error_analysis', 'N/A')}",
                    )
                ],
            }

        # Include token updates if any
        if token_updates:
            result.update(token_updates)

        return result
