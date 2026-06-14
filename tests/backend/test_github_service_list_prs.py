"""Tests for GitHubService.list_pull_requests base/head filter handling.

Regression for Bug F2: passing base=""/head="" (instead of PyGithub NotSet) to
repository.get_pulls makes GitHub filter on an empty branch ref and return 0 PRs.
This silently broke both the prune-merged scan and the Pull Requests tab.

Also covers the ``lite`` fast path used by the prune scan: it must read only the
PR list-payload fields and never touch ``.mergeable``/``.commits``/etc., each of
which triggers a per-PR API round-trip (the scan took ~4 minutes otherwise).
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock, PropertyMock, patch


def _service_without_init():
    """Construct GitHubService bypassing __init__ (which needs a token + network)."""
    from services.github_service import GitHubService

    svc = GitHubService.__new__(GitHubService)
    svc.default_repo = None
    svc.github = MagicMock()
    return svc


class TestListPullRequestsFilters:
    """list_pull_requests must not coerce None base/head into empty strings."""

    def test_none_base_head_forwarded_as_notset(self):
        """None base/head → PyGithub NotSet (omitted), never '' (which yields 0 PRs)."""
        from github.GithubObject import NotSet

        svc = _service_without_init()
        mock_repo = MagicMock()
        mock_repo.get_pulls.return_value = []

        with patch.object(svc, "_get_repo", return_value=mock_repo):
            svc.list_pull_requests(repo="o/r", state="all", limit=500)

        kwargs = mock_repo.get_pulls.call_args.kwargs
        assert kwargs["base"] is NotSet, "base must be NotSet, not empty string"
        assert kwargs["head"] is NotSet, "head must be NotSet, not empty string"
        assert kwargs["state"] == "all"

    def test_explicit_base_head_preserved(self):
        """Explicit base/head filters must still be forwarded verbatim."""
        from github.GithubObject import NotSet

        svc = _service_without_init()
        mock_repo = MagicMock()
        mock_repo.get_pulls.return_value = []

        with patch.object(svc, "_get_repo", return_value=mock_repo):
            svc.list_pull_requests(repo="o/r", state="open", base="main", head="feat/x")

        kwargs = mock_repo.get_pulls.call_args.kwargs
        assert kwargs["base"] == "main"
        assert kwargs["head"] == "feat/x"
        assert kwargs["base"] is not NotSet


def _list_payload_pr():
    """A PR mock whose list-payload fields are set but whose lazily-fetched
    attributes raise if accessed (simulating PyGithub's per-PR completion GET)."""
    pr = MagicMock()
    pr.number = 7
    pr.title = "feat: x"
    pr.state = "closed"
    pr.draft = False
    pr.head.ref = "feat/x"
    pr.head.sha = "headsha"
    pr.base.ref = "main"
    pr.base.sha = "basesha"
    pr.user.login = "u"
    pr.user.avatar_url = None
    pr.html_url = "https://github.com/o/r/pull/7"
    pr.diff_url = "https://github.com/o/r/pull/7.diff"
    pr.labels = []
    now = datetime.now(UTC)
    pr.created_at = now
    pr.updated_at = now
    pr.merged_at = now
    pr.closed_at = now
    # These are NOT in the PR list payload — accessing them triggers a per-PR
    # API round-trip. The lite path must never touch them.
    for attr in ("mergeable", "mergeable_state", "commits", "additions",
                 "deletions", "changed_files", "review_comments"):
        setattr(type(pr), attr, PropertyMock(side_effect=AssertionError(f"{attr} fetched!")))
    return pr


class TestLiteListPath:
    """The prune scan's lite path must avoid expensive lazy attributes."""

    def test_lite_does_not_touch_expensive_attributes(self):
        svc = _service_without_init()
        mock_repo = MagicMock()
        mock_repo.get_pulls.return_value = [_list_payload_pr()]

        with patch.object(svc, "_get_repo", return_value=mock_repo):
            result = svc.list_pull_requests(repo="o/r", state="all", limit=500, lite=True)

        assert len(result) == 1
        assert result[0].head_ref == "feat/x"
        assert result[0].head_sha == "headsha"
        assert result[0].merged_at is not None
        # Lite intentionally leaves the expensive fields unfetched.
        assert result[0].mergeable is None
