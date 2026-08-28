"""API tests for POST /branches/prune-merged endpoint."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def app() -> FastAPI:
    """Create test FastAPI app with git router.

    The git router requires authentication (2026-08-28), so an identity is
    injected here. What this file tests is the prune endpoint's contract, not
    the gate -- the gate itself is covered by the git authentication tests in
    `test_security_hardening.py`.
    """
    from types import SimpleNamespace

    from api.deps import get_current_user
    from api.git import router

    test_app = FastAPI()
    test_app.include_router(router)
    test_app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="test-user", role="admin", is_admin=True, is_active=True
    )
    return test_app


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncClient:
    """Async HTTP client bound to the test app."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


def _make_candidate(branch: str = "feat/done", pr: int = 42):
    from models.git import PruneCandidate

    return PruneCandidate(
        branch=branch,
        pr_number=pr,
        pr_url=f"https://github.com/o/r/pull/{pr}",
        pr_title="title",
        merged_at=datetime.now(UTC),
        last_commit_sha="abc123",
    )


def _make_scan_result(candidates=None, skipped=None):
    from models.git import PruneScanResult

    return PruneScanResult(
        candidates=candidates or [],
        skipped=skipped or [],
    )


def _make_execute_result(deleted=None, errors=None):
    from models.git import PruneExecuteResult

    return PruneExecuteResult(
        candidates=[],
        skipped=[],
        deleted=deleted or [],
        errors=errors or [],
    )


# =============================================================================
# Tests
# =============================================================================


PRUNE_PATH = "/git/projects/proj-1/branches/prune-merged"


class TestPruneMergedEndpoint:
    """POST /projects/{id}/branches/prune-merged contract tests."""

    @pytest.mark.asyncio
    async def test_dry_run_returns_candidates_no_delete(self, client):
        """dry_run=True must call find_prune_candidates but not prune_merged_branches."""
        git_service = MagicMock()
        git_service.find_prune_candidates.return_value = _make_scan_result(
            candidates=[_make_candidate("feat/a", pr=1)]
        )
        git_service.prune_merged_branches = MagicMock()

        with (
            patch("api.git.branches.get_git_service_for_project", return_value=git_service),
            patch("api.git.branches.get_github_service", return_value=MagicMock()),
            patch("api.git.branches._get_db_session", new=AsyncMock(return_value=None)),
        ):
            resp = await client.post(PRUNE_PATH, json={"dry_run": True})

        assert resp.status_code == 200
        body = resp.json()
        assert [c["branch"] for c in body["candidates"]] == ["feat/a"]
        assert body["deleted"] == []
        git_service.prune_merged_branches.assert_not_called()

    @pytest.mark.asyncio
    async def test_actual_run_invokes_batch_delete(self, client):
        """dry_run=False must call prune_merged_branches and surface deleted list."""
        git_service = MagicMock()
        candidate = _make_candidate("feat/a", pr=1)
        git_service.find_prune_candidates.return_value = _make_scan_result(
            candidates=[candidate]
        )
        git_service.prune_merged_branches.return_value = _make_execute_result(
            deleted=["feat/a"]
        )

        with (
            patch("api.git.branches.get_git_service_for_project", return_value=git_service),
            patch("api.git.branches.get_github_service", return_value=MagicMock()),
            patch("api.git.branches._get_db_session", new=AsyncMock(return_value=None)),
        ):
            resp = await client.post(PRUNE_PATH, json={"dry_run": False})

        assert resp.status_code == 200
        body = resp.json()
        assert body["deleted"] == ["feat/a"]
        git_service.prune_merged_branches.assert_called_once()

    @pytest.mark.asyncio
    async def test_skipped_preserved_across_phases(self, client):
        """Skip reasons from scan must survive the execute phase."""
        from models.git import PruneSkipped

        git_service = MagicMock()
        skipped = [PruneSkipped(branch="main", reason="default_branch")]
        git_service.find_prune_candidates.return_value = _make_scan_result(
            candidates=[_make_candidate("feat/a", pr=1)],
            skipped=skipped,
        )
        git_service.prune_merged_branches.return_value = _make_execute_result(
            deleted=["feat/a"]
        )

        with (
            patch("api.git.branches.get_git_service_for_project", return_value=git_service),
            patch("api.git.branches.get_github_service", return_value=MagicMock()),
            patch("api.git.branches._get_db_session", new=AsyncMock(return_value=None)),
        ):
            resp = await client.post(PRUNE_PATH, json={"dry_run": False})

        body = resp.json()
        assert body["skipped"][0]["branch"] == "main"
        assert body["skipped"][0]["reason"] == "default_branch"

    @pytest.mark.asyncio
    async def test_no_github_token_returns_503(self, client):
        """When GITHUB_TOKEN is missing, get_github_service raises 503."""
        from fastapi import HTTPException

        git_service = MagicMock()

        def raise_503():
            raise HTTPException(status_code=503, detail="GitHub service not available")

        with (
            patch("api.git.branches.get_git_service_for_project", return_value=git_service),
            patch("api.git.branches.get_github_service", side_effect=raise_503),
            patch("api.git.branches._get_db_session", new=AsyncMock(return_value=None)),
        ):
            resp = await client.post(PRUNE_PATH, json={"dry_run": True})

        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_extra_protected_forwarded_to_service(self, client):
        """extra_protected from request body must reach find_prune_candidates."""
        git_service = MagicMock()
        git_service.find_prune_candidates.return_value = _make_scan_result()

        with (
            patch("api.git.branches.get_git_service_for_project", return_value=git_service),
            patch("api.git.branches.get_github_service", return_value=MagicMock()),
            patch("api.git.branches._get_db_session", new=AsyncMock(return_value=None)),
        ):
            resp = await client.post(
                PRUNE_PATH,
                json={"dry_run": True, "extra_protected": ["release/v1", "hotfix/x"]},
            )

        assert resp.status_code == 200
        kwargs = git_service.find_prune_candidates.call_args.kwargs
        assert kwargs["extra_protected"] == ["release/v1", "hotfix/x"]

    @pytest.mark.asyncio
    async def test_dry_run_defaults_to_true(self, client):
        """Empty body → dry_run defaults to True (safe default)."""
        git_service = MagicMock()
        git_service.find_prune_candidates.return_value = _make_scan_result()
        git_service.prune_merged_branches = MagicMock()

        with (
            patch("api.git.branches.get_git_service_for_project", return_value=git_service),
            patch("api.git.branches.get_github_service", return_value=MagicMock()),
            patch("api.git.branches._get_db_session", new=AsyncMock(return_value=None)),
        ):
            resp = await client.post(PRUNE_PATH, json={})

        assert resp.status_code == 200
        git_service.prune_merged_branches.assert_not_called()

    @pytest.mark.asyncio
    async def test_git_service_error_returns_400(self, client):
        """Service errors during scan become HTTP 400."""
        from services.git_service import GitServiceError

        git_service = MagicMock()
        git_service.find_prune_candidates.side_effect = GitServiceError("bad repo")

        with (
            patch("api.git.branches.get_git_service_for_project", return_value=git_service),
            patch("api.git.branches.get_github_service", return_value=MagicMock()),
            patch("api.git.branches._get_db_session", new=AsyncMock(return_value=None)),
        ):
            resp = await client.post(PRUNE_PATH, json={"dry_run": True})

        assert resp.status_code == 400
        assert "bad repo" in resp.json()["detail"]
