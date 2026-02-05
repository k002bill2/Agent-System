"""
Task Analysis Pydantic models

태스크 분석 히스토리를 위한 요청/응답 모델
"""

from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class TaskAnalysisEntry(BaseModel):
    """개별 태스크 분석 항목."""

    id: str
    project_id: str | None = None
    user_id: str | None = None
    task_input: str
    context: dict[str, Any] | None = None
    success: bool
    analysis: dict[str, Any] | None = None
    error: str | None = None
    execution_time_ms: int = 0
    complexity_score: int | None = None
    effort_level: str | None = None
    subtask_count: int | None = None
    strategy: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class TaskAnalysisListResponse(BaseModel):
    """태스크 분석 목록 응답."""

    items: list[TaskAnalysisEntry]
    total: int
    has_more: bool


class TaskAnalysisSaveRequest(BaseModel):
    """분석 결과 저장 요청 (내부용)."""

    task_input: str
    context: dict[str, Any] | None = None
    project_id: str | None = None
    user_id: str | None = None
    success: bool
    analysis: dict[str, Any] | None = None
    error: str | None = None
    execution_time_ms: int = 0


class TaskAnalysisQueryParams(BaseModel):
    """분석 히스토리 조회 파라미터."""

    project_id: str | None = None
    user_id: str | None = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
