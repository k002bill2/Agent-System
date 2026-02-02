"""Playground API routes."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from models.playground import (
    PlaygroundSession,
    PlaygroundSessionCreate,
    PlaygroundExecution,
    PlaygroundExecuteRequest,
    PlaygroundToolTest,
    PlaygroundCompareRequest,
    PlaygroundCompareResult,
)
from services.playground_service import PlaygroundService
from services.llm_service import LLMService


router = APIRouter(prefix="/playground", tags=["playground"])


# ─────────────────────────────────────────────────────────────
# Session Management
# ─────────────────────────────────────────────────────────────


@router.get("/sessions", response_model=list[PlaygroundSession])
async def list_sessions():
    """List all playground sessions."""
    return PlaygroundService.list_sessions()


@router.post("/sessions", response_model=PlaygroundSession)
async def create_session(data: PlaygroundSessionCreate):
    """Create a new playground session."""
    return PlaygroundService.create_session(data)


@router.get("/sessions/{session_id}", response_model=PlaygroundSession)
async def get_session(session_id: str):
    """Get a playground session."""
    session = PlaygroundService.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a playground session."""
    if not PlaygroundService.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "message": "Session deleted"}


class SessionSettingsUpdate(BaseModel):
    """Request to update session settings."""

    name: str | None = None
    agent_id: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    system_prompt: str | None = None
    enabled_tools: list[str] | None = None
    project_id: str | None = None
    working_directory: str | None = None


@router.patch("/sessions/{session_id}/settings", response_model=PlaygroundSession)
async def update_session_settings(session_id: str, data: SessionSettingsUpdate):
    """Update session settings."""
    session = PlaygroundService.update_session_settings(
        session_id,
        name=data.name,
        agent_id=data.agent_id,
        model=data.model,
        temperature=data.temperature,
        max_tokens=data.max_tokens,
        system_prompt=data.system_prompt,
        enabled_tools=data.enabled_tools,
        project_id=data.project_id,
        working_directory=data.working_directory,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/sessions/{session_id}/clear")
async def clear_session_history(session_id: str):
    """Clear conversation history."""
    if not PlaygroundService.clear_session_history(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "message": "History cleared"}


# ─────────────────────────────────────────────────────────────
# Execution
# ─────────────────────────────────────────────────────────────


@router.post("/sessions/{session_id}/execute", response_model=PlaygroundExecution)
async def execute_prompt(session_id: str, request: PlaygroundExecuteRequest):
    """Execute a prompt in the playground."""
    try:
        return await PlaygroundService.execute(session_id, request)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/sessions/{session_id}/execute/stream")
async def execute_prompt_stream(session_id: str, request: PlaygroundExecuteRequest):
    """Execute a prompt with streaming response."""

    async def generate():
        try:
            async for chunk in PlaygroundService.execute_stream(session_id, request):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except ValueError as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
    )


@router.get("/sessions/{session_id}/history", response_model=list[PlaygroundExecution])
async def get_execution_history(
    session_id: str,
    limit: int = Query(default=50, ge=1, le=200),
):
    """Get execution history for a session."""
    return PlaygroundService.get_execution_history(session_id, limit)


# ─────────────────────────────────────────────────────────────
# Tools
# ─────────────────────────────────────────────────────────────


@router.get("/tools")
async def list_available_tools():
    """List available tools for playground."""
    return {"tools": PlaygroundService.get_available_tools()}


@router.post("/tools/test")
async def test_tool(request: PlaygroundToolTest):
    """Test a specific tool."""
    return await PlaygroundService.test_tool(request)


# ─────────────────────────────────────────────────────────────
# Comparison
# ─────────────────────────────────────────────────────────────


@router.post("/compare", response_model=PlaygroundCompareResult)
async def compare_agents(request: PlaygroundCompareRequest):
    """Compare multiple agents on the same prompt."""
    if len(request.agents) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 agents required for comparison",
        )
    if len(request.agents) > 5:
        raise HTTPException(
            status_code=400,
            detail="Maximum 5 agents allowed for comparison",
        )
    return await PlaygroundService.compare(request)


# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────


@router.get("/models")
async def list_available_models():
    """List available models for playground."""
    models = LLMService.get_available_models()
    return {"models": models}
