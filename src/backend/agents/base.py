"""Base agent class for all specialized agents."""

from abc import ABC, abstractmethod
import os
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel, Field

from models.llm_models import LLMModelRegistry, LLMProvider


# Default model from registry
_DEFAULT_AGENT_MODEL = LLMModelRegistry.get_default(LLMProvider.GOOGLE)


class AgentConfig(BaseModel):
    """Configuration for an agent."""

    name: str
    description: str
    system_prompt: str
    model_name: str = _DEFAULT_AGENT_MODEL
    temperature: float = 0.7
    max_tokens: int = 4096
    tools: list[str] = Field(default_factory=list)


class AgentResult(BaseModel):
    """Result from agent execution."""

    success: bool
    output: Any
    error: str | None = None
    tokens_used: int = 0
    execution_time_ms: int = 0


class BaseAgent(ABC):
    """
    Base class for all specialized agents.

    Provides common functionality:
    - LLM initialization
    - Message formatting
    - Error handling
    - Result formatting
    """

    def __init__(self, config: AgentConfig):
        self.config = config
        self.llm = ChatGoogleGenerativeAI(
            model=config.model_name,
            temperature=config.temperature,
            max_output_tokens=config.max_tokens,
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )

    @property
    def name(self) -> str:
        return self.config.name

    @property
    def description(self) -> str:
        return self.config.description

    @abstractmethod
    async def execute(self, task: str, context: dict[str, Any] | None = None) -> AgentResult:
        """
        Execute the agent's main task.

        Args:
            task: The task description
            context: Optional context for the task

        Returns:
            AgentResult with the execution result
        """
        pass

    async def _invoke_llm(
        self,
        task: str,
        context: dict[str, Any] | None = None,
    ) -> str:
        """Invoke the LLM with the task."""
        messages = [
            SystemMessage(content=self.config.system_prompt),
        ]

        # Add context if provided
        if context:
            context_str = "\n".join(f"- {k}: {v}" for k, v in context.items())
            messages.append(HumanMessage(content=f"Context:\n{context_str}\n\nTask: {task}"))
        else:
            messages.append(HumanMessage(content=task))

        response = await self.llm.ainvoke(messages)
        content = response.content

        # Handle list-type responses from newer Gemini models
        if isinstance(content, list):
            # Extract text from list of content blocks
            text_parts = []
            for item in content:
                if isinstance(item, dict) and "text" in item:
                    text_parts.append(item["text"])
                elif isinstance(item, str):
                    text_parts.append(item)
            return "".join(text_parts)

        return content

    def _format_error(self, error: Exception) -> AgentResult:
        """Format an error result."""
        return AgentResult(
            success=False,
            output=None,
            error=str(error),
        )
