"""머지 미리보기·결과·충돌 해결 모델."""

from pydantic import BaseModel, Field

from .enums import ConflictStatus, ConflictType, ResolutionStrategy


class ConflictMarker(BaseModel):
    """Location of conflict marker in a file."""

    start_line: int
    end_line: int
    ours_start: int
    ours_end: int
    theirs_start: int
    theirs_end: int
    base_start: int | None = None  # for 3-way merge
    base_end: int | None = None


class ConflictFile(BaseModel):
    """Detailed conflict information for a file."""

    path: str
    conflict_type: ConflictType
    markers: list[ConflictMarker] = []
    our_content: str = ""
    their_content: str = ""
    base_content: str = ""  # common ancestor


class ThreeWayDiff(BaseModel):
    """Three-way diff for conflict resolution."""

    path: str
    base_content: str  # common ancestor
    ours_content: str  # target branch
    theirs_content: str  # source branch
    merged_content: str | None = None  # auto-merged if possible


class MergePreview(BaseModel):
    """Result of merge dry-run."""

    source_branch: str
    target_branch: str
    can_merge: bool
    conflict_status: ConflictStatus
    conflicting_files: list[str] = []
    files_changed: int = 0
    insertions: int = 0
    deletions: int = 0
    commits_to_merge: int = 0


class MergeResult(BaseModel):
    """Result of merge execution."""

    success: bool
    merge_commit_sha: str | None = None
    message: str
    source_branch: str
    target_branch: str


class ConflictResolutionRequest(BaseModel):
    """Request to resolve a single file conflict."""

    file_path: str = Field(..., description="Path to the conflicting file")
    strategy: ResolutionStrategy = Field(..., description="Resolution strategy")
    resolved_content: str | None = Field(
        None, description="Resolved content (required when strategy is CUSTOM)"
    )
    source_branch: str = Field(..., description="Source branch name")
    target_branch: str = Field(..., description="Target branch name")


class ConflictResolutionResult(BaseModel):
    """Result of conflict resolution for a single file."""

    success: bool
    file_path: str
    message: str
    resolved_content: str | None = None


class MergeAbortResult(BaseModel):
    """Result of merge abort operation."""

    success: bool
    message: str


class MergeExecuteRequest(BaseModel):
    """Request to execute a merge."""

    source_branch: str
    target_branch: str = Field(default="main")
    message: str | None = None
    delete_source_branch: bool = False
