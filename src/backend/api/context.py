"""Context API routes.

Project context (CLAUDE.md, dev docs) and context window usage meter.
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_engine
from models.context_usage import ContextUsage, get_context_limit
from models.project import get_project
from orchestrator import OrchestrationEngine

router = APIRouter(tags=["orchestration"])


# ─────────────────────────────────────────────────────────────
# Project Context Models
# ─────────────────────────────────────────────────────────────


class DevDocFile(BaseModel):
    """A file in dev/active folder."""

    name: str
    path: str
    content: str
    modified_at: str


class ProjectContextResponse(BaseModel):
    """Full project context response."""

    project_id: str
    project_name: str
    project_path: str
    claude_md: str | None
    dev_docs: list[DevDocFile]
    session_info: dict | None = None


# ─────────────────────────────────────────────────────────────
# Project Context Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/context", response_model=ProjectContextResponse)
async def get_project_context(
    project_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Get full project context including:
    - CLAUDE.md content
    - Dev docs from dev/active folder
    - Current session info (if active)
    """
    from datetime import datetime
    from pathlib import Path

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get dev docs from dev/active folder
    dev_docs: list[DevDocFile] = []
    project_path = Path(project.path)
    dev_active_path = project_path / "dev" / "active"

    if dev_active_path.exists():
        for file_path in dev_active_path.glob("*.md"):
            try:
                stat = file_path.stat()
                content = file_path.read_text(encoding="utf-8")
                dev_docs.append(
                    DevDocFile(
                        name=file_path.name,
                        path=str(file_path),
                        content=content,
                        modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    )
                )
            except Exception:
                pass  # Skip files that can't be read

    # Sort by modified time, most recent first
    dev_docs.sort(key=lambda x: x.modified_at, reverse=True)

    # Get current session info if available
    session_info = None

    # Check if there's an active session for this project
    for session_id, state in engine._sessions.items():
        if state.get("project_id") == project_id:
            session_info = {
                "session_id": session_id,
                "tasks_count": len(state.get("tasks", {})),
                "agents_count": len(state.get("agents", {})),
                "iteration_count": state.get("iteration_count", 0),
                "current_task_id": state.get("current_task_id"),
            }
            break

    return ProjectContextResponse(
        project_id=project.id,
        project_name=project.name,
        project_path=project.path,
        claude_md=project.claude_md,
        dev_docs=dev_docs,
        session_info=session_info,
    )


@router.get("/projects/{project_id}/claude-md")
async def get_project_claude_md(project_id: str):
    """Get raw CLAUDE.md content for a project."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.claude_md:
        raise HTTPException(status_code=404, detail="No CLAUDE.md found for this project")

    return {"content": project.claude_md}


# ─────────────────────────────────────────────────────────────
# Context Window Meter
# ─────────────────────────────────────────────────────────────


def _estimate_tokens(text: str) -> int:
    """Estimate token count from text (~4 characters per token)."""
    if not text:
        return 0
    return len(text) // 4


def _calculate_session_context_usage(
    state: dict,
    provider: str = "unknown",
    model: str = "unknown",
) -> ContextUsage:
    """Calculate context usage from session state."""
    max_tokens = get_context_limit(provider, model)

    # Estimate tokens for different components
    system_tokens = 1000  # Base system prompt estimate
    message_tokens = 0
    task_tokens = 0
    rag_tokens = 0

    # Messages
    messages = state.get("messages", [])
    for msg in messages:
        if isinstance(msg, dict):
            content = msg.get("content", "")
            if isinstance(content, str):
                message_tokens += _estimate_tokens(content)
        elif hasattr(msg, "content"):
            message_tokens += _estimate_tokens(str(msg.content))

    # Tasks
    tasks = state.get("tasks", {})
    for task in tasks.values():
        if hasattr(task, "title"):
            task_tokens += _estimate_tokens(task.title)
            task_tokens += _estimate_tokens(task.description)
            if task.result:
                task_tokens += _estimate_tokens(str(task.result))
            if task.error:
                task_tokens += _estimate_tokens(task.error)
        elif isinstance(task, dict):
            task_tokens += _estimate_tokens(task.get("title", ""))
            task_tokens += _estimate_tokens(task.get("description", ""))
            if task.get("result"):
                task_tokens += _estimate_tokens(str(task["result"]))
            if task.get("error"):
                task_tokens += _estimate_tokens(task["error"])

    # RAG context
    context = state.get("context", {})
    rag_context = context.get("rag_context", "")
    if rag_context:
        rag_tokens = _estimate_tokens(str(rag_context))

    current_tokens = system_tokens + message_tokens + task_tokens + rag_tokens

    return ContextUsage.calculate(
        current_tokens=current_tokens,
        max_tokens=max_tokens,
        provider=provider,
        model=model,
        system_tokens=system_tokens,
        message_tokens=message_tokens,
        task_tokens=task_tokens,
        rag_tokens=rag_tokens,
    )


@router.get("/sessions/{session_id}/context-usage", response_model=ContextUsage)
async def get_context_usage(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Get context window usage for a session.

    Returns:
    - current_tokens: Current tokens in context
    - max_tokens: Maximum context window size
    - percentage: Usage percentage (0-100)
    - level: Warning level (normal, warning, critical)
    - Breakdown by component (system, messages, tasks, RAG)
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get provider/model from environment
    provider = os.getenv("LLM_PROVIDER", "google")

    if provider == "google":
        model = os.getenv("GOOGLE_MODEL", "gemini-3-flash-preview")
    elif provider == "anthropic":
        model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    elif provider == "openai":
        model = os.getenv("OPENAI_MODEL", "gpt-4o")
    elif provider == "ollama":
        model = os.getenv("OLLAMA_MODEL", "exaone3.5:7.8b")
    else:
        model = "unknown"

    return _calculate_session_context_usage(state, provider, model)
