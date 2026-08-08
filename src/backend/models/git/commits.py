"""커밋·draft 커밋 모델."""

from datetime import datetime

from pydantic import BaseModel, Field


class GitCommit(BaseModel):
    """Git commit information."""

    sha: str
    short_sha: str
    message: str
    author_name: str
    author_email: str
    authored_date: datetime
    committer_name: str
    committer_email: str
    committed_date: datetime
    parent_shas: list[str] = []


class CommitFile(BaseModel):
    """File changed in a commit."""

    path: str
    status: str  # added, modified, deleted, renamed
    additions: int = 0
    deletions: int = 0
    old_path: str | None = None  # for renamed files


class CommitCreateRequest(BaseModel):
    """Request to create a commit."""

    message: str = Field(..., min_length=1, description="Commit message")
    author_name: str | None = None
    author_email: str | None = None


class CommitCreateResult(BaseModel):
    """Result of git commit operation."""

    success: bool
    commit_sha: str | None = None
    message: str = ""
    files_committed: int = 0


class DraftCommit(BaseModel):
    """LLM-generated commit suggestion."""

    message: str = Field(..., description="Conventional commit message")
    files: list[str] = Field(..., description="Files included in this commit")
    type: str = Field(..., description="Commit type: feat, fix, docs, refactor, test, chore, style")
    scope: str | None = Field(None, description="Commit scope (optional)")


class DraftCommitsRequest(BaseModel):
    """Request to generate draft commits."""

    staged_only: bool = Field(default=False, description="Only analyze staged files")


class DraftCommitsResponse(BaseModel):
    """Response containing LLM-generated draft commits."""

    drafts: list[DraftCommit]
    total_files: int
    token_usage: int | None = None


class CommitListResponse(BaseModel):
    """Response for commit list endpoint."""

    commits: list[GitCommit]
    branch: str
    total: int
