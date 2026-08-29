"""Context API routes.

Project context (CLAUDE.md, dev docs) and context window usage meter.
"""

import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import (
    get_current_user,
    get_db_session,
    get_engine,
    reject_legacy_project_operation_in_database_mode,
    require_project_role,
)
from models.context_usage import ContextUsage, get_context_limit
from models.project import Project, get_project
from orchestrator import OrchestrationEngine

router = APIRouter(tags=["orchestration"])

# Returned when an authorized database-mode project carries no readable
# directory. Kept distinct from the generic dependency-failure detail so the
# two 503 causes stay separable by callers and by tests. Mirrors
# ``api/diagnostics.NO_DIAGNOSTIC_PATH_DETAIL``.
NO_CONTEXT_PATH_DETAIL = "Project has no registered filesystem path for context"


def _use_database() -> bool:
    return os.getenv("USE_DATABASE", "false").lower() == "true"


async def _resolve_database_project(project_id: str, db) -> Project | None:
    """Resolve the canonical DB project row into a readable context target.

    Only ``ProjectModel.id`` is matched — the path-derived identifiers used by
    the legacy filesystem registry are deliberately not accepted, so they
    cannot reach the filesystem through the context surface.

    Returns ``None`` when the registration has no usable directory. The caller
    keeps that fail-closed instead of guessing a path.
    """
    from sqlalchemy import select

    from db.models import ProjectModel

    try:
        result = await db.execute(
            select(ProjectModel).where(
                ProjectModel.id == project_id,
                ProjectModel.is_active == True,  # noqa: E712
            )
        )
        row = result.scalar_one_or_none()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project context is temporarily unavailable",
        ) from exc

    if row is None:
        return None

    path = str(row.path or "").strip()
    if not path or not Path(path).is_dir():
        return None

    # `Project.from_path` 로 구성한다 — CLAUDE.md 본문과 `.aos-project.json`
    # 메타데이터를 읽는 유일한 생성자다. 필드를 손으로 옮기면 `claude_md` 가
    # 항상 None 이 되어 패널이 조용히 빈 화면이 된다.
    project = Project.from_path(str(row.id), path)

    # 이름·설명의 권위는 DB 행이다.
    return project.model_copy(update={"name": row.name, "description": row.description or ""})


async def _context_target(project_id: str, db) -> Project:
    """Resolve the read project *after* the caller has authorized access.

    Database mode reads the DB registry, which is authoritative for both
    identity and path. Filesystem mode keeps the legacy registry lookup behind
    ``reject_legacy_project_operation_in_database_mode`` — that guard is
    unreachable from here in database mode by construction, and is kept as a
    standing assertion that the legacy branch never runs in that mode.
    """
    if _use_database():
        resolved = await _resolve_database_project(project_id, db)
        if resolved is None:
            raise HTTPException(status_code=503, detail=NO_CONTEXT_PATH_DETAIL)
        return resolved

    reject_legacy_project_operation_in_database_mode()
    legacy = get_project(project_id)
    if not legacy:
        raise HTTPException(status_code=404, detail="Project not found")
    return legacy


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
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
):
    """
    Get full project context including:
    - CLAUDE.md content
    - Dev docs from dev/active folder
    - Current session info (if active)
    """
    from datetime import UTC, datetime

    await require_project_role(project_id, current_user, db, min_role="viewer")
    project = await _context_target(project_id, db)

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
                        modified_at=datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
                    )
                )
            except Exception:
                pass  # Skip files that can't be read

    # Sort by modified time, most recent first
    dev_docs.sort(key=lambda x: x.modified_at, reverse=True)

    # Get current session info if available
    session_info = None

    # Check if there's an active session for this project.
    #
    # 엔진 캐시(`engine._sessions`)를 직접 순회하면 만료된 세션이 걸러지지 않는다.
    # 서비스 목록으로 후보를 찾고 `engine.get_session` 으로 다시 읽어 만료 검사를
    # 거치게 한다. 프로젝트 필터는 `list_sessions` 에 넘긴다 — 여기서 걸러내면
    # 서비스의 `limit` 이 먼저 적용돼 대상 세션이 잘려 나간다.
    #
    # 아래 `project_id` 재확인은 중복이지만 남긴다. 서비스가 필터를 놓치면 이
    # 엔드포인트가 *다른 프로젝트의* 세션을 내주게 되고, 그건 누락보다 나쁘다.
    sessions = await engine.session_service.list_sessions(project_id=project_id)
    for candidate in (s for s in sessions if s.get("project_id") == project_id):
        # 목록에는 만료된 항목도 남아 있다 — 살아 있는 첫 세션을 찾을 때까지 본다.
        state = await engine.get_session(candidate["id"])
        if not state:
            continue
        session_info = {
            "session_id": candidate["id"],
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
async def get_project_claude_md(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
):
    """Get raw CLAUDE.md content for a project."""
    await require_project_role(project_id, current_user, db, min_role="viewer")
    project = await _context_target(project_id, db)

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

    # Get provider/model from registry
    from config import get_model_for_provider, get_settings

    provider = os.getenv("LLM_PROVIDER", get_settings().llm_provider)
    model = get_model_for_provider(provider)

    return _calculate_session_context_usage(state, provider, model)
