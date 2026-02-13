"""Workflow artifact models."""

from datetime import datetime

from pydantic import BaseModel


class ArtifactCreate(BaseModel):
    name: str
    path: str
    content_type: str = "application/octet-stream"
    retention_days: int = 30


class ArtifactResponse(BaseModel):
    id: str
    run_id: str
    job_id: str | None
    step_id: str | None
    name: str
    path: str
    size_bytes: int
    content_type: str
    retention_days: int
    expires_at: datetime | None
    created_at: datetime


class ArtifactListResponse(BaseModel):
    artifacts: list[ArtifactResponse]
    total: int
