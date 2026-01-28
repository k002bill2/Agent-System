"""Git data models for team collaboration management."""

from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field
import uuid


# =============================================================================
# Enums
# =============================================================================

class MergeRequestStatus(str, Enum):
    """Status of a merge request."""
    DRAFT = "draft"
    OPEN = "open"
    MERGED = "merged"
    CLOSED = "closed"


class ConflictStatus(str, Enum):
    """Status of merge conflict detection."""
    UNKNOWN = "unknown"
    NO_CONFLICTS = "no_conflicts"
    HAS_CONFLICTS = "has_conflicts"


class ConflictType(str, Enum):
    """Type of file conflict."""
    BOTH_MODIFIED = "both_modified"
    DELETED_BY_US = "deleted_by_us"
    DELETED_BY_THEM = "deleted_by_them"
    BOTH_ADDED = "both_added"
    RENAMED_MODIFIED = "renamed_modified"


class GitPermission(str, Enum):
    """Git-related permissions."""
    READ = "read"
    WRITE = "write"
    MERGE_MAIN = "merge_main"
    ADMIN = "admin"


# =============================================================================
# Branch Models
# =============================================================================

class GitBranch(BaseModel):
    """Branch information."""
    name: str
    is_current: bool = False
    is_remote: bool = False
    is_protected: bool = False
    commit_sha: str
    commit_message: str = ""
    commit_author: str = ""
    commit_date: datetime | None = None
    ahead: int = 0  # commits ahead of base branch
    behind: int = 0  # commits behind base branch
    tracking_branch: str | None = None  # e.g., "origin/main"


class BranchCreateRequest(BaseModel):
    """Request to create a new branch."""
    name: str = Field(..., description="Branch name")
    start_point: str = Field(default="HEAD", description="Starting commit/branch")


class BranchDiff(BaseModel):
    """Diff summary between two branches."""
    source_branch: str
    target_branch: str
    ahead: int  # commits source is ahead of target
    behind: int  # commits source is behind target
    files_changed: int
    insertions: int
    deletions: int


# =============================================================================
# Commit Models
# =============================================================================

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


# =============================================================================
# Merge Request Models (Internal)
# =============================================================================

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
    # Review
    reviewers: list[str] = []  # user IDs
    approved_by: list[str] = []  # user IDs
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
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


class MergeRequestUpdate(BaseModel):
    """Request to update a merge request."""
    title: str | None = None
    description: str | None = None
    status: MergeRequestStatus | None = None
    reviewers: list[str] | None = None


# =============================================================================
# Conflict Models
# =============================================================================

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


# =============================================================================
# Merge Preview & Result Models
# =============================================================================

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


class MergeExecuteRequest(BaseModel):
    """Request to execute a merge."""
    source_branch: str
    target_branch: str = Field(default="main")
    message: str | None = None
    delete_source_branch: bool = False


# =============================================================================
# Remote Operations Models
# =============================================================================

class FetchResult(BaseModel):
    """Result of git fetch operation."""
    success: bool
    remote: str
    branches_updated: list[str] = []
    new_branches: list[str] = []
    message: str = ""


class PullResult(BaseModel):
    """Result of git pull operation."""
    success: bool
    remote: str
    branch: str
    commits_pulled: int = 0
    files_changed: int = 0
    message: str = ""


class PushResult(BaseModel):
    """Result of git push operation."""
    success: bool
    remote: str
    branch: str
    commits_pushed: int = 0
    message: str = ""


# =============================================================================
# GitHub PR Models
# =============================================================================

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
    event: str = Field(
        default="COMMENT",
        description="APPROVE, REQUEST_CHANGES, or COMMENT"
    )


class GitHubMergeRequest(BaseModel):
    """Request to merge a GitHub PR."""
    merge_method: str = Field(
        default="merge",
        description="merge, squash, or rebase"
    )
    commit_title: str | None = None
    commit_message: str | None = None


class GitHubMergeResult(BaseModel):
    """Result of GitHub PR merge."""
    merged: bool
    sha: str | None = None
    message: str


# =============================================================================
# Permission Models
# =============================================================================

# Role-based Git permissions
GIT_ROLE_PERMISSIONS: dict[str, list[GitPermission]] = {
    "owner": [
        GitPermission.READ,
        GitPermission.WRITE,
        GitPermission.MERGE_MAIN,
        GitPermission.ADMIN,
    ],
    "admin": [
        GitPermission.READ,
        GitPermission.WRITE,
        GitPermission.MERGE_MAIN,
    ],
    "member": [
        GitPermission.READ,
        GitPermission.WRITE,
    ],
    "viewer": [
        GitPermission.READ,
    ],
}

# Default protected branches
DEFAULT_PROTECTED_BRANCHES = ["main", "master"]


def has_git_permission(role: str, permission: GitPermission) -> bool:
    """Check if a role has a specific Git permission."""
    permissions = GIT_ROLE_PERMISSIONS.get(role, [])
    return permission in permissions


def can_merge_to_branch(role: str, branch: str, protected_branches: list[str] | None = None) -> bool:
    """Check if a role can merge to a specific branch."""
    if protected_branches is None:
        protected_branches = DEFAULT_PROTECTED_BRANCHES

    if branch in protected_branches:
        return has_git_permission(role, GitPermission.MERGE_MAIN)
    else:
        return has_git_permission(role, GitPermission.WRITE)


# =============================================================================
# API Response Models
# =============================================================================

class BranchListResponse(BaseModel):
    """Response for branch list endpoint."""
    branches: list[GitBranch]
    current_branch: str
    protected_branches: list[str]


class CommitListResponse(BaseModel):
    """Response for commit list endpoint."""
    commits: list[GitCommit]
    branch: str
    total: int


class MergeRequestListResponse(BaseModel):
    """Response for merge request list endpoint."""
    merge_requests: list[MergeRequest]
    total: int


class GitHubPRListResponse(BaseModel):
    """Response for GitHub PR list endpoint."""
    pull_requests: list[GitHubPullRequest]
    total: int


# =============================================================================
# Git Repository Registry Models
# =============================================================================

class GitRepository(BaseModel):
    """Registered Git repository."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., description="Display name for the repository")
    path: str = Field(..., description="Filesystem path to the repository")
    description: str = ""
    is_valid: bool = False  # Whether path is a valid Git repo
    default_branch: str | None = None
    remote_url: str | None = None  # e.g., git@github.com:owner/repo.git
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GitRepositoryCreate(BaseModel):
    """Request to register a Git repository."""
    name: str = Field(..., description="Display name for the repository")
    path: str = Field(..., description="Filesystem path to the repository")
    description: str = ""


class GitRepositoryUpdate(BaseModel):
    """Request to update a Git repository."""
    name: str | None = None
    description: str | None = None
    path: str | None = None


class GitRepositoryListResponse(BaseModel):
    """Response for Git repository list endpoint."""
    repositories: list[GitRepository]
    total: int


# =============================================================================
# Git Repository Registry (In-Memory Storage)
# =============================================================================

GIT_REPOSITORIES: dict[str, GitRepository] = {}


def register_git_repository(name: str, path: str, description: str = "") -> GitRepository:
    """Register a new Git repository."""
    from pathlib import Path
    from services.git_service import get_git_service

    # Normalize path
    normalized_path = str(Path(path).resolve())

    # Check if valid Git repo
    service = get_git_service(normalized_path)
    is_valid = service is not None
    default_branch = None
    remote_url = None

    if service:
        default_branch = service.current_branch
        # Try to get remote URL
        try:
            import subprocess
            result = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=normalized_path,
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                remote_url = result.stdout.strip()
        except Exception:
            pass

    repo = GitRepository(
        name=name,
        path=normalized_path,
        description=description,
        is_valid=is_valid,
        default_branch=default_branch,
        remote_url=remote_url,
    )

    GIT_REPOSITORIES[repo.id] = repo
    return repo


def get_git_repository(repo_id: str) -> GitRepository | None:
    """Get a Git repository by ID."""
    return GIT_REPOSITORIES.get(repo_id)


def list_git_repositories() -> list[GitRepository]:
    """List all registered Git repositories."""
    return list(GIT_REPOSITORIES.values())


def update_git_repository(
    repo_id: str,
    name: str | None = None,
    description: str | None = None,
    path: str | None = None,
) -> GitRepository | None:
    """Update a Git repository."""
    from pathlib import Path
    from services.git_service import get_git_service

    repo = GIT_REPOSITORIES.get(repo_id)
    if not repo:
        return None

    if name is not None:
        repo.name = name
    if description is not None:
        repo.description = description
    if path is not None:
        normalized_path = str(Path(path).resolve())
        repo.path = normalized_path

        # Re-validate
        service = get_git_service(normalized_path)
        repo.is_valid = service is not None
        if service:
            repo.default_branch = service.current_branch

    return repo


def delete_git_repository(repo_id: str) -> bool:
    """Delete a Git repository."""
    if repo_id in GIT_REPOSITORIES:
        del GIT_REPOSITORIES[repo_id]
        return True
    return False
