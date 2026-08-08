"""PlannerNode — LLM 기반 태스크 분해와 RAG 컨텍스트 조회.

RAG 는 optional 의존이다. `try/except ImportError` 블록을 **통째로** 이 모듈이
가진다 — `RAG_AVAILABLE` 과 `get_project_context` 를 가르면 graceful
degradation 구조가 깨진다.

`except ImportError` 는 **어떤** ImportError 든 삼키므로, 분할이 순환 import 를
만들면 플래그가 조용히 False 가 되고 fallback 이 빈 문자열을 돌려준다.
`tests/backend/test_orchestrator_nodes_optional_deps.py` 가 그것을 잡는다.
"""

import json
import uuid
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool

from models.agent_state import AgentState, TaskNode, TaskStatus
from models.task_plan import (
    PLANNER_SYSTEM_PROMPT,
    PLANNER_USER_TEMPLATE,
    SubtaskPlan,
    TaskPlanResult,
)
from services.audit_service import audit_task_created

from .base import BaseNode

try:
    from services.rag_service import get_project_context

    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False

    def get_project_context(*args, **kwargs):
        return ""


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

    def _build_tasks_from_analysis(
        self, state: AgentState, pre_analyzed_plan: dict[str, Any]
    ) -> dict[str, Any]:
        """
        사전 분석된 실행 계획에서 TaskNode를 직접 생성.

        LLM 호출을 건너뛰고 분석 결과의 subtasks와 parallel_groups를
        기반으로 태스크 트리를 구성합니다.
        """
        messages = state.get("messages", [])
        user_messages = [m for m in messages if m.get("role") == "user"]
        task_description = user_messages[-1].get("content", "") if user_messages else ""

        subtasks_map = pre_analyzed_plan.get("subtasks", {})
        execution_order = pre_analyzed_plan.get("execution_order", [])

        # Create root task
        root_task_id = str(uuid.uuid4())
        root_task = TaskNode(
            id=root_task_id,
            title="Root Task",
            description=task_description,
            status=TaskStatus.IN_PROGRESS,
        )

        tasks: dict[str, TaskNode] = {root_task_id: root_task}
        subtask_ids: list[str] = []
        title_to_id: dict[str, str] = {}

        # 실행 순서를 따르되, 없으면 subtasks_map의 키 순서 사용
        ordered_keys = execution_order if execution_order else list(subtasks_map.keys())

        # First pass: Create all subtasks
        for task_key in ordered_keys:
            subtask_info = subtasks_map.get(task_key, {})
            if not subtask_info:
                continue

            subtask_id = str(uuid.uuid4())
            subtask = TaskNode(
                id=subtask_id,
                parent_id=root_task_id,
                title=subtask_info.get("title", task_key),
                description=subtask_info.get("title", task_key),
                status=TaskStatus.PENDING,
                assigned_agent=subtask_info.get("agent"),
            )
            tasks[subtask_id] = subtask
            subtask_ids.append(subtask_id)
            title_to_id[task_key] = subtask_id

        # Second pass: Set up dependencies from subtask info
        dependencies: dict[str, list[str]] = {}
        for task_key in ordered_keys:
            subtask_info = subtasks_map.get(task_key, {})
            if not subtask_info:
                continue

            subtask_id = title_to_id.get(task_key)
            if not subtask_id:
                continue

            dep_ids = []
            for dep_key in subtask_info.get("dependencies", []):
                if dep_key in title_to_id:
                    dep_ids.append(title_to_id[dep_key])

            if dep_ids:
                dependencies[subtask_id] = dep_ids

        root_task.children = subtask_ids

        # Audit: Log task creation
        session_id = state.get("session_id", "")
        project_id = state.get("project", {}).get("id")
        audit_task_created(
            session_id=session_id,
            task_id=root_task_id,
            task_data={"title": root_task.title, "description": task_description},
            project_id=project_id,
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
                project_id=project_id,
            )

        return {
            "tasks": tasks,
            "root_task_id": root_task_id,
            "messages": [
                self._create_message(
                    "system",
                    f"Using pre-analyzed execution plan. Subtasks: {len(subtask_ids)}",
                )
            ],
            "plan_metadata": {
                "analysis": "Pre-analyzed execution plan (skipped LLM planning)",
                "is_complex": len(subtask_ids) > 1,
                "subtask_count": len(subtask_ids),
                "dependencies": dependencies,
                "pre_analyzed": True,
            },
        }

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Run LLM-based planner logic."""
        # 사전 분석된 실행 계획이 있으면 LLM 호출 건너뛰기
        plan_metadata = state.get("plan_metadata", {})
        pre_analyzed_plan = plan_metadata.get("pre_analyzed_execution_plan")

        if pre_analyzed_plan and pre_analyzed_plan.get("subtasks"):
            return self._build_tasks_from_analysis(state, pre_analyzed_plan)

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
        llm, resolved_model, runtime_resolution = self._resolved_llm_for_state(state)
        runtime_metadata = runtime_resolution.usage_metadata() if runtime_resolution else {}

        try:
            # Use structured output if available, otherwise parse JSON
            if hasattr(llm, "with_structured_output"):
                structured_llm = llm.with_structured_output(TaskPlanResult)
                plan_result: TaskPlanResult = await structured_llm.ainvoke(
                    [
                        SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                        HumanMessage(content=user_prompt),
                    ]
                )
            else:
                # Fallback: Parse JSON from response
                response = await llm.ainvoke(
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

        token_updates = {}
        if "response" in locals():
            token_updates = self._extract_and_update_tokens(
                response,
                state,
                "Planner",
                model=resolved_model,
                metadata=runtime_metadata,
            )
            if token_updates:
                await self._record_token_update_usage(
                    token_updates,
                    state,
                    task_id=None,
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
        project_id = state.get("project", {}).get("id")
        audit_task_created(
            session_id=session_id,
            task_id=root_task_id,
            task_data={"title": root_task.title, "description": task_description},
            project_id=project_id,
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
                project_id=project_id,
            )

        result = {
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
        if token_updates:
            result.update(token_updates)
        return result
