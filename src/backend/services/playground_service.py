"""Playground service for agent testing environment."""

import asyncio
import time
from datetime import datetime
from typing import Any, AsyncIterator

from models.playground import (
    PlaygroundExecutionStatus,
    PlaygroundMessage,
    PlaygroundExecution,
    PlaygroundSession,
    PlaygroundSessionCreate,
    PlaygroundExecuteRequest,
    PlaygroundToolTest,
    PlaygroundCompareRequest,
    PlaygroundCompareResult,
)


# In-memory storage
_sessions: dict[str, PlaygroundSession] = {}


# Mock tools for playground
PLAYGROUND_TOOLS = {
    "web_search": {
        "name": "web_search",
        "description": "Search the web for information",
        "parameters": {
            "query": {"type": "string", "description": "Search query"},
            "max_results": {"type": "integer", "description": "Max results", "default": 5},
        },
    },
    "code_execute": {
        "name": "code_execute",
        "description": "Execute code in a sandbox",
        "parameters": {
            "language": {"type": "string", "description": "Programming language"},
            "code": {"type": "string", "description": "Code to execute"},
        },
    },
    "file_read": {
        "name": "file_read",
        "description": "Read a file from the workspace",
        "parameters": {
            "path": {"type": "string", "description": "File path"},
        },
    },
    "file_write": {
        "name": "file_write",
        "description": "Write content to a file",
        "parameters": {
            "path": {"type": "string", "description": "File path"},
            "content": {"type": "string", "description": "Content to write"},
        },
    },
    "api_call": {
        "name": "api_call",
        "description": "Make an HTTP API call",
        "parameters": {
            "method": {"type": "string", "description": "HTTP method"},
            "url": {"type": "string", "description": "URL to call"},
            "body": {"type": "object", "description": "Request body"},
        },
    },
}


class PlaygroundService:
    """Service for managing playground sessions and executions."""

    # ─────────────────────────────────────────────────────────────
    # Session Management
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def create_session(data: PlaygroundSessionCreate) -> PlaygroundSession:
        """Create a new playground session."""
        session = PlaygroundSession(
            name=data.name,
            description=data.description,
            agent_id=data.agent_id,
            model=data.model,
            system_prompt=data.system_prompt,
            available_tools=list(PLAYGROUND_TOOLS.keys()),
        )
        _sessions[session.id] = session
        return session

    @staticmethod
    def get_session(session_id: str) -> PlaygroundSession | None:
        """Get a playground session by ID."""
        return _sessions.get(session_id)

    @staticmethod
    def list_sessions() -> list[PlaygroundSession]:
        """List all playground sessions."""
        return sorted(
            _sessions.values(),
            key=lambda s: s.updated_at,
            reverse=True,
        )

    @staticmethod
    def delete_session(session_id: str) -> bool:
        """Delete a playground session."""
        if session_id in _sessions:
            del _sessions[session_id]
            return True
        return False

    @staticmethod
    def update_session_settings(
        session_id: str,
        agent_id: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        system_prompt: str | None = None,
        enabled_tools: list[str] | None = None,
    ) -> PlaygroundSession | None:
        """Update session settings."""
        session = _sessions.get(session_id)
        if not session:
            return None

        if agent_id is not None:
            session.agent_id = agent_id
        if model is not None:
            session.model = model
        if temperature is not None:
            session.temperature = temperature
        if max_tokens is not None:
            session.max_tokens = max_tokens
        if system_prompt is not None:
            session.system_prompt = system_prompt
        if enabled_tools is not None:
            session.enabled_tools = enabled_tools

        session.updated_at = datetime.utcnow()
        return session

    # ─────────────────────────────────────────────────────────────
    # Execution
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def execute(
        session_id: str,
        request: PlaygroundExecuteRequest,
    ) -> PlaygroundExecution:
        """Execute a prompt in the playground."""
        session = _sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Create execution record
        execution = PlaygroundExecution(
            agent_id=session.agent_id or "default",
            prompt=request.prompt,
            context=request.context,
            temperature=request.temperature or session.temperature,
            max_tokens=request.max_tokens or session.max_tokens,
            tools_enabled=request.tools or session.enabled_tools,
        )

        execution.status = PlaygroundExecutionStatus.RUNNING
        execution.started_at = datetime.utcnow()

        # Add user message
        user_msg = PlaygroundMessage(
            role="user",
            content=request.prompt,
        )
        execution.messages.append(user_msg)
        session.messages.append(user_msg)

        start_time = time.time()

        try:
            # Simulate LLM execution
            # In production, this would call the actual LLM
            await asyncio.sleep(0.5)  # Simulate latency

            # Generate mock response
            response_content = _generate_mock_response(
                request.prompt,
                session.agent_id,
                execution.tools_enabled,
            )

            # Calculate mock tokens
            input_tokens = len(request.prompt.split()) * 2
            output_tokens = len(response_content.split()) * 2
            total_tokens = input_tokens + output_tokens

            latency_ms = int((time.time() - start_time) * 1000)

            # Add assistant message
            assistant_msg = PlaygroundMessage(
                role="assistant",
                content=response_content,
                tokens=output_tokens,
                latency_ms=latency_ms,
            )
            execution.messages.append(assistant_msg)
            session.messages.append(assistant_msg)

            # Update execution metrics
            execution.result = response_content
            execution.status = PlaygroundExecutionStatus.COMPLETED
            execution.input_tokens = input_tokens
            execution.output_tokens = output_tokens
            execution.total_tokens = total_tokens
            execution.total_latency_ms = latency_ms
            execution.cost = _calculate_cost(input_tokens, output_tokens, session.model)

        except Exception as e:
            execution.status = PlaygroundExecutionStatus.FAILED
            execution.error = str(e)

        execution.completed_at = datetime.utcnow()

        # Update session
        session.executions.append(execution)
        session.total_executions += 1
        session.total_tokens += execution.total_tokens
        session.total_cost += execution.cost
        session.updated_at = datetime.utcnow()

        return execution

    @staticmethod
    async def execute_stream(
        session_id: str,
        request: PlaygroundExecuteRequest,
    ) -> AsyncIterator[str]:
        """Execute with streaming response."""
        session = _sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Generate mock streaming response
        response = _generate_mock_response(
            request.prompt,
            session.agent_id,
            request.tools or session.enabled_tools,
        )

        # Stream word by word
        words = response.split()
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
            await asyncio.sleep(0.05)  # Simulate streaming delay

    # ─────────────────────────────────────────────────────────────
    # Tool Testing
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def test_tool(request: PlaygroundToolTest) -> dict[str, Any]:
        """Test a specific tool with given arguments."""
        tool = PLAYGROUND_TOOLS.get(request.tool_name)
        if not tool:
            return {
                "success": False,
                "error": f"Tool '{request.tool_name}' not found",
            }

        if request.mock_response:
            # Return mock response
            return {
                "success": True,
                "tool": request.tool_name,
                "arguments": request.arguments,
                "result": _generate_mock_tool_result(request.tool_name, request.arguments),
                "mock": True,
            }

        # In production, this would actually execute the tool
        return {
            "success": True,
            "tool": request.tool_name,
            "arguments": request.arguments,
            "result": f"Tool '{request.tool_name}' would be executed with args: {request.arguments}",
            "mock": False,
        }

    @staticmethod
    def get_available_tools() -> list[dict[str, Any]]:
        """Get list of available tools for playground."""
        return list(PLAYGROUND_TOOLS.values())

    # ─────────────────────────────────────────────────────────────
    # Comparison
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def compare(request: PlaygroundCompareRequest) -> PlaygroundCompareResult:
        """Compare multiple agents on the same prompt."""
        results = []

        for agent_id in request.agents:
            # Create temporary session for each agent
            temp_session = PlaygroundSession(
                agent_id=agent_id,
            )
            _sessions[temp_session.id] = temp_session

            try:
                exec_request = PlaygroundExecuteRequest(
                    prompt=request.prompt,
                    context=request.context,
                )
                execution = await PlaygroundService.execute(temp_session.id, exec_request)
                results.append(execution)
            finally:
                # Clean up temporary session
                del _sessions[temp_session.id]

        # Calculate comparison metrics
        metrics = {
            "fastest": min(results, key=lambda r: r.total_latency_ms).agent_id,
            "cheapest": min(results, key=lambda r: r.cost).agent_id,
            "shortest_response": min(results, key=lambda r: r.output_tokens).agent_id,
            "longest_response": max(results, key=lambda r: r.output_tokens).agent_id,
        }

        return PlaygroundCompareResult(
            prompt=request.prompt,
            results=results,
            comparison_metrics=metrics,
        )

    # ─────────────────────────────────────────────────────────────
    # History
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def clear_session_history(session_id: str) -> bool:
        """Clear conversation history for a session."""
        session = _sessions.get(session_id)
        if not session:
            return False

        session.messages = []
        session.executions = []
        session.updated_at = datetime.utcnow()
        return True

    @staticmethod
    def get_execution_history(
        session_id: str,
        limit: int = 50,
    ) -> list[PlaygroundExecution]:
        """Get execution history for a session."""
        session = _sessions.get(session_id)
        if not session:
            return []
        return session.executions[-limit:]


# ─────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────


def _generate_mock_response(
    prompt: str,
    agent_id: str | None,
    tools: list[str],
) -> str:
    """Generate a mock LLM response for testing."""
    agent_name = agent_id or "default agent"

    if "code" in prompt.lower() or "function" in prompt.lower():
        return f"""I'll help you with that coding task. Here's a solution:

```python
def example_function():
    # Implementation based on your request
    result = process_data()
    return result
```

This implementation follows best practices and handles edge cases. Let me know if you need any modifications!

[Generated by {agent_name} in playground mode]"""

    elif "explain" in prompt.lower() or "what is" in prompt.lower():
        return f"""Great question! Let me explain:

The concept you're asking about involves several key components:

1. **First Component**: This handles the initial processing
2. **Second Component**: This manages the core logic
3. **Third Component**: This produces the final output

Each component works together to achieve the desired result. Would you like me to elaborate on any specific part?

[Generated by {agent_name} in playground mode]"""

    else:
        return f"""I understand your request. Here's my response:

Based on the context provided, I would recommend the following approach:

- Start by analyzing the requirements
- Break down the task into smaller steps
- Implement each step carefully
- Test and validate the results

Available tools for this session: {', '.join(tools) if tools else 'None'}

Is there anything specific you'd like me to focus on?

[Generated by {agent_name} in playground mode]"""


def _generate_mock_tool_result(tool_name: str, arguments: dict[str, Any]) -> Any:
    """Generate mock tool execution result."""
    if tool_name == "web_search":
        return {
            "results": [
                {"title": "Result 1", "url": "https://example.com/1", "snippet": "..."},
                {"title": "Result 2", "url": "https://example.com/2", "snippet": "..."},
            ],
            "total": 2,
        }
    elif tool_name == "code_execute":
        return {
            "output": "Hello, World!",
            "exit_code": 0,
            "execution_time_ms": 50,
        }
    elif tool_name == "file_read":
        return {
            "content": "# Sample file content\nThis is a test file.",
            "size": 42,
        }
    elif tool_name == "file_write":
        return {
            "success": True,
            "path": arguments.get("path", "unknown"),
            "bytes_written": len(arguments.get("content", "")),
        }
    elif tool_name == "api_call":
        return {
            "status": 200,
            "body": {"message": "Success"},
            "headers": {"content-type": "application/json"},
        }
    return {"result": "Mock result"}


def _calculate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    """Calculate cost based on model pricing."""
    # Pricing per 1K tokens
    pricing = {
        "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
        "claude-opus-4-20250514": {"input": 0.015, "output": 0.075},
        "gemini-2.0-flash-exp": {"input": 0.00025, "output": 0.001},
        "gpt-4o": {"input": 0.005, "output": 0.015},
    }

    rates = pricing.get(model, {"input": 0.001, "output": 0.002})

    input_cost = (input_tokens / 1000) * rates["input"]
    output_cost = (output_tokens / 1000) * rates["output"]

    return round(input_cost + output_cost, 6)
