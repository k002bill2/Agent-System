"""github 관련 Git API 라우트."""

from fastapi import APIRouter, HTTPException, Query

from models.git import (
    GitHubMergeRequest,
    GitHubMergeResult,
    GitHubPRListResponse,
    GitHubPRReview,
    GitHubPRReviewCreate,
    GitHubPullRequest,
)

from ._shared import get_github_service

router = APIRouter()


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


@router.post(
    "/github/{repo_owner}/{repo_name}/pulls/{pr_number}/merge", response_model=GitHubMergeResult
)
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


@router.get(
    "/github/{repo_owner}/{repo_name}/pulls/{pr_number}/reviews",
    response_model=list[GitHubPRReview],
)
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


@router.post(
    "/github/{repo_owner}/{repo_name}/pulls/{pr_number}/reviews", response_model=GitHubPRReview
)
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
