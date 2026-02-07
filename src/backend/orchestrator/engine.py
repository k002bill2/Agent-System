"""Orchestration engine for running the agent graph."""

import os
import uuid
from collections.abc import AsyncIterator

from dotenv import load_dotenv

from config import get_settings

settings = get_settings()

# Load environment variables
load_dotenv()

# LLM Provider selection
# Prefer explicit env vars but fall back to Settings defaults
LLM_PROVIDER = os.getenv(
    "LLM_PROVIDER", settings.llm_provider
)  # "ollama", "anthropic", or "google"
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", settings.ollama_model)
GOOGLE_MODEL = os.getenv("GOOGLE_MODEL", settings.google_model)


def get_llm():
    """Get LLM instance based on provider setting."""
    if LLM_PROVIDER == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        )
    elif LLM_PROVIDER == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        # LangChain's ChatGoogleGenerativeAI expects an `api_key` argument or
        # GOOGLE_API_KEY / GEMINI_API_KEY in the environment.
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
            model=GOOGLE_MODEL,
            api_key=api_key,
        )
    else:
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=OLLAMA_MODEL,
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        )


from models.agent_state import AgentState
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
from services.session_service import SessionService, get_session_service
from tools import ALL_TOOLS


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

        # Initialize nodes
        self.orchestrator_node = OrchestratorNode(self.llm)
        self.planner_node = PlannerNode(self.llm, tools=self.tools)
        self.executor_node = ExecutorNode(self.llm, tools=self.tools)
        self.reviewer_node = ReviewerNode(self.llm)
        self.self_correction_node = SelfCorrectionNode(self.llm)
        self.parallel_executor_node = ParallelExecutorNode(
            llm=self.llm,
            tools=self.tools,
            max_concurrent=3,
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

        # Session service for persistence
        self.session_service = session_service or get_session_service()

        # In-memory session cache (for fast access during execution)
        self._sessions: dict[str, AgentState] = {}

    async def create_session(
        self,
        user_id: str | None = None,
        max_iterations: int = 100,
        project: Project | None = None,
        session_id: str | None = None,
        organization_id: str | None = None,
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
            self._sessions[session_id] = state

        # Audit log: Session created
        AuditService.log(
            action=AuditAction.SESSION_CREATED,
            resource_type=ResourceType.SESSION,
            resource_id=session_id,
            session_id=session_id,
            user_id=user_id,
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

    async def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
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
            )

        return result

    async def run(
        self,
        session_id: str,
        user_message: str,
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
