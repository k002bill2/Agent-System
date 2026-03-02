"""Legacy specialized agent implementations.

DEPRECATED: These agents (CodeAnalystAgent, ResearcherAgent, WriterAgent) are
superseded by the new specialist agents in agents/specialists/.
They are retained for backward compatibility with playground sessions.
"""

import time
from typing import Any

from agents.base import AgentConfig, AgentResult, BaseAgent


class CodeAnalystAgent(BaseAgent):
    """Agent specialized in code analysis and review."""

    def __init__(self):
        config = AgentConfig(
            name="CodeAnalyst",
            description="Analyzes code for quality, patterns, and potential issues",
            system_prompt="""You are an expert code analyst. Your role is to:

1. Analyze code structure and architecture
2. Identify potential bugs and issues
3. Suggest improvements and optimizations
4. Evaluate code quality and maintainability

When analyzing code:
- Look for common anti-patterns
- Check for security vulnerabilities
- Evaluate performance implications
- Consider readability and documentation

Provide structured analysis with clear recommendations.""",
            temperature=0.3,  # Lower temperature for more precise analysis
        )
        super().__init__(config)

    async def execute(self, task: str, context: dict[str, Any] | None = None) -> AgentResult:
        """Execute code analysis."""
        start_time = time.time()

        try:
            result = await self._invoke_llm(task, context)
            execution_time = int((time.time() - start_time) * 1000)

            return AgentResult(
                success=True,
                output={
                    "analysis": result,
                    "type": "code_analysis",
                },
                execution_time_ms=execution_time,
            )
        except Exception as e:
            return self._format_error(e)


class ResearcherAgent(BaseAgent):
    """Agent specialized in research and information gathering."""

    def __init__(self):
        config = AgentConfig(
            name="Researcher",
            description="Researches topics and gathers relevant information",
            system_prompt="""You are an expert researcher. Your role is to:

1. Gather comprehensive information on topics
2. Analyze and synthesize findings
3. Identify key insights and patterns
4. Provide well-structured summaries

When researching:
- Consider multiple perspectives
- Verify information accuracy
- Cite sources when possible
- Highlight uncertainties

Provide thorough but concise research reports.""",
            temperature=0.5,
        )
        super().__init__(config)

    async def execute(self, task: str, context: dict[str, Any] | None = None) -> AgentResult:
        """Execute research task."""
        start_time = time.time()

        try:
            result = await self._invoke_llm(task, context)
            execution_time = int((time.time() - start_time) * 1000)

            return AgentResult(
                success=True,
                output={
                    "research": result,
                    "type": "research_report",
                },
                execution_time_ms=execution_time,
            )
        except Exception as e:
            return self._format_error(e)


class WriterAgent(BaseAgent):
    """Agent specialized in content writing and documentation."""

    def __init__(self):
        config = AgentConfig(
            name="Writer",
            description="Creates well-structured content and documentation",
            system_prompt="""You are an expert technical writer. Your role is to:

1. Create clear, well-structured content
2. Write comprehensive documentation
3. Explain complex topics simply
4. Maintain consistent style and tone

When writing:
- Use clear and concise language
- Structure content logically
- Include examples when helpful
- Consider the target audience

Produce professional, readable content.""",
            temperature=0.7,  # Higher creativity for writing
        )
        super().__init__(config)

    async def execute(self, task: str, context: dict[str, Any] | None = None) -> AgentResult:
        """Execute writing task."""
        start_time = time.time()

        try:
            result = await self._invoke_llm(task, context)
            execution_time = int((time.time() - start_time) * 1000)

            return AgentResult(
                success=True,
                output={
                    "content": result,
                    "type": "written_content",
                },
                execution_time_ms=execution_time,
            )
        except Exception as e:
            return self._format_error(e)
