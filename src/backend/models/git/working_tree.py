"""워킹트리·스테이징 영역 모델."""

from pydantic import BaseModel, Field

from .enums import FileStatusType


class GitWorktree(BaseModel):
    """Git worktree information."""

    path: str
    branch: str | None = None
    head_sha: str = ""
    is_main: bool = False
    is_detached: bool = False
    is_locked: bool = False


class GitWorktreeListResponse(BaseModel):
    """Response for worktree list endpoint."""

    worktrees: list[GitWorktree]
    total: int


class GitStatusFile(BaseModel):
    """File status in working directory."""

    path: str
    status: FileStatusType
    staged: bool = False  # Whether file is staged
    old_path: str | None = None  # For renamed files


class GitWorkingStatus(BaseModel):
    """Git working directory status."""

    branch: str
    is_clean: bool
    staged_files: list[GitStatusFile] = []
    unstaged_files: list[GitStatusFile] = []
    untracked_files: list[GitStatusFile] = []
    total_changes: int = 0


class AddRequest(BaseModel):
    """Request to stage files."""

    paths: list[str] = Field(
        default=[], description="File paths to stage. Empty list means all ('.')"
    )
    all: bool = Field(default=False, description="Stage all changes (git add -A)")


class AddResult(BaseModel):
    """Result of git add operation."""

    success: bool
    staged_files: list[str] = []
    message: str = ""


class UnstageRequest(BaseModel):
    """Request to unstage files."""

    paths: list[str] = Field(default=[], description="File paths to unstage. Empty list means all.")
    all: bool = Field(default=False, description="Unstage all files (git reset HEAD)")


class FileDiffResponse(BaseModel):
    """Response containing diff for a single file."""

    file_path: str
    diff: str
    staged: bool = False


class DiffHunk(BaseModel):
    """A single hunk from a diff."""

    index: int
    header: str
    content: str
    old_start: int = 0
    old_count: int = 0
    new_start: int = 0
    new_count: int = 0


class FileHunksResponse(BaseModel):
    """Response containing hunks for a single file."""

    file_path: str
    hunks: list[DiffHunk] = []
    total_hunks: int = 0


class StageHunksRequest(BaseModel):
    """Request to stage specific hunks of a file."""

    file_path: str = Field(..., description="File path to stage hunks from")
    hunk_indices: list[int] = Field(..., description="Indices of hunks to stage")
