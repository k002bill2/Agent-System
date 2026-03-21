"""Warp Terminal Integration API routes.

Open projects in Warp terminal, check status, cleanup configs.
"""

import os
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from models.project import get_project
from services.warp_service import get_warp_service

# Docker mode: skip host filesystem validations
IS_DOCKER = bool(os.getenv("CLAUDE_HOME"))

router = APIRouter(tags=["orchestration"])


class WarpOpenRequest(BaseModel):
    """Request to open a project in Warp terminal."""

    project_id: str = Field(..., description="Project ID to open")
    command: str | None = Field(None, description="Optional command to execute")
    title: str | None = Field(None, description="Optional tab title")
    new_window: bool = Field(True, description="Open in new window (default) or new tab")
    use_claude_cli: bool = Field(
        False, description="Wrap command with claude --dangerously-skip-permissions"
    )
    image_paths: list[str] | None = Field(
        None, description="Image file paths to pass to Claude CLI via --image flags"
    )
    branch_name: str | None = Field(
        None, description="Feature branch to create before execution (git checkout -b)"
    )

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


class WarpOpenResponse(BaseModel):
    """Response from Warp open request."""

    success: bool
    message: str | None = None
    error: str | None = None
    uri: str | None = None
    open_via_frontend: bool = False
    opened_as: str | None = None  # "tab" or "window"


@router.post("/warp/open", response_model=WarpOpenResponse)
async def open_in_warp(request: WarpOpenRequest):
    """
    Open a project in Warp terminal.

    If use_claude_cli is True, the command (or interactive mode) will be wrapped
    with `claude --dangerously-skip-permissions`.

    If a command is provided without use_claude_cli, it will be executed directly.
    Without any command, Warp will simply open a new window/tab at the project path.
    """
    # Get project
    project = get_project(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{request.project_id}' not found")

    warp = get_warp_service()

    # Check if Warp is installed
    if not warp.is_warp_installed():
        return WarpOpenResponse(
            success=False,
            error="Warp terminal is not installed. Please install from https://warp.dev",
        )

    # Build the actual command
    if request.use_claude_cli:
        # Two-phase: start Claude interactively, then inject task via expect
        actual_command = warp.build_claude_command(
            task=request.command,  # None -> interactive mode, string -> expect inject
            image_paths=request.image_paths,
        )
        tab_title = request.title or "Claude CLI"
    else:
        actual_command = request.command
        tab_title = request.title

    # Open Warp with or without command
    if actual_command:
        result = warp.open_with_command(
            path=project.path,
            command=actual_command,
            title=tab_title,
            new_window=request.new_window,
            branch_name=request.branch_name,
        )
    else:
        result = warp.open_path(
            path=project.path,
            new_window=request.new_window,
        )

    return WarpOpenResponse(
        success=result.get("success", False),
        message=result.get("message"),
        error=result.get("error"),
        uri=result.get("uri"),
        open_via_frontend=result.get("open_via_frontend", False),
        opened_as=result.get("opened_as"),
    )


@router.get("/warp/status")
async def warp_status():
    """Check Warp terminal installation status."""
    warp = get_warp_service()
    installed = warp.is_warp_installed()

    return {
        "installed": installed,
        "message": "Warp is installed" if installed else "Warp is not installed",
        "docker_mode": IS_DOCKER,
    }


@router.post("/warp/cleanup")
async def warp_cleanup(max_age_hours: int = 24):
    """
    Clean up old AOS launch configurations.

    Args:
        max_age_hours: Remove configs older than this many hours (default: 24)
    """
    warp = get_warp_service()
    removed = warp.cleanup_old_configs(max_age_hours)

    return {
        "success": True,
        "removed_count": removed,
        "message": f"Removed {removed} old launch configuration(s)",
    }
