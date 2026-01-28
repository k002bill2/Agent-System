"""GitHub API service using PyGithub for remote repository operations."""

import logging
import os
from datetime import datetime
from typing import Any

from config import get_settings

try:
    from github import Github, GithubException, Auth
    from github.PullRequest import PullRequest
    from github.Repository import Repository
    GITHUB_AVAILABLE = True
except ImportError:
    GITHUB_AVAILABLE = False
    Github = None
    GithubException = Exception
    Auth = None
    PullRequest = None
    Repository = None

from models.git import (
    GitHubPullRequest,
    GitHubPRReview,
    GitHubMergeResult,
)

logger = logging.getLogger(__name__)


class GitHubServiceError(Exception):
    """GitHub service specific error."""
    pass


class GitHubService:
    """Service for GitHub API operations using PyGithub."""

    def __init__(
        self,
        token: str | None = None,
        default_repo: str | None = None
    ):
        """Initialize GitHub service.

        Args:
            token: GitHub Personal Access Token (defaults to GITHUB_TOKEN env var)
            default_repo: Default repository in "owner/repo" format
        """
        if not GITHUB_AVAILABLE:
            raise GitHubServiceError(
                "PyGithub is not installed. Run: pip install PyGithub"
            )

        settings = get_settings()
        self.token = token or settings.github_token or os.getenv("GITHUB_TOKEN")
        if not self.token:
            raise GitHubServiceError(
                "GitHub token not provided. Set GITHUB_TOKEN environment variable."
            )

        self.default_repo = default_repo or os.getenv("GITHUB_DEFAULT_REPO")

        try:
            auth = Auth.Token(self.token)
            self.github = Github(auth=auth)
            # Verify authentication
            self.github.get_user().login
        except GithubException as e:
            raise GitHubServiceError(f"GitHub authentication failed: {e}")

    def _get_repo(self, repo_name: str | None = None) -> "Repository":
        """Get repository object.

        Args:
            repo_name: Repository in "owner/repo" format

        Returns:
            GitHub Repository object
        """
        name = repo_name or self.default_repo
        if not name:
            raise GitHubServiceError("Repository name not specified")

        try:
            return self.github.get_repo(name)
        except GithubException as e:
            raise GitHubServiceError(f"Repository not found: {name}. Error: {e}")

    # =========================================================================
    # Pull Request Operations
    # =========================================================================

    def list_pull_requests(
        self,
        repo: str | None = None,
        state: str = "open",
        base: str | None = None,
        head: str | None = None,
        sort: str = "created",
        direction: str = "desc",
        limit: int = 30
    ) -> list[GitHubPullRequest]:
        """List pull requests.

        Args:
            repo: Repository in "owner/repo" format
            state: Filter by state (open, closed, all)
            base: Filter by base branch
            head: Filter by head branch
            sort: Sort by (created, updated, popularity, long-running)
            direction: Sort direction (asc, desc)
            limit: Maximum number of PRs to return

        Returns:
            List of pull requests
        """
        repository = self._get_repo(repo)

        try:
            prs = repository.get_pulls(
                state=state,
                base=base or "",
                head=head or "",
                sort=sort,
                direction=direction,
            )

            result: list[GitHubPullRequest] = []
            for i, pr in enumerate(prs):
                if i >= limit:
                    break
                result.append(self._pr_to_model(pr))

            return result

        except GithubException as e:
            raise GitHubServiceError(f"Failed to list pull requests: {e}")

    def get_pull_request(
        self,
        pr_number: int,
        repo: str | None = None
    ) -> GitHubPullRequest:
        """Get a specific pull request.

        Args:
            pr_number: Pull request number
            repo: Repository in "owner/repo" format

        Returns:
            Pull request details
        """
        repository = self._get_repo(repo)

        try:
            pr = repository.get_pull(pr_number)
            return self._pr_to_model(pr)
        except GithubException as e:
            raise GitHubServiceError(f"Pull request #{pr_number} not found: {e}")

    def create_pull_request(
        self,
        title: str,
        head: str,
        base: str = "main",
        body: str = "",
        draft: bool = False,
        repo: str | None = None
    ) -> GitHubPullRequest:
        """Create a new pull request.

        Args:
            title: PR title
            head: Head branch (source)
            base: Base branch (target)
            body: PR description
            draft: Create as draft PR
            repo: Repository in "owner/repo" format

        Returns:
            Created pull request
        """
        repository = self._get_repo(repo)

        try:
            pr = repository.create_pull(
                title=title,
                body=body,
                head=head,
                base=base,
                draft=draft,
            )
            return self._pr_to_model(pr)
        except GithubException as e:
            raise GitHubServiceError(f"Failed to create pull request: {e}")

    def update_pull_request(
        self,
        pr_number: int,
        title: str | None = None,
        body: str | None = None,
        state: str | None = None,
        base: str | None = None,
        repo: str | None = None
    ) -> GitHubPullRequest:
        """Update a pull request.

        Args:
            pr_number: Pull request number
            title: New title
            body: New body
            state: New state (open, closed)
            base: New base branch
            repo: Repository in "owner/repo" format

        Returns:
            Updated pull request
        """
        repository = self._get_repo(repo)

        try:
            pr = repository.get_pull(pr_number)

            # Build update kwargs
            kwargs: dict[str, Any] = {}
            if title is not None:
                kwargs["title"] = title
            if body is not None:
                kwargs["body"] = body
            if state is not None:
                kwargs["state"] = state
            if base is not None:
                kwargs["base"] = base

            if kwargs:
                pr.edit(**kwargs)

            return self._pr_to_model(pr)
        except GithubException as e:
            raise GitHubServiceError(f"Failed to update pull request: {e}")

    def merge_pull_request(
        self,
        pr_number: int,
        merge_method: str = "merge",
        commit_title: str | None = None,
        commit_message: str | None = None,
        repo: str | None = None
    ) -> GitHubMergeResult:
        """Merge a pull request.

        Args:
            pr_number: Pull request number
            merge_method: Merge method (merge, squash, rebase)
            commit_title: Custom commit title
            commit_message: Custom commit message
            repo: Repository in "owner/repo" format

        Returns:
            Merge result
        """
        repository = self._get_repo(repo)

        try:
            pr = repository.get_pull(pr_number)

            # Check if mergeable
            if pr.mergeable is False:
                return GitHubMergeResult(
                    merged=False,
                    message=f"PR #{pr_number} is not mergeable. State: {pr.mergeable_state}",
                )

            # Merge
            result = pr.merge(
                merge_method=merge_method,
                commit_title=commit_title,
                commit_message=commit_message,
            )

            return GitHubMergeResult(
                merged=result.merged,
                sha=result.sha,
                message=result.message,
            )

        except GithubException as e:
            return GitHubMergeResult(
                merged=False,
                message=f"Failed to merge: {e}",
            )

    def check_pr_mergeable(
        self,
        pr_number: int,
        repo: str | None = None
    ) -> dict[str, Any]:
        """Check if a PR is mergeable.

        Args:
            pr_number: Pull request number
            repo: Repository in "owner/repo" format

        Returns:
            Mergeable status information
        """
        repository = self._get_repo(repo)

        try:
            pr = repository.get_pull(pr_number)
            return {
                "mergeable": pr.mergeable,
                "mergeable_state": pr.mergeable_state,
                "merged": pr.merged,
                "rebaseable": pr.rebaseable,
            }
        except GithubException as e:
            raise GitHubServiceError(f"Failed to check PR status: {e}")

    # =========================================================================
    # PR Review Operations
    # =========================================================================

    def list_pr_reviews(
        self,
        pr_number: int,
        repo: str | None = None
    ) -> list[GitHubPRReview]:
        """List reviews on a pull request.

        Args:
            pr_number: Pull request number
            repo: Repository in "owner/repo" format

        Returns:
            List of reviews
        """
        repository = self._get_repo(repo)

        try:
            pr = repository.get_pull(pr_number)
            reviews = pr.get_reviews()

            result: list[GitHubPRReview] = []
            for review in reviews:
                result.append(GitHubPRReview(
                    id=review.id,
                    user_login=review.user.login if review.user else "unknown",
                    user_avatar_url=review.user.avatar_url if review.user else None,
                    state=review.state,
                    body=review.body or "",
                    submitted_at=review.submitted_at,
                    commit_id=review.commit_id,
                ))

            return result

        except GithubException as e:
            raise GitHubServiceError(f"Failed to list reviews: {e}")

    def create_pr_review(
        self,
        pr_number: int,
        body: str = "",
        event: str = "COMMENT",
        repo: str | None = None
    ) -> GitHubPRReview:
        """Create a review on a pull request.

        Args:
            pr_number: Pull request number
            body: Review body
            event: Review event (APPROVE, REQUEST_CHANGES, COMMENT)
            repo: Repository in "owner/repo" format

        Returns:
            Created review
        """
        repository = self._get_repo(repo)

        try:
            pr = repository.get_pull(pr_number)
            review = pr.create_review(body=body, event=event)

            return GitHubPRReview(
                id=review.id,
                user_login=review.user.login if review.user else "unknown",
                user_avatar_url=review.user.avatar_url if review.user else None,
                state=review.state,
                body=review.body or "",
                submitted_at=review.submitted_at,
                commit_id=review.commit_id,
            )

        except GithubException as e:
            raise GitHubServiceError(f"Failed to create review: {e}")

    # =========================================================================
    # Branch Operations
    # =========================================================================

    def create_remote_branch(
        self,
        branch_name: str,
        sha: str,
        repo: str | None = None
    ) -> bool:
        """Create a new branch on remote.

        Args:
            branch_name: New branch name
            sha: Commit SHA to branch from
            repo: Repository in "owner/repo" format

        Returns:
            True if created successfully
        """
        repository = self._get_repo(repo)

        try:
            ref = f"refs/heads/{branch_name}"
            repository.create_git_ref(ref=ref, sha=sha)
            return True
        except GithubException as e:
            raise GitHubServiceError(f"Failed to create branch: {e}")

    def delete_remote_branch(
        self,
        branch_name: str,
        repo: str | None = None
    ) -> bool:
        """Delete a branch on remote.

        Args:
            branch_name: Branch name to delete
            repo: Repository in "owner/repo" format

        Returns:
            True if deleted successfully
        """
        repository = self._get_repo(repo)

        try:
            ref = repository.get_git_ref(f"heads/{branch_name}")
            ref.delete()
            return True
        except GithubException as e:
            raise GitHubServiceError(f"Failed to delete branch: {e}")

    def get_branch_protection(
        self,
        branch_name: str,
        repo: str | None = None
    ) -> dict[str, Any] | None:
        """Get branch protection rules.

        Args:
            branch_name: Branch name
            repo: Repository in "owner/repo" format

        Returns:
            Protection rules or None if not protected
        """
        repository = self._get_repo(repo)

        try:
            branch = repository.get_branch(branch_name)
            if not branch.protected:
                return None

            protection = branch.get_protection()
            return {
                "required_status_checks": protection.required_status_checks,
                "enforce_admins": protection.enforce_admins,
                "required_pull_request_reviews": protection.required_pull_request_reviews,
                "restrictions": protection.restrictions,
            }
        except GithubException:
            return None

    # =========================================================================
    # Repository Information
    # =========================================================================

    def get_repo_info(self, repo: str | None = None) -> dict[str, Any]:
        """Get repository information.

        Args:
            repo: Repository in "owner/repo" format

        Returns:
            Repository information
        """
        repository = self._get_repo(repo)

        return {
            "name": repository.name,
            "full_name": repository.full_name,
            "description": repository.description,
            "default_branch": repository.default_branch,
            "private": repository.private,
            "html_url": repository.html_url,
            "clone_url": repository.clone_url,
            "ssh_url": repository.ssh_url,
            "stargazers_count": repository.stargazers_count,
            "forks_count": repository.forks_count,
            "open_issues_count": repository.open_issues_count,
        }

    def list_branches(
        self,
        repo: str | None = None,
        protected: bool | None = None
    ) -> list[dict[str, Any]]:
        """List repository branches.

        Args:
            repo: Repository in "owner/repo" format
            protected: Filter by protected status

        Returns:
            List of branches
        """
        repository = self._get_repo(repo)

        try:
            branches = repository.get_branches()
            result = []

            for branch in branches:
                if protected is not None and branch.protected != protected:
                    continue

                result.append({
                    "name": branch.name,
                    "protected": branch.protected,
                    "commit_sha": branch.commit.sha,
                })

            return result

        except GithubException as e:
            raise GitHubServiceError(f"Failed to list branches: {e}")

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _pr_to_model(self, pr: "PullRequest") -> GitHubPullRequest:
        """Convert PyGithub PullRequest to model.

        Args:
            pr: PyGithub PullRequest object

        Returns:
            GitHubPullRequest model
        """
        return GitHubPullRequest(
            number=pr.number,
            title=pr.title,
            body=pr.body or "",
            state=pr.state,
            draft=pr.draft,
            mergeable=pr.mergeable,
            mergeable_state=pr.mergeable_state,
            head_ref=pr.head.ref,
            head_sha=pr.head.sha,
            base_ref=pr.base.ref,
            base_sha=pr.base.sha,
            user_login=pr.user.login if pr.user else "unknown",
            user_avatar_url=pr.user.avatar_url if pr.user else None,
            html_url=pr.html_url,
            diff_url=pr.diff_url,
            commits=pr.commits,
            additions=pr.additions,
            deletions=pr.deletions,
            changed_files=pr.changed_files,
            review_comments=pr.review_comments,
            labels=[label.name for label in pr.labels],
            created_at=pr.created_at,
            updated_at=pr.updated_at,
            merged_at=pr.merged_at,
            closed_at=pr.closed_at,
        )


def get_github_service(
    token: str | None = None,
    default_repo: str | None = None
) -> GitHubService | None:
    """Factory function to get GitHubService instance.

    Args:
        token: GitHub token
        default_repo: Default repository

    Returns:
        GitHubService instance or None
    """
    try:
        return GitHubService(token=token, default_repo=default_repo)
    except GitHubServiceError as e:
        logger.warning(f"Could not initialize GitHubService: {e}")
        return None
