"""내부 머지 요청(MR) 모델."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from utils.time import utcnow

from .enums import ConflictStatus, MergeRequestStatus


class MergeRequest(BaseModel):
    """Internal merge request for team collaboration."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    title: str
    description: str = ""
    source_branch: str
    target_branch: str
    status: MergeRequestStatus = MergeRequestStatus.OPEN
    author_id: str
    author_name: str
    author_email: str
    conflict_status: ConflictStatus = ConflictStatus.UNKNOWN
    auto_merge: bool = False
    # Review
    reviewers: list[str] = []  # user IDs
    approved_by: list[str] = []  # user IDs
    # Metadata
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    merged_at: datetime | None = None
    merged_by: str | None = None
    closed_at: datetime | None = None
    closed_by: str | None = None


class MergeRequestCreate(BaseModel):
    """Request to create a merge request."""

    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    source_branch: str
    target_branch: str = Field(default="main")
    reviewers: list[str] = []
    auto_merge: bool = False


class MergeRequestUpdate(BaseModel):
    """Request to update a merge request."""

    title: str | None = None
    description: str | None = None
    status: MergeRequestStatus | None = None
    reviewers: list[str] | None = None
    auto_merge: bool | None = None


class MergeRequestListResponse(BaseModel):
    """Response for merge request list endpoint."""

    merge_requests: list[MergeRequest]
    total: int
