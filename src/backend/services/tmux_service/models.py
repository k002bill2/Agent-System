"""tmux 세션 정보와 Claude CLI 인증 상태 스키마 (Pydantic)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ClaudeAuthStatus(BaseModel):
    """Claude CLI 인증 상태."""

    authenticated: bool
    has_credits: bool
    error: str = ""
    message: str = ""


class TmuxSessionInfo(BaseModel):
    """tmux 세션 정보."""

    session_name: str
    analysis_id: str
    project_path: str
    active: bool
    started_at: datetime
    task_input: str = ""
    usage_context: dict[str, Any] = Field(default_factory=dict)
    completion_recorded: bool = False
    completed_at: datetime | None = None
    transcript_path: str | None = None
