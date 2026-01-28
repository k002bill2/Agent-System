"""Git API endpoints for team collaboration management."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Depends

from models.project import get_project
from models.git import (
    # Branch models
    GitBranch,
    BranchCreateRequest,
    BranchDiff,
    BranchListResponse,
    # Commit models
    GitCommit,
    CommitFile,
    CommitListResponse,
    # Merge models
    MergePreview,
    MergeResult,
    MergeExecuteRequest,
    ConflictFile,
    ThreeWayDiff,
    # Merge Request models
    MergeRequest,
    MergeRequestCreate,
    MergeRequestUpdate,
    MergeRequestStatus,
    MergeRequestListResponse,
    # GitHub models
    GitHubPullRequest,
    GitHubPRReview,
    GitHubPRReviewCreate,
    GitHubMergeRequest,
    GitHubMergeResult,
    GitHubPRListResponse,
    # Remote operation models
    FetchResult,
    PullResult,
    PushResult,
    # Permission helpers
    can_merge_to_branch,
    DEFAULT_PROTECTED_BRANCHES,
    # Git Repository models
    GitRepository,
    GitRepositoryCreate,
    GitRepositoryUpdate,
    GitRepositoryListResponse,
    register_git_repository,
    get_git_repository,
    list_git_repositories,
    update_git_repository,
    delete_git_repository,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/git", tags=["git"])


# =============================================================================
# Dependencies
# =============================================================================

def get_effective_git_path(project) -> str:
    """Get the effective Git path for a project."""
    return project.git_path or project.path


def get_git_service_for_project(project_id: str):
    """Get GitService for a project."""
    from services.git_service import get_git_service, GitServiceError

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    git_path = get_effective_git_path(project)
    service = get_git_service(git_path)
    if not service:
        raise HTTPException(
            status_code=400,
            detail=f"Project '{project_id}' is not a Git repository"
        )

    return service


def get_merge_service_for_project(project_id: str):
    """Get MergeService for a project."""
    from services.merge_service import get_merge_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    git_path = get_effective_git_path(project)
    service = get_merge_service(git_path)
    if not service:
        raise HTTPException(
            status_code=400,
            detail=f"Project '{project_id}' is not a Git repository"
        )

    return service


def get_mr_service_for_project(project_id: str):
    """Get MergeRequestService for a project."""
    from services.merge_service import MergeRequestService, get_merge_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    git_path = get_effective_git_path(project)
    merge_service = get_merge_service(git_path)
    return MergeRequestService(project_id, merge_service)


def get_github_service():
    """Get GitHubService instance."""
    from services.github_service import get_github_service as factory

    service = factory()
    if not service:
        raise HTTPException(
            status_code=503,
            detail="GitHub service not available. Check GITHUB_TOKEN environment variable."
        )

    return service


# =============================================================================
# Project Git Status Endpoints
# =============================================================================

from pydantic import BaseModel


class GitStatusResponse(BaseModel):
    """Git status response for a project."""
    project_id: str
    git_enabled: bool
    git_path: str | None
    effective_git_path: str
    is_valid_repo: bool
    current_branch: str | None = None
    error: str | None = None


class GitPathUpdateRequest(BaseModel):
    """Request to update git path for a project."""
    git_path: str | None = None  # None to use project path


@router.get("/projects/{project_id}/status", response_model=GitStatusResponse)
async def get_project_git_status(project_id: str):
    """Get Git status for a project."""
    from services.git_service import get_git_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    effective_path = get_effective_git_path(project)
    service = get_git_service(effective_path)

    return GitStatusResponse(
        project_id=project_id,
        git_enabled=project.git_enabled,
        git_path=project.git_path,
        effective_git_path=effective_path,
        is_valid_repo=service is not None,
        current_branch=service.current_branch if service else None,
    )


@router.put("/projects/{project_id}/git-path", response_model=GitStatusResponse)
async def update_project_git_path(
    project_id: str,
    request: GitPathUpdateRequest,
):
    """Update Git path for a project."""
    from pathlib import Path
    from models.project import update_project, normalize_path
    from services.git_service import get_git_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # Normalize and validate git_path
    git_path = request.git_path
    if git_path:
        git_path = normalize_path(git_path)
        if not Path(git_path).exists():
            raise HTTPException(status_code=400, detail=f"Path does not exist: {git_path}")
        if not Path(git_path).is_dir():
            raise HTTPException(status_code=400, detail=f"Path is not a directory: {git_path}")

    # Update project
    try:
        updated_project = update_project(project_id, git_path=git_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not updated_project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # Get git service for the new path
    effective_path = get_effective_git_path(updated_project)
    service = get_git_service(effective_path)

    return GitStatusResponse(
        project_id=project_id,
        git_enabled=updated_project.git_enabled,
        git_path=updated_project.git_path,
        effective_git_path=effective_path,
        is_valid_repo=service is not None,
        current_branch=service.current_branch if service else None,
        error=None if service else "Path is not a valid Git repository",
    )


# =============================================================================
# Branch Endpoints
# =============================================================================

@router.get("/projects/{project_id}/branches", response_model=BranchListResponse)
async def list_branches(
    project_id: str,
    include_remote: bool = Query(True, description="Include remote branches"),
    base_branch: str = Query("main", description="Base branch for ahead/behind calculation"),
):
    """List all branches in a project."""
    git_service = get_git_service_for_project(project_id)

    branches = git_service.list_branches(
        include_remote=include_remote,
        base_branch=base_branch,
    )

    return BranchListResponse(
        branches=branches,
        current_branch=git_service.current_branch,
        protected_branches=DEFAULT_PROTECTED_BRANCHES,
    )


@router.post("/projects/{project_id}/branches", response_model=GitBranch)
async def create_branch(
    project_id: str,
    request: BranchCreateRequest,
):
    """Create a new branch."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        branch = git_service.create_branch(
            name=request.name,
            start_point=request.start_point,
        )
        return branch
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/projects/{project_id}/branches/{branch_name}")
async def delete_branch(
    project_id: str,
    branch_name: str,
    force: bool = Query(False, description="Force delete even if not merged"),
):
    """Delete a branch."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        success = git_service.delete_branch(name=branch_name, force=force)
        return {"success": success, "message": f"Branch '{branch_name}' deleted"}
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/branches/{branch_name}/diff", response_model=BranchDiff)
async def get_branch_diff(
    project_id: str,
    branch_name: str,
    base: str = Query("main", description="Base branch for comparison"),
):
    """Get diff summary between a branch and base."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        diff = git_service.get_branch_diff(branch=branch_name, base=base)
        return diff
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Commit Endpoints
# =============================================================================

@router.get("/projects/{project_id}/commits", response_model=CommitListResponse)
async def list_commits(
    project_id: str,
    branch: str | None = Query(None, description="Branch name (default: current)"),
    limit: int = Query(50, ge=1, le=200, description="Maximum commits to return"),
    skip: int = Query(0, ge=0, description="Number of commits to skip"),
):
    """List commits in a branch."""
    git_service = get_git_service_for_project(project_id)

    commits = git_service.get_commits(branch=branch, limit=limit, skip=skip)
    actual_branch = branch or git_service.current_branch

    return CommitListResponse(
        commits=commits,
        branch=actual_branch,
        total=len(commits),
    )


@router.get("/projects/{project_id}/commits/{sha}", response_model=GitCommit)
async def get_commit(
    project_id: str,
    sha: str,
):
    """Get a specific commit."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        commit = git_service.get_commit(sha)
        return commit
    except GitServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/projects/{project_id}/commits/{sha}/files", response_model=list[CommitFile])
async def get_commit_files(
    project_id: str,
    sha: str,
):
    """Get files changed in a commit."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        files = git_service.get_commit_files(sha)
        return files
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Merge Preview & Execution Endpoints
# =============================================================================

@router.post("/projects/{project_id}/merge/preview", response_model=MergePreview)
async def preview_merge(
    project_id: str,
    source_branch: str = Query(..., description="Source branch to merge"),
    target_branch: str = Query("main", description="Target branch"),
):
    """Preview merge and check for conflicts (dry-run)."""
    from services.merge_service import MergeServiceError

    merge_service = get_merge_service_for_project(project_id)

    try:
        preview = merge_service.check_merge_conflicts(
            source_branch=source_branch,
            target_branch=target_branch,
        )
        return preview
    except MergeServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/merge/conflicts", response_model=list[ConflictFile])
async def get_conflicts(
    project_id: str,
    source_branch: str = Query(..., description="Source branch"),
    target_branch: str = Query("main", description="Target branch"),
):
    """Get detailed conflict information."""
    merge_service = get_merge_service_for_project(project_id)

    conflicts = merge_service.get_conflict_details(
        source_branch=source_branch,
        target_branch=target_branch,
    )
    return conflicts


@router.get("/projects/{project_id}/merge/three-way-diff", response_model=ThreeWayDiff)
async def get_three_way_diff(
    project_id: str,
    file_path: str = Query(..., description="File path"),
    source_branch: str = Query(..., description="Source branch"),
    target_branch: str = Query("main", description="Target branch"),
):
    """Get three-way diff for a file."""
    merge_service = get_merge_service_for_project(project_id)

    diff = merge_service.get_three_way_diff(
        file_path=file_path,
        source_branch=source_branch,
        target_branch=target_branch,
    )
    return diff


@router.post("/projects/{project_id}/merge", response_model=MergeResult)
async def execute_merge(
    project_id: str,
    request: MergeExecuteRequest,
    user_role: str = Query("member", description="User role for permission check"),
):
    """Execute merge operation.

    Requires 'merge_main' permission for protected branches.
    """
    from services.merge_service import MergeServiceError

    # Check permissions for protected branches
    if not can_merge_to_branch(user_role, request.target_branch):
        raise HTTPException(
            status_code=403,
            detail=f"Insufficient permissions to merge to '{request.target_branch}'"
        )

    merge_service = get_merge_service_for_project(project_id)

    try:
        result = merge_service.merge_branch(
            source_branch=request.source_branch,
            target_branch=request.target_branch,
            message=request.message,
        )
        return result
    except MergeServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Internal Merge Request Endpoints
# =============================================================================

@router.get("/projects/{project_id}/merge-requests", response_model=MergeRequestListResponse)
async def list_merge_requests(
    project_id: str,
    status: MergeRequestStatus | None = Query(None, description="Filter by status"),
):
    """List merge requests for a project."""
    mr_service = get_mr_service_for_project(project_id)
    mrs = mr_service.list_merge_requests(status=status)

    return MergeRequestListResponse(
        merge_requests=mrs,
        total=len(mrs),
    )


@router.get("/projects/{project_id}/merge-requests/{mr_id}", response_model=MergeRequest)
async def get_merge_request(
    project_id: str,
    mr_id: str,
):
    """Get a merge request by ID."""
    mr_service = get_mr_service_for_project(project_id)
    mr = mr_service.get_merge_request(mr_id)

    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    return mr


@router.post("/projects/{project_id}/merge-requests", response_model=MergeRequest)
async def create_merge_request(
    project_id: str,
    request: MergeRequestCreate,
    author_id: str = Query("system", description="Author user ID"),
    author_name: str = Query("System", description="Author name"),
    author_email: str = Query("system@example.com", description="Author email"),
):
    """Create a new merge request."""
    mr_service = get_mr_service_for_project(project_id)

    mr = mr_service.create_merge_request(
        title=request.title,
        source_branch=request.source_branch,
        target_branch=request.target_branch,
        description=request.description,
        reviewers=request.reviewers,
        author_id=author_id,
        author_name=author_name,
        author_email=author_email,
    )

    return mr


@router.put("/projects/{project_id}/merge-requests/{mr_id}", response_model=MergeRequest)
async def update_merge_request(
    project_id: str,
    mr_id: str,
    request: MergeRequestUpdate,
):
    """Update a merge request."""
    mr_service = get_mr_service_for_project(project_id)

    mr = mr_service.update_merge_request(
        mr_id=mr_id,
        title=request.title,
        description=request.description,
        status=request.status,
        reviewers=request.reviewers,
    )

    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    return mr


@router.post("/projects/{project_id}/merge-requests/{mr_id}/approve", response_model=MergeRequest)
async def approve_merge_request(
    project_id: str,
    mr_id: str,
    user_id: str = Query(..., description="Approving user ID"),
):
    """Approve a merge request."""
    mr_service = get_mr_service_for_project(project_id)

    mr = mr_service.approve_merge_request(mr_id=mr_id, user_id=user_id)

    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    return mr


@router.post("/projects/{project_id}/merge-requests/{mr_id}/merge")
async def merge_merge_request(
    project_id: str,
    mr_id: str,
    user_id: str = Query(..., description="User ID performing the merge"),
    user_role: str = Query("member", description="User role for permission check"),
):
    """Merge a merge request."""
    mr_service = get_mr_service_for_project(project_id)

    # Get MR to check target branch
    mr = mr_service.get_merge_request(mr_id)
    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    # Check permissions
    if not can_merge_to_branch(user_role, mr.target_branch):
        raise HTTPException(
            status_code=403,
            detail=f"Insufficient permissions to merge to '{mr.target_branch}'"
        )

    mr, result = mr_service.merge_merge_request(mr_id=mr_id, merged_by=user_id)

    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    return {
        "merge_request": mr,
        "merge_result": result,
    }


@router.post("/projects/{project_id}/merge-requests/{mr_id}/close", response_model=MergeRequest)
async def close_merge_request(
    project_id: str,
    mr_id: str,
    user_id: str = Query(..., description="User ID closing the MR"),
):
    """Close a merge request without merging."""
    mr_service = get_mr_service_for_project(project_id)

    mr = mr_service.close_merge_request(mr_id=mr_id, closed_by=user_id)

    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    return mr


@router.post("/projects/{project_id}/merge-requests/{mr_id}/refresh-conflicts", response_model=MergeRequest)
async def refresh_mr_conflicts(
    project_id: str,
    mr_id: str,
):
    """Refresh conflict status for a merge request."""
    mr_service = get_mr_service_for_project(project_id)

    mr = mr_service.refresh_conflict_status(mr_id)

    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    return mr


# =============================================================================
# Remote Operation Endpoints
# =============================================================================

@router.post("/projects/{project_id}/fetch", response_model=FetchResult)
async def fetch_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
):
    """Fetch from remote."""
    git_service = get_git_service_for_project(project_id)
    result = git_service.fetch(remote=remote)
    return result


@router.post("/projects/{project_id}/pull", response_model=PullResult)
async def pull_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
    branch: str | None = Query(None, description="Branch to pull"),
):
    """Pull from remote."""
    git_service = get_git_service_for_project(project_id)
    result = git_service.pull(remote=remote, branch=branch)
    return result


@router.post("/projects/{project_id}/push", response_model=PushResult)
async def push_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
    branch: str | None = Query(None, description="Branch to push"),
    set_upstream: bool = Query(False, description="Set upstream tracking"),
):
    """Push to remote."""
    git_service = get_git_service_for_project(project_id)
    result = git_service.push(remote=remote, branch=branch, set_upstream=set_upstream)
    return result


# =============================================================================
# GitHub API Endpoints
# =============================================================================

@router.get("/github/{repo_owner}/{repo_name}/pulls", response_model=GitHubPRListResponse)
async def list_github_prs(
    repo_owner: str,
    repo_name: str,
    state: str = Query("open", description="Filter by state (open, closed, all)"),
    base: str | None = Query(None, description="Filter by base branch"),
    limit: int = Query(30, ge=1, le=100, description="Maximum PRs to return"),
):
    """List GitHub pull requests."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        prs = github_service.list_pull_requests(
            repo=repo,
            state=state,
            base=base,
            limit=limit,
        )
        return GitHubPRListResponse(pull_requests=prs, total=len(prs))
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/github/{repo_owner}/{repo_name}/pulls/{pr_number}", response_model=GitHubPullRequest)
async def get_github_pr(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
):
    """Get a specific GitHub pull request."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        pr = github_service.get_pull_request(pr_number=pr_number, repo=repo)
        return pr
    except GitHubServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/github/{repo_owner}/{repo_name}/pulls/{pr_number}/merge", response_model=GitHubMergeResult)
async def merge_github_pr(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
    request: GitHubMergeRequest,
):
    """Merge a GitHub pull request."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        result = github_service.merge_pull_request(
            pr_number=pr_number,
            repo=repo,
            merge_method=request.merge_method,
            commit_title=request.commit_title,
            commit_message=request.commit_message,
        )
        return result
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/github/{repo_owner}/{repo_name}/pulls/{pr_number}/reviews", response_model=list[GitHubPRReview])
async def list_github_pr_reviews(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
):
    """List reviews on a GitHub pull request."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        reviews = github_service.list_pr_reviews(pr_number=pr_number, repo=repo)
        return reviews
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/github/{repo_owner}/{repo_name}/pulls/{pr_number}/reviews", response_model=GitHubPRReview)
async def create_github_pr_review(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
    request: GitHubPRReviewCreate,
):
    """Create a review on a GitHub pull request."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        review = github_service.create_pr_review(
            pr_number=pr_number,
            repo=repo,
            body=request.body,
            event=request.event,
        )
        return review
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/github/{repo_owner}/{repo_name}/pulls/{pr_number}/mergeable")
async def check_github_pr_mergeable(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
):
    """Check if a GitHub PR is mergeable."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        status = github_service.check_pr_mergeable(pr_number=pr_number, repo=repo)
        return status
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/github/{repo_owner}/{repo_name}/info")
async def get_github_repo_info(
    repo_owner: str,
    repo_name: str,
):
    """Get GitHub repository information."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        info = github_service.get_repo_info(repo=repo)
        return info
    except GitHubServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/github/{repo_owner}/{repo_name}/branches")
async def list_github_branches(
    repo_owner: str,
    repo_name: str,
    protected: bool | None = Query(None, description="Filter by protected status"),
):
    """List GitHub repository branches."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        branches = github_service.list_branches(repo=repo, protected=protected)
        return {"branches": branches, "total": len(branches)}
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Git Repository Registry Endpoints
# =============================================================================

@router.get("/repositories", response_model=GitRepositoryListResponse)
async def list_repositories():
    """List all registered Git repositories."""
    repos = list_git_repositories()
    return GitRepositoryListResponse(repositories=repos, total=len(repos))


@router.post("/repositories", response_model=GitRepository)
async def create_repository(request: GitRepositoryCreate):
    """Register a new Git repository."""
    from pathlib import Path
    from models.project import normalize_path

    # Normalize path
    path = normalize_path(request.path)

    # Validate path exists
    if not Path(path).exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
    if not Path(path).is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")

    repo = register_git_repository(
        name=request.name,
        path=path,
        description=request.description,
    )

    if not repo.is_valid:
        # Still register but warn
        logger.warning(f"Registered path '{path}' is not a valid Git repository")

    return repo


@router.get("/repositories/{repo_id}", response_model=GitRepository)
async def get_repository(repo_id: str):
    """Get a Git repository by ID."""
    repo = get_git_repository(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.put("/repositories/{repo_id}", response_model=GitRepository)
async def update_repository(repo_id: str, request: GitRepositoryUpdate):
    """Update a Git repository."""
    from pathlib import Path
    from models.project import normalize_path

    # Validate path if provided
    path = request.path
    if path:
        path = normalize_path(path)
        if not Path(path).exists():
            raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
        if not Path(path).is_dir():
            raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")

    repo = update_git_repository(
        repo_id=repo_id,
        name=request.name,
        description=request.description,
        path=path,
    )

    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    return repo


@router.delete("/repositories/{repo_id}")
async def remove_repository(repo_id: str):
    """Delete a Git repository from registry."""
    success = delete_git_repository(repo_id)
    if not success:
        raise HTTPException(status_code=404, detail="Repository not found")
    return {"success": True, "message": "Repository removed"}
