"""Terminal Integration API routes.

Generic terminal execution supporting 8 terminal types.
Complements the Warp-specific routes in ``api.warp``.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from models.project import get_project
from services.terminal_service import (
    TERMINAL_INFO,
    TerminalType,
    get_terminal_service,
)

router = APIRouter(tags=["terminal"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class TerminalExecuteRequest(BaseModel):
    """Request to execute a command in a specific terminal."""

    terminal: str = Field(..., description="Terminal type to use")
    project_id: str = Field(..., description="Project ID")
    command: str = Field(..., description="Command/prompt to execute")
    title: str | None = Field(None, description="Optional window/tab title")
    branch_name: str | None = Field(
        None, description="Git branch to create before execution"
    )
    image_paths: list[str] | None = Field(
        None, description="Image paths for --image flags"
    )
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

    service = get_terminal_service()
    adapter = service.get_adapter(terminal_type)

    # Check availability before attempting execution
    if not await adapter.is_available():
        info = TERMINAL_INFO[terminal_type]
        return TerminalExecuteResponse(
            success=False,
            terminal=request.terminal,
            error=f"{info['name']} is not installed",
        )

    result = await adapter.execute(
        project_path=project.path,
        command=request.command,
        title=request.title,
        branch_name=request.branch_name,
        image_paths=request.image_paths,
    )

    return TerminalExecuteResponse(
        success=result.get("success", False),
        terminal=result.get("terminal", request.terminal),
        message=result.get("message"),
        error=result.get("error"),
    )
