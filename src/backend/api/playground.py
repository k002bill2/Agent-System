"""Playground API routes."""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.deps import get_current_user_optional
from api.rag import trigger_background_indexing
from db.models import UserModel
from models.playground import (
    PlaygroundCompareRequest,
    PlaygroundCompareResult,
    PlaygroundExecuteRequest,
    PlaygroundExecution,
    PlaygroundSession,
    PlaygroundSessionCreate,
    PlaygroundToolTest,
)
from models.project import PROJECTS_REGISTRY, get_project
from services.llm_service import LLMService
from services.playground_service import PlaygroundService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/playground", tags=["playground"])


# ─────────────────────────────────────────────────────────────
# Session Management
# ─────────────────────────────────────────────────────────────


@router.get("/sessions", response_model=list[PlaygroundSession])
async def list_sessions(
    current_user: UserModel | None = Depends(get_current_user_optional),
):
    """List playground sessions for the current user."""
    user_id = current_user.id if current_user else None
    return PlaygroundService.list_sessions(user_id=user_id)


@router.post("/sessions", response_model=PlaygroundSession)
async def create_session(
    data: PlaygroundSessionCreate,
    current_user: UserModel | None = Depends(get_current_user_optional),
):
    """Create a new playground session."""
    if current_user:
        data.user_id = current_user.id
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
    rag_enabled: bool | None = None


@router.patch("/sessions/{session_id}/settings", response_model=PlaygroundSession)
async def update_session_settings(
    session_id: str,
    data: SessionSettingsUpdate,
    background_tasks: BackgroundTasks,
):
    """Update session settings. Auto-triggers indexing when RAG is enabled."""
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
        rag_enabled=data.rag_enabled,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Auto-trigger indexing when RAG is enabled and project is not yet indexed
    if data.rag_enabled and session.project_id:
        project = get_project(session.project_id)
        if project and not (
            PROJECTS_REGISTRY.get(session.project_id)
            and PROJECTS_REGISTRY[session.project_id].vector_store_initialized
        ):
            trigger_background_indexing(
                project_id=project.id,
                project_path=project.path,
                background_tasks=background_tasks,
            )
            logger.info(
                "Auto-triggered indexing for project '%s' on RAG enable",
                session.project_id,
            )

    return session


@router.delete("/sessions/{session_id}/messages/{message_id}")
async def delete_message(session_id: str, message_id: str):
    """Delete a specific message from a session."""
    if not PlaygroundService.delete_message(session_id, message_id):
        raise HTTPException(status_code=404, detail="Session or message not found")
    return {"success": True, "message": "Message deleted"}


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
