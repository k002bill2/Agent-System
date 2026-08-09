"""BaseNode — 모든 LangGraph 노드의 추상 베이스.

LLM 호출과 사용량 기록(`record_usage_best_effort`)이 여기 모인다.
테스트는 이 모듈 경로로 패치한다:
`orchestrator.nodes.base.record_usage_best_effort` ·
`orchestrator.nodes.base.LLMService._get_llm`.
"""

import uuid
from abc import ABC, abstractmethod
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool

from models.agent_state import AgentState
from models.cost import TokenUsage, estimate_tokens, extract_token_usage
from models.llm_access import LLMAccessResponse
from models.llm_models import LLMModelRegistry
from models.llm_usage import (
    LLMRuntimeMode,
    LLMUsageMeasurementMethod,
    LLMUsageRecordCreate,
    LLMUsageSource,
    LLMUsageStatus,
)
from services.llm_runtime_resolver import (
    LLMRuntimeRequest,
    LLMRuntimeResolution,
    resolve_llm_runtime,
)
from services.llm_service import LLMService
from services.llm_usage_ledger_service import record_usage_best_effort
from utils.time import utcnow


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
            "timestamp": utcnow().isoformat(),
        }

    def _model_id_from_llm(self) -> str:
        """Best-effort model id extraction from LangChain model objects."""
        if not self.llm:
            return ""
        for attr in ("model_name", "model", "model_id"):
            value = getattr(self.llm, attr, None)
            if isinstance(value, str) and value:
                return value
        return ""

    @staticmethod
    def _state_llm_access(state: AgentState) -> LLMAccessResponse | None:
        access = state.get("llm_access")
        if isinstance(access, LLMAccessResponse):
            return access
        if isinstance(access, dict):
            return LLMAccessResponse.model_validate(access)
        return None

    def _resolved_llm_for_state(
        self,
        state: AgentState,
        *,
        tools: list[BaseTool] | None = None,
    ) -> tuple[Any, str | None, LLMRuntimeResolution | None]:
        """Resolve a call-time LLM from session access policy when available."""
        access = self._state_llm_access(state)
        if not access:
            llm = self.llm
            if tools and llm:
                return llm.bind_tools(tools), None, None
            return llm, None, None

        resolution = resolve_llm_runtime(
            access,
            LLMRuntimeRequest(
                user_id=state.get("user_id"),
                organization_id=state.get("organization_id"),
                source=LLMUsageSource.ORCHESTRATOR,
                requested_model_id=None,
            ),
        )
        llm = LLMService._get_llm(model_id=resolution.model_id)
        if tools:
            llm = llm.bind_tools(tools)
        return llm, resolution.model_id, resolution

    @staticmethod
    def _runtime_mode_for_provider(provider: str) -> LLMRuntimeMode:
        if provider.endswith("_cli"):
            return LLMRuntimeMode.CLI
        if provider == "ollama":
            return LLMRuntimeMode.LOCAL
        return LLMRuntimeMode.API

    async def _record_token_update_usage(
        self,
        token_update: dict[str, Any],
        state: AgentState,
        *,
        task_id: str | None,
    ) -> None:
        """Record orchestrator node token updates into the internal usage ledger."""
        last_update = token_update.get("_last_token_update") if token_update else None
        if not last_update:
            return

        model = last_update.get("model") or self._model_id_from_llm() or None
        provider = LLMModelRegistry.get_provider(model) if model else None
        provider_value = provider.value if provider else "unknown"
        project_id = state.get("project", {}).get("id")
        metadata = {
            "node": self.node_name,
            "agent_name": last_update.get("agent_name"),
        }
        runtime_metadata = last_update.get("metadata")
        if isinstance(runtime_metadata, dict):
            metadata.update(runtime_metadata)

        await record_usage_best_effort(
            LLMUsageRecordCreate(
                user_id=state.get("user_id"),
                organization_id=state.get("organization_id"),
                provider=provider_value,
                mode=self._runtime_mode_for_provider(provider_value),
                source=LLMUsageSource.ORCHESTRATOR,
                model=model,
                input_tokens=last_update.get("input_tokens"),
                output_tokens=last_update.get("output_tokens"),
                total_tokens=last_update.get("total_tokens"),
                measurement_method=LLMUsageMeasurementMethod(
                    last_update.get(
                        "measurement_method",
                        LLMUsageMeasurementMethod.UNKNOWN.value,
                    )
                ),
                estimated_cost_usd=last_update.get("cost_usd"),
                status=LLMUsageStatus.SUCCESS,
                session_id=state.get("session_id"),
                task_id=task_id,
                project_id=project_id,
                metadata=metadata,
                started_at=utcnow(),
                completed_at=utcnow(),
            )
        )

    def _extract_and_update_tokens(
        self,
        response: Any,
        state: AgentState,
        agent_name: str | None = None,
        model: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Extract token usage from LLM response and update state.

        Returns dict with token_usage updates for state.
        """
        model = model or self._model_id_from_llm()
        usage = extract_token_usage(response, model or "")
        measurement_method = LLMUsageMeasurementMethod.PROVIDER_METADATA

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
                measurement_method = LLMUsageMeasurementMethod.ESTIMATED
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
                "measurement_method": measurement_method.value,
                "metadata": metadata or {},
            },
        }
