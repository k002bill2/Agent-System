"""Tests for GitHubService.list_pull_requests base/head filter handling.

Regression for Bug F2: passing base=""/head="" (instead of PyGithub NotSet) to
repository.get_pulls makes GitHub filter on an empty branch ref and return 0 PRs.
This silently broke both the prune-merged scan and the Pull Requests tab.
"""

from unittest.mock import MagicMock, patch


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
