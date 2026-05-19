"""Tests for GitService prune-merged-branches logic.

Wave 1 (TDD) — RED phase. These tests are expected to FAIL until W1-2 implementation.

Covered scenarios:
1. Merged PR matches local branch → candidate
2. Default branch (main/master/develop) → skipped
3. Current HEAD branch → skipped
4. Unpushed commits → skipped
5. No matching PR → skipped
6. PR is closed but not merged → skipped
7. BranchProtection rule pattern matches → skipped
8. Batch prune executes delete_branch and collects errors
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest

# =============================================================================
# Fixtures
# =============================================================================


def _make_branch(name: str, sha: str = "abc123", tracking_ref: str | None = None, ahead: int = 0):
    """Build a MagicMock representing a local branch."""
    branch = MagicMock()
    branch.name = name
    branch.commit.hexsha = sha
    branch.commit.message = f"commit on {name}"
    branch.commit.author.name = "tester"
    branch.commit.committed_date = datetime.now(UTC).timestamp()
    if tracking_ref is None:
        branch.tracking_branch.return_value = None
    else:
        tracking = MagicMock()
        tracking.name = tracking_ref
        # Simulate ahead/behind: iter_commits called with f"{tracking_ref}..{name}" returns `ahead` items
        branch.tracking_branch.return_value = tracking
    branch._ahead_count = ahead  # custom attr for repo.iter_commits side_effect
    return branch


def _make_pr(
    number: int,
    head_ref: str,
    head_sha: str = "abc123",
    merged: bool = True,
    state: str = "closed",
):
    """Build a GitHubPullRequest-like Pydantic model."""
    from models.git import GitHubPullRequest

    now = datetime.now(UTC)
    return GitHubPullRequest(
        number=number,
        title=f"PR #{number} for {head_ref}",
        body="",
        state=state,
        draft=False,
        mergeable=None,
        mergeable_state=None,
        head_ref=head_ref,
        head_sha=head_sha,
        base_ref="main",
        base_sha="base000",
        user_login="tester",
        user_avatar_url=None,
        html_url=f"https://github.com/o/r/pull/{number}",
        diff_url=f"https://github.com/o/r/pull/{number}.diff",
        commits=1,
        additions=10,
        deletions=2,
        changed_files=1,
        review_comments=0,
        labels=[],
        created_at=now,
        updated_at=now,
        merged_at=now if merged else None,
        closed_at=now,
    )


@pytest.fixture
def mock_repo():
    """Mock repo with `main` (default), `feat/done` (merged PR), `wip/local` (no PR)."""
    repo = MagicMock()
    repo.is_dirty.return_value = False

    main = _make_branch("main", sha="main000", tracking_ref="origin/main", ahead=0)
    feat_done = _make_branch("feat/done", sha="done123", tracking_ref="origin/feat/done", ahead=0)
    wip_local = _make_branch("wip/local", sha="wip000", tracking_ref=None, ahead=0)

    repo.active_branch = main
    repo.branches = [main, feat_done, wip_local]
    repo.head.commit.hexsha = "main000"

    # Mock iter_commits for ahead detection: returns `_ahead_count` commits
    def iter_commits_side_effect(rev_range, **_):
        # rev_range like "origin/feat/done..feat/done"
        if ".." not in rev_range:
            return iter([])
        _, local_name = rev_range.split("..", 1)
        for b in repo.branches:
            if b.name == local_name:
                return iter([MagicMock()] * b._ahead_count)
        return iter([])

    repo.iter_commits.side_effect = iter_commits_side_effect

    # Mock remotes
    repo.remotes = MagicMock()
    repo.remotes.origin.refs = []

    return repo


@pytest.fixture
def mock_github_service():
    """Mock GitHubService returning controlled PR list."""
    svc = MagicMock()
    svc.list_pull_requests.return_value = []
    return svc


# =============================================================================
# Pydantic model contract (W1-2 will add these)
# =============================================================================


class TestPruneModelsExist:
    """RED: PruneCandidate / PruneSkipped / PruneScanResult must exist in models."""

    def test_prune_candidate_model_importable(self):
        from models.git import PruneCandidate  # noqa: F401

    def test_prune_skipped_model_importable(self):
        from models.git import PruneSkipped  # noqa: F401

    def test_prune_scan_result_model_importable(self):
        from models.git import PruneScanResult  # noqa: F401

    def test_prune_execute_result_model_importable(self):
        from models.git import PruneExecuteResult  # noqa: F401

    def test_prune_protected_branches_constant(self):
        from models.git import PRUNE_PROTECTED_BRANCHES

        assert "main" in PRUNE_PROTECTED_BRANCHES
        assert "master" in PRUNE_PROTECTED_BRANCHES
        assert "develop" in PRUNE_PROTECTED_BRANCHES


# =============================================================================
# find_prune_candidates: judgment logic
# =============================================================================


class TestFindPruneCandidates:
    """RED: behavior contract for find_prune_candidates()."""

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_merged_pr_branch_is_candidate(
        self, mock_repo_class, mock_repo, mock_github_service, tmp_path
    ):
        """feat/done has a merged PR → returned as candidate."""
        mock_repo_class.return_value = mock_repo
        mock_github_service.list_pull_requests.return_value = [
            _make_pr(number=42, head_ref="feat/done", merged=True),
        ]

        from services.git_service import GitService

        service = GitService(str(tmp_path))
        result = service.find_prune_candidates(
            github_service=mock_github_service,
        )

        candidate_names = [c.branch for c in result.candidates]
        assert "feat/done" in candidate_names
        candidate = next(c for c in result.candidates if c.branch == "feat/done")
        assert candidate.pr_number == 42
        assert candidate.merged_at is not None

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_default_branch_is_skipped(
        self, mock_repo_class, mock_repo, mock_github_service, tmp_path
    ):
        """main is in PRUNE_PROTECTED_BRANCHES → skipped with reason 'default_branch'."""
        mock_repo_class.return_value = mock_repo
        # Even if main has a "merged PR", it must be skipped
        mock_github_service.list_pull_requests.return_value = [
            _make_pr(number=1, head_ref="main", merged=True),
        ]

        from services.git_service import GitService

        service = GitService(str(tmp_path))
        result = service.find_prune_candidates(
            github_service=mock_github_service,
        )

        candidate_names = [c.branch for c in result.candidates]
        assert "main" not in candidate_names
        reasons = {s.branch: s.reason for s in result.skipped}
        assert reasons.get("main") == "default_branch"

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_current_head_is_skipped(
        self, mock_repo_class, mock_repo, mock_github_service, tmp_path
    ):
        """Even non-default branch is skipped if it's the active HEAD."""
        mock_repo_class.return_value = mock_repo
        # Move HEAD to feat/done
        mock_repo.active_branch = mock_repo.branches[1]
        mock_github_service.list_pull_requests.return_value = [
            _make_pr(number=42, head_ref="feat/done", merged=True),
        ]

        from services.git_service import GitService

        service = GitService(str(tmp_path))
        result = service.find_prune_candidates(
            github_service=mock_github_service,
        )

        candidate_names = [c.branch for c in result.candidates]
        assert "feat/done" not in candidate_names
        reasons = {s.branch: s.reason for s in result.skipped}
        assert reasons.get("feat/done") == "current_head"

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_unpushed_commits_skipped(
        self, mock_repo_class, mock_github_service, tmp_path
    ):
        """Branch with ahead>0 vs origin → skipped with 'unpushed_commits'."""
        repo = MagicMock()
        repo.is_dirty.return_value = False
        main = _make_branch("main", tracking_ref="origin/main", ahead=0)
        feat_ahead = _make_branch("feat/ahead", tracking_ref="origin/feat/ahead", ahead=3)
        repo.active_branch = main
        repo.branches = [main, feat_ahead]
        repo.head.commit.hexsha = "main000"

        def iter_commits_side_effect(rev_range, **_):
            if ".." not in rev_range:
                return iter([])
            _, local_name = rev_range.split("..", 1)
            for b in repo.branches:
                if b.name == local_name:
                    return iter([MagicMock()] * b._ahead_count)
            return iter([])

        repo.iter_commits.side_effect = iter_commits_side_effect
        mock_repo_class.return_value = repo

        mock_github_service.list_pull_requests.return_value = [
            _make_pr(number=99, head_ref="feat/ahead", merged=True),
        ]

        from services.git_service import GitService

        service = GitService(str(tmp_path))
        result = service.find_prune_candidates(
            github_service=mock_github_service,
        )

        candidate_names = [c.branch for c in result.candidates]
        assert "feat/ahead" not in candidate_names
        reasons = {s.branch: s.reason for s in result.skipped}
        assert reasons.get("feat/ahead") == "unpushed_commits"

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_no_matching_pr_skipped(
        self, mock_repo_class, mock_repo, mock_github_service, tmp_path
    ):
        """wip/local has no PR → skipped with 'no_matching_pr'."""
        mock_repo_class.return_value = mock_repo
        mock_github_service.list_pull_requests.return_value = []

        from services.git_service import GitService

        service = GitService(str(tmp_path))
        result = service.find_prune_candidates(
            github_service=mock_github_service,
        )

        reasons = {s.branch: s.reason for s in result.skipped}
        assert reasons.get("wip/local") == "no_matching_pr"

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_closed_not_merged_pr_skipped(
        self, mock_repo_class, mock_repo, mock_github_service, tmp_path
    ):
        """PR is closed but merged_at is None → branch skipped, not a candidate."""
        mock_repo_class.return_value = mock_repo
        mock_github_service.list_pull_requests.return_value = [
            _make_pr(number=7, head_ref="feat/done", merged=False, state="closed"),
        ]

        from services.git_service import GitService

        service = GitService(str(tmp_path))
        result = service.find_prune_candidates(
            github_service=mock_github_service,
        )

        candidate_names = [c.branch for c in result.candidates]
        assert "feat/done" not in candidate_names
        reasons = {s.branch: s.reason for s in result.skipped}
        # Treat as no matching merged PR
        assert reasons.get("feat/done") == "no_matching_pr"

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_branch_protection_rule_skips(
        self, mock_repo_class, mock_repo, mock_github_service, tmp_path
    ):
        """protection_patterns containing 'feat/*' → matching branch skipped."""
        mock_repo_class.return_value = mock_repo
        mock_github_service.list_pull_requests.return_value = [
            _make_pr(number=42, head_ref="feat/done", merged=True),
        ]

        from services.git_service import GitService

        service = GitService(str(tmp_path))
        result = service.find_prune_candidates(
            github_service=mock_github_service,
            protection_patterns=["feat/*"],
        )

        candidate_names = [c.branch for c in result.candidates]
        assert "feat/done" not in candidate_names
        reasons = {s.branch: s.reason for s in result.skipped}
        assert reasons.get("feat/done") == "protected_rule"

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_list_pull_requests_called_with_large_limit(
        self, mock_repo_class, mock_repo, mock_github_service, tmp_path
    ):
        """Wave 0 finding: prune must request limit>=500 to avoid stale-branch miss."""
        mock_repo_class.return_value = mock_repo
        mock_github_service.list_pull_requests.return_value = []

        from services.git_service import GitService

        service = GitService(str(tmp_path))
        service.find_prune_candidates(
            github_service=mock_github_service,
        )

        # Verify limit was passed and is >= 500
        call = mock_github_service.list_pull_requests.call_args
        assert call is not None
        kwargs = call.kwargs
        assert kwargs.get("state") == "all"
        assert kwargs.get("limit", 0) >= 500


# =============================================================================
# prune_merged_branches: batch execution
# =============================================================================


class TestPruneMergedBranches:
    """RED: batch deletion calls delete_branch per candidate and collects errors."""

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_executes_delete_for_each_candidate(self, mock_repo_class, mock_repo, tmp_path):
        mock_repo_class.return_value = mock_repo

        from models.git import PruneCandidate
        from services.git_service import GitService

        service = GitService(str(tmp_path))
        candidates = [
            PruneCandidate(
                branch="feat/a",
                pr_number=1,
                pr_url="u",
                pr_title="t",
                merged_at=datetime.now(UTC),
                last_commit_sha="sha-a",
            ),
            PruneCandidate(
                branch="feat/b",
                pr_number=2,
                pr_url="u",
                pr_title="t",
                merged_at=datetime.now(UTC),
                last_commit_sha="sha-b",
            ),
        ]

        with patch.object(service, "delete_branch", return_value=True) as mock_del:
            result = service.prune_merged_branches(candidates)

        assert result.deleted == ["feat/a", "feat/b"]
        assert result.errors == []
        assert mock_del.call_count == 2

    @patch("services.git_service.Repo")
    @patch("services.git_service.GIT_AVAILABLE", True)
    def test_individual_failure_continues_batch(self, mock_repo_class, mock_repo, tmp_path):
        """If one delete fails, others must still proceed and error is recorded."""
        mock_repo_class.return_value = mock_repo

        from models.git import PruneCandidate
        from services.git_service import GitService, GitServiceError

        service = GitService(str(tmp_path))
        candidates = [
            PruneCandidate(
                branch="feat/ok",
                pr_number=1,
                pr_url="u",
                pr_title="t",
                merged_at=datetime.now(UTC),
                last_commit_sha="sha",
            ),
            PruneCandidate(
                branch="feat/fail",
                pr_number=2,
                pr_url="u",
                pr_title="t",
                merged_at=datetime.now(UTC),
                last_commit_sha="sha",
            ),
            PruneCandidate(
                branch="feat/also-ok",
                pr_number=3,
                pr_url="u",
                pr_title="t",
                merged_at=datetime.now(UTC),
                last_commit_sha="sha",
            ),
        ]

        def delete_side_effect(name, **_):
            if name == "feat/fail":
                raise GitServiceError("simulated failure")
            return True

        with patch.object(service, "delete_branch", side_effect=delete_side_effect):
            result = service.prune_merged_branches(candidates)

        assert "feat/ok" in result.deleted
        assert "feat/also-ok" in result.deleted
        assert "feat/fail" not in result.deleted
        assert any(e["branch"] == "feat/fail" for e in result.errors)
