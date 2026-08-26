"""Terminal Integration API routes.

Generic terminal execution supporting 9 terminal types.
Complements the Warp-specific routes in ``api.warp``.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from api.deps import get_current_admin_or_manager_user, get_current_user
from db.models import UserModel
from models.project import get_project
from services.audit_service import AuditAction, AuditService, ResourceType
from services.terminal_service import (
    TERMINAL_INFO,
    TerminalType,
    get_terminal_service,
)

router = APIRouter(tags=["terminal"], dependencies=[Depends(get_current_user)])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class TerminalExecuteRequest(BaseModel):
    """Request to execute a command in a specific terminal."""

    terminal: str = Field(..., description="Terminal type to use")
    project_id: str = Field(..., description="Project ID")
    command: str = Field(..., description="Command/prompt to execute")
    title: str | None = Field(None, description="Optional window/tab title")
    branch_name: str | None = Field(None, description="Git branch to create before execution")
    image_paths: list[str] | None = Field(None, description="Image paths for --image flags")
    use_claude_cli: bool = Field(True, description="Wrap with claude CLI")

    @field_validator("branch_name")
    @classmethod
    def validate_branch_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not re.match(r"^[a-zA-Z0-9/_.-]+$", v):
            raise ValueError("Branch name contains invalid characters")
        if len(v) > 100:
            raise ValueError("Branch name too long (max 100)")
        return v


class TerminalExecuteResponse(BaseModel):
    """Response from terminal execute request."""

    success: bool
    terminal: str
    message: str | None = None
    error: str | None = None


def _sanitize_terminal_error(error_message: str | None) -> str | None:
    """Keep audit errors bounded to a type/category, never adapter text."""
    if not error_message:
        return None
    if error_message in {
        "adapter_unavailable",
        "adapter_error",
        "execution_error",
    }:
        return error_message
    return "adapter_error"


def _log_terminal_execution(
    request: TerminalExecuteRequest,
    operator: UserModel,
    *,
    status: str,
    error_message: str | None = None,
) -> None:
    """Audit terminal execution without persisting the command contents."""
    AuditService.log(
        action=AuditAction.TOOL_EXECUTED,
        resource_type=ResourceType.TOOL,
        resource_id=request.terminal,
        project_id=request.project_id,
        user_id=operator.id,
        status=status,
        error_message=_sanitize_terminal_error(error_message),
        metadata={
            "terminal": request.terminal,
            "command_length": len(request.command),
            "use_claude_cli": request.use_claude_cli,
            "branch_name_provided": request.branch_name is not None,
        },
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/terminal/available")
async def get_available_terminals() -> dict:
    """Return a list of all terminal types and their availability."""
    service = get_terminal_service()
    terminals = await service.detect_available()
    return {"terminals": terminals}


@router.post("/terminal/execute", response_model=TerminalExecuteResponse)
async def execute_in_terminal(
    request: TerminalExecuteRequest,
    _operator: UserModel = Depends(get_current_admin_or_manager_user),
) -> TerminalExecuteResponse:
    """Execute a command/prompt in the selected terminal.

    The command is wrapped with ``claude --dangerously-skip-permissions``
    by default (``use_claude_cli=True``).  If a ``branch_name`` is
    provided the adapter will run ``git checkout -b`` first.
    """
    # Validate terminal type
    try:
        terminal_type = TerminalType(request.terminal)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown terminal type: {request.terminal}",
        )

    # Resolve project path
    project = get_project(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        service = get_terminal_service()
        adapter = service.get_adapter(terminal_type)
        available = await adapter.is_available()
    except Exception:
        _log_terminal_execution(
            request,
            _operator,
            status="failed",
            error_message="adapter_error",
        )
        raise

    # Check availability before attempting execution
    if not available:
        _log_terminal_execution(
            request,
            _operator,
            status="failed",
            error_message="adapter_unavailable",
        )
        info = TERMINAL_INFO[terminal_type]
        return TerminalExecuteResponse(
            success=False,
            terminal=request.terminal,
            error=f"{info['name']} is not installed",
        )

    try:
        result = await adapter.execute(
            project_path=project.path,
            command=request.command,
            title=request.title,
            branch_name=request.branch_name,
            image_paths=request.image_paths,
        )
        if not isinstance(result, dict):
            raise TypeError("terminal adapter returned an invalid result")

        success = result.get("success", False)
        _log_terminal_execution(
            request,
            _operator,
            status="success" if success else "failed",
            error_message=result.get("error"),
        )

        return TerminalExecuteResponse(
            success=success,
            terminal=result.get("terminal", request.terminal),
            message=result.get("message"),
            error=result.get("error"),
        )
    except Exception:
        _log_terminal_execution(
            request,
            _operator,
            status="failed",
            error_message="execution_error",
        )
        raise
