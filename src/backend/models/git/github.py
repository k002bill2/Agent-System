"""GitHub PR 연동 모델."""

from datetime import datetime

from pydantic import BaseModel, Field


class GitHubPullRequest(BaseModel):
    """GitHub Pull Request information."""

    number: int
    title: str
    body: str = ""
    state: str  # open, closed
    draft: bool = False
    mergeable: bool | None = None
    mergeable_state: str | None = None  # clean, dirty, blocked, etc.
    # Branches
    head_ref: str  # source branch
    head_sha: str
    base_ref: str  # target branch
    base_sha: str
    # Author
    user_login: str
    user_avatar_url: str | None = None
    # URLs
    html_url: str
    diff_url: str
    # Stats
    commits: int = 0
    additions: int = 0
    deletions: int = 0
    changed_files: int = 0
    # Reviews
    review_comments: int = 0
    # Labels
    labels: list[str] = []
    # Timestamps
    created_at: datetime
    updated_at: datetime
    merged_at: datetime | None = None
    closed_at: datetime | None = None


class GitHubPRReview(BaseModel):
    """GitHub Pull Request review."""

    id: int
    user_login: str
    user_avatar_url: str | None = None
    state: str  # APPROVED, CHANGES_REQUESTED, COMMENTED, PENDING
    body: str = ""
    submitted_at: datetime | None = None
    commit_id: str | None = None


class GitHubPRReviewCreate(BaseModel):
    """Request to create a PR review."""

    body: str = ""
    event: str = Field(default="COMMENT", description="APPROVE, REQUEST_CHANGES, or COMMENT")


class GitHubMergeRequest(BaseModel):
    """Request to merge a GitHub PR."""

    merge_method: str = Field(default="merge", description="merge, squash, or rebase")
    commit_title: str | None = None
    commit_message: str | None = None


class GitHubMergeResult(BaseModel):
    """Result of GitHub PR merge."""

    merged: bool
    sha: str | None = None
    message: str


class GitHubPRListResponse(BaseModel):
    """Response for GitHub PR list endpoint."""

    pull_requests: list[GitHubPullRequest]
    total: int
