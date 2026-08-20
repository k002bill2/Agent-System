"""Orchestration engine for running the agent graph."""

import os
import uuid
from collections.abc import AsyncIterator
from typing import Any

from dotenv import load_dotenv

from config import get_model_for_provider, get_settings

settings = get_settings()

# Load environment variables
load_dotenv()

# LLM Provider selection
LLM_PROVIDER = os.getenv("LLM_PROVIDER", settings.llm_provider)


def get_llm():
    """Get LLM instance based on provider setting.

    Model selection comes from LLMModelRegistry (DB-backed).
    """
    if LLM_PROVIDER == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=get_model_for_provider("anthropic"),
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        )
    elif LLM_PROVIDER == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        api_key = (
            os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or settings.google_api_key
        )
        if not api_key:
            raise RuntimeError(
                "LLM_PROVIDER=google but no API key found. "
                "Set GOOGLE_API_KEY or GEMINI_API_KEY in the environment "
                "or configure google_api_key in settings."
            )

        return ChatGoogleGenerativeAI(
            model=get_model_for_provider("google"),
            api_key=api_key,
        )
    elif LLM_PROVIDER == "openai":
        from langchain_openai import ChatOpenAI

        api_key = os.getenv("OPENAI_API_KEY") or settings.openai_api_key
        if not api_key:
            raise RuntimeError(
                "LLM_PROVIDER=openai but no API key found. "
                "Set OPENAI_API_KEY in the environment "
                "or configure openai_api_key in settings."
            )

        return ChatOpenAI(
            model=get_model_for_provider("openai"),
            api_key=api_key,
        )
    elif LLM_PROVIDER == "codex_cli":
        from services.codex_cli_chat_model import CodexCliChatModel

        return CodexCliChatModel(model_name=get_model_for_provider("codex_cli"))
    else:
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=get_model_for_provider("ollama"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        )


from models.agent_state import AgentState
from models.llm_access import LLMAccessResponse
from models.llm_usage import LLMUsageSource
from models.message import (
    AgentThinkingPayload,
    ApprovalRequiredPayload,
    Message,
    MessageType,
    StateUpdatePayload,
    TokenUpdatePayload,
)
from models.project import Project
from orchestrator.graph import compile_graph, create_orchestrator_graph
from orchestrator.nodes import (
    ExecutorNode,
    OrchestratorNode,
    PlannerNode,
    ReviewerNode,
    SelfCorrectionNode,
)
from orchestrator.parallel_executor import ParallelExecutorNode
from services.audit_service import (
    AuditAction,
    AuditService,
    ResourceType,
)
from services.context_compressor import ContextCompressor
from services.session_service import SessionService, get_session_service
from tools import ALL_TOOLS


def _serialize_llm_access(
    llm_access: LLMAccessResponse | dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Return a JSON-serializable LLM access payload for session state."""
    if llm_access is None:
        return None
    if isinstance(llm_access, LLMAccessResponse):
        return llm_access.model_dump(mode="json")
    if isinstance(llm_access, dict):
        return LLMAccessResponse.model_validate(llm_access).model_dump(mode="json")
    return None


class OrchestrationEngine:
    """
    Main engine for running agent orchestration.

    Provides:
    - Session management
    - Graph execution
    - Event streaming
    - State persistence
    """

    def __init__(
        self,
        llm=None,
        tools=None,
        session_service: SessionService | None = None,
    ):
        # Use provided LLM or get default based on environment
        self.llm = llm or get_llm()
        print(f"🤖 Using LLM: {self.llm.__class__.__name__}")

        # Initialize tools
        self.tools = tools if tools is not None else ALL_TOOLS
        print(f"🔧 Loaded {len(self.tools)} tools: {[t.name for t in self.tools]}")

        # Session service for persistence.
        # 노드 생성보다 먼저 확정한다 — executor 가 승인 소비를 기록할 저장소가
        # 엔진이 읽는 저장소와 같아야 한다.
        self.session_service = session_service or get_session_service()

        # Initialize nodes
        self.orchestrator_node = OrchestratorNode(self.llm)
        self.planner_node = PlannerNode(self.llm, tools=self.tools)
        self.executor_node = ExecutorNode(
            self.llm, tools=self.tools, session_service=self.session_service
        )
        self.reviewer_node = ReviewerNode(self.llm)
        self.self_correction_node = SelfCorrectionNode(self.llm)
        self.parallel_executor_node = ParallelExecutorNode(
            llm=self.llm,
            tools=self.tools,
            max_concurrent=3,
            session_service=self.session_service,
        )

        # Create and compile graph with self-correction and parallel execution support
        self.graph = create_orchestrator_graph(
            self.orchestrator_node,
            self.planner_node,
            self.executor_node,
            self.reviewer_node,
            self.self_correction_node,
            self.parallel_executor_node,
        )
        self.compiled_graph = compile_graph(self.graph)
        print("✅ Self-correction enabled")
        print("✅ Parallel execution enabled (max 3 concurrent tasks)")

        # Context compressor — closes the token economy gap
        self._compressor = ContextCompressor()

        # In-memory session cache (for fast access during execution)
        self._sessions: dict[str, AgentState] = {}

    @staticmethod
    def _apply_llm_access(
        state: AgentState,
        llm_access: LLMAccessResponse | dict[str, Any] | None,
    ) -> bool:
        access_payload = _serialize_llm_access(llm_access)
        if not access_payload:
            return False
        state["llm_access"] = access_payload
        state["user_id"] = state.get("user_id") or access_payload.get("user_id")
        return True

    @staticmethod
    def _context_compression_usage_context(state: AgentState) -> dict[str, Any]:
        project = state.get("project") if isinstance(state.get("project"), dict) else {}
        context: dict[str, Any] = {
            "source": LLMUsageSource.CONTEXT_COMPRESSION,
            "user_id": state.get("user_id"),
            "organization_id": state.get("organization_id"),
            "session_id": state.get("session_id"),
            "project_id": project.get("id"),
            "metadata": {"event": "context_compression_summary"},
        }
        if state.get("llm_access"):
            context["llm_access"] = state.get("llm_access")
        return context

    async def create_session(
        self,
        user_id: str | None = None,
        max_iterations: int = 100,
        project: Project | None = None,
        session_id: str | None = None,
        organization_id: str | None = None,
        llm_access: LLMAccessResponse | dict[str, Any] | None = None,
    ) -> str:
        """Create a new orchestration session with optional project context."""
        # Create session via service (handles both memory and DB)
        session_id = await self.session_service.create_session(
            user_id=user_id,
            max_iterations=max_iterations,
            project=project,
            session_id=session_id,
            organization_id=organization_id,
        )

        # Also cache the state in memory for fast access
        state = await self.session_service.get_session(session_id)
        if state:
            if self._apply_llm_access(state, llm_access):
                await self.session_service.update_session(session_id, state)
            self._sessions[session_id] = state

        # Audit log: Session created
        AuditService.log(
            action=AuditAction.SESSION_CREATED,
            resource_type=ResourceType.SESSION,
            resource_id=session_id,
            session_id=session_id,
            user_id=user_id,
            project_id=project.id if project else None,
            new_value={
                "max_iterations": max_iterations,
                "project_id": project.id if project else None,
                "organization_id": organization_id,
            },
        )

        return session_id

    async def get_session(self, session_id: str) -> AgentState | None:
        """Get session state."""
        # Check memory cache first
        if session_id in self._sessions:
            return self._sessions[session_id]

        # Fall back to service (database)
        state = await self.session_service.get_session(session_id)
        if state:
            self._sessions[session_id] = state
        return state

    async def save_session(self, session_id: str, state: AgentState) -> None:
        """세션 상태를 캐시와 영속 저장소에 함께 반영한다.

        캐시만 갱신하면 프로세스 재시작이나 다른 인스턴스의 캐시 미스 이후에
        변경이 사라진다. HITL 승인처럼 **그래프 실행 밖에서** 일어나는 전이는
        `run` 의 일괄 저장을 기다리지 말고 이 경로로 즉시 저장해야 한다 —
        `run` 이 실패하면 그 저장은 아예 일어나지 않는다.
        """
        self._sessions[session_id] = state
        await self.session_service.update_session(session_id, state)

    async def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        # Get project_id before deletion
        state = self._sessions.get(session_id) or await self.session_service.get_session(session_id)
        project_id = state.get("project", {}).get("id") if state else None

        # Delete from service
        result = await self.session_service.delete_session(session_id)

        # Also remove from memory cache
        if session_id in self._sessions:
            del self._sessions[session_id]

        # Audit log: Session deleted
        if result:
            AuditService.log(
                action=AuditAction.SESSION_DELETED,
                resource_type=ResourceType.SESSION,
                resource_id=session_id,
                session_id=session_id,
                project_id=project_id,
            )

        return result

    async def run(
        self,
        session_id: str,
        user_message: str,
        llm_access: LLMAccessResponse | dict[str, Any] | None = None,
    ) -> AgentState:
        """
        Run orchestration for a user message.

        Args:
            session_id: The session ID
            user_message: The user's input message

        Returns:
            Final agent state
        """
        state = await self.get_session(session_id)
        if not state:
            raise ValueError(f"Session not found: {session_id}")

        self._apply_llm_access(state, llm_access)

        # Add user message to state
        user_msg = {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": user_message,
        }
        state["messages"] = state.get("messages", []) + [user_msg]

        # Save user message to database
        await self.session_service.save_message(
            session_id=session_id,
            role="user",
            content=user_message,
        )

        # Compress context if approaching token limit
        await self._compressor.compress_if_needed(
            state,
            provider=LLM_PROVIDER,
            model=get_model_for_provider(LLM_PROVIDER),
            usage_context=self._context_compression_usage_context(state),
        )

        # Run the graph
        final_state = await self.compiled_graph.ainvoke(state)

        # Update session (both cache and persistence)
        self._sessions[session_id] = final_state
        await self.session_service.update_session(session_id, final_state)

        return final_state

    async def stream(
        self,
        session_id: str,
        user_message: str,
        llm_access: LLMAccessResponse | dict[str, Any] | None = None,
    ) -> AsyncIterator[Message]:
        """
        Stream orchestration events.

        Args:
            session_id: The session ID
            user_message: The user's input message

        Yields:
            Message events for UI updates
        """
        state = await self.get_session(session_id)
        if not state:
            raise ValueError(f"Session not found: {session_id}")

        self._apply_llm_access(state, llm_access)

        # Add user message
        user_msg = {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": user_message,
        }
        state["messages"] = state.get("messages", []) + [user_msg]

        # Save user message to database
        await self.session_service.save_message(
            session_id=session_id,
            role="user",
            content=user_message,
        )

        # Compress context if approaching token limit
        compression = await self._compressor.compress_if_needed(
            state,
            provider=LLM_PROVIDER,
            model=get_model_for_provider(LLM_PROVIDER),
            usage_context=self._context_compression_usage_context(state),
        )
        if compression.compressed:
            yield Message(
                type=MessageType.STATE_UPDATE,
                payload=StateUpdatePayload(
                    tasks={},
                    agents={},
                    current_task_id=None,
                    active_agent_id=None,
                ).model_dump()
                | {
                    "context_compressed": True,
                    "compression": compression.to_dict(),
                },
                session_id=session_id,
            )

        # Yield task started event
        yield Message(
            type=MessageType.TASK_STARTED,
            payload={"message": user_message},
            session_id=session_id,
        )

        # Stream graph execution
        async for event in self.compiled_graph.astream(state):
            # Extract node name and output
            for node_name, output in event.items():
                # Yield thinking event
                yield Message(
                    type=MessageType.AGENT_THINKING,
                    payload=AgentThinkingPayload(
                        agent_id=node_name,
                        agent_name=node_name.title(),
                        thought=f"Processing in {node_name}",
                        task_id=output.get("current_task_id"),
                    ).model_dump(),
                    session_id=session_id,
                )

                # Update state
                for key, value in output.items():
                    if key in state:
                        if isinstance(state[key], dict) and isinstance(value, dict):
                            state[key].update(value)
                        elif isinstance(state[key], list) and isinstance(value, list):
                            state[key].extend(value)
                        else:
                            state[key] = value

                # Yield state update
                yield Message(
                    type=MessageType.STATE_UPDATE,
                    payload=StateUpdatePayload(
                        tasks={
                            k: v.model_dump() if hasattr(v, "model_dump") else v
                            for k, v in state.get("tasks", {}).items()
                        },
                        agents={
                            k: v.model_dump() if hasattr(v, "model_dump") else v
                            for k, v in state.get("agents", {}).items()
                        },
                        current_task_id=state.get("current_task_id"),
                        active_agent_id=state.get("active_agent_id"),
                    ).model_dump(),
                    session_id=session_id,
                )

                # Check for token usage update
                if output.get("_last_token_update"):
                    token_update = output["_last_token_update"]
                    yield Message(
                        type=MessageType.TOKEN_UPDATE,
                        payload=TokenUpdatePayload(
                            agent_name=token_update["agent_name"],
                            input_tokens=token_update["input_tokens"],
                            output_tokens=token_update["output_tokens"],
                            total_tokens=token_update["total_tokens"],
                            model=token_update["model"],
                            cost_usd=token_update["cost_usd"],
                            session_total_tokens=sum(
                                a.get("total_tokens", 0)
                                for a in state.get("token_usage", {}).values()
                            ),
                            session_total_cost_usd=state.get("total_cost", 0.0),
                        ).model_dump(),
                        session_id=session_id,
                    )

                # Check for HITL approval required
                if output.get("waiting_for_approval"):
                    pending_approvals = state.get("pending_approvals", {})
                    for approval_id, approval in pending_approvals.items():
                        if approval.get("status") == "pending":
                            yield Message(
                                type=MessageType.APPROVAL_REQUIRED,
                                payload=ApprovalRequiredPayload(
                                    approval_id=approval_id,
                                    task_id=approval["task_id"],
                                    tool_name=approval["tool_name"],
                                    tool_args=approval["tool_args"],
                                    risk_level=approval["risk_level"],
                                    risk_description=approval["risk_description"],
                                    created_at=approval["created_at"],
                                ).model_dump(),
                                session_id=session_id,
                            )

        # Update session with final state (both cache and persistence)
        self._sessions[session_id] = state
        await self.session_service.update_session(session_id, state)

        # Update cost tracking in database
        total_tokens = sum(u.get("total_tokens", 0) for u in state.get("token_usage", {}).values())
        await self.session_service.update_cost(
            session_id=session_id,
            total_tokens=total_tokens,
            total_cost_usd=state.get("total_cost", 0.0),
        )

        # Check if waiting for approval - don't send completion event
        if state.get("waiting_for_approval"):
            return

        # Yield completion event
        yield Message(
            type=MessageType.TASK_COMPLETED,
            payload={
                "root_task_id": state.get("root_task_id"),
                "result": state.get("tasks", {}).get(state.get("root_task_id", ""), {}),
            },
            session_id=session_id,
        )

    async def cancel(self, session_id: str) -> bool:
        """Cancel an active orchestration."""
        state = await self.get_session(session_id)
        if not state:
            return False

        # Set cancellation flag
        state["next_action"] = None
        state["errors"] = state.get("errors", []) + ["Cancelled by user"]

        # Update session
        self._sessions[session_id] = state
        await self.session_service.update_session(session_id, state)

        return True
