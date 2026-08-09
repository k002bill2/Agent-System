"""브랜치·브랜치 보호·prune 모델."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from utils.time import utcnow


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


class BranchProtectionRule(BaseModel):
    """Branch protection rule."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    branch_pattern: str = Field(..., description="Branch pattern, e.g. 'main', 'release/*'")
    require_approvals: int = Field(default=0, ge=0)
    require_no_conflicts: bool = True
    allowed_merge_roles: list[str] = Field(default_factory=lambda: ["owner", "admin"])
    allow_force_push: bool = False
    allow_deletion: bool = False
    auto_deploy: bool = False
    deploy_workflow: str | None = None
    enabled: bool = True
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class BranchProtectionRuleCreate(BaseModel):
    """Request to create a branch protection rule."""

    branch_pattern: str = Field(..., min_length=1, max_length=200)
    require_approvals: int = Field(default=0, ge=0)
    require_no_conflicts: bool = True
    allowed_merge_roles: list[str] = Field(default_factory=lambda: ["owner", "admin"])
    allow_force_push: bool = False
    allow_deletion: bool = False
    auto_deploy: bool = False
    deploy_workflow: str | None = None
    enabled: bool = True


class BranchProtectionRuleUpdate(BaseModel):
    """Request to update a branch protection rule."""

    branch_pattern: str | None = None
    require_approvals: int | None = Field(default=None, ge=0)
    require_no_conflicts: bool | None = None
    allowed_merge_roles: list[str] | None = None
    allow_force_push: bool | None = None
    allow_deletion: bool | None = None
    auto_deploy: bool | None = None
    deploy_workflow: str | None = None
    enabled: bool | None = None


class BranchProtectionListResponse(BaseModel):
    """Response for branch protection list endpoint."""

    rules: list[BranchProtectionRule]
    total: int


class PruneCandidate(BaseModel):
    """A local branch eligible for prune (matching merged PR + passes safety checks)."""

    branch: str
    pr_number: int
    pr_url: str
    pr_title: str
    merged_at: datetime
    last_commit_sha: str


class PruneSkipped(BaseModel):
    """A local branch excluded from prune with a reason.

    Reason codes (stable contract for UI):
      - default_branch     : main/master/develop
      - current_head       : the active HEAD branch
      - unpushed_commits   : local commits not present on origin
      - no_matching_pr     : no merged PR matches branch name
      - protected_rule     : matched a BranchProtectionRule pattern
    """

    branch: str
    reason: str


class PruneScanResult(BaseModel):
    """Dry-run result: what would be deleted vs skipped."""

    candidates: list[PruneCandidate] = []
    skipped: list[PruneSkipped] = []
    # Populated when the GitHub PR lookup itself failed (e.g. repo unresolved,
    # bad token, network). Distinguishes a real failure from "nothing to prune".
    scan_error: str | None = None


class PruneExecuteResult(BaseModel):
    """Actual deletion result, extending scan with deletion outcomes."""

    candidates: list[PruneCandidate] = []
    skipped: list[PruneSkipped] = []
    deleted: list[str] = []
    errors: list[dict] = []  # [{"branch": str, "error": str}]
    scan_error: str | None = None  # mirrors PruneScanResult.scan_error


class PruneRequest(BaseModel):
    """API request body for POST /branches/prune-merged."""

    dry_run: bool = True
    extra_protected: list[str] = []


class BranchListResponse(BaseModel):
    """Response for branch list endpoint."""

    branches: list[GitBranch]
    current_branch: str
    protected_branches: list[str]
