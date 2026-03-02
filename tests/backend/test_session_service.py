"""Tests for session service."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from utils.time import utcnow
from models.project import Project
from services.session_service import (
    SessionMetadata,
    SessionService,
    get_session_service,
    set_session_service,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _make_project(
    project_id: str = "proj-1",
    name: str = "Test Project",
    path: str = "/tmp/test-project",
    claude_md: str | None = None,
) -> Project:
    """Build a minimal Project instance without touching the filesystem."""
    return Project(
        id=project_id,
        name=name,
        path=path,
        description="A test project",
        claude_md=claude_md,
    )


def _make_service() -> SessionService:
    """Return a fresh in-memory SessionService."""
    return SessionService(use_database=False)


# ---------------------------------------------------------------------------
# SessionMetadata unit tests
# ---------------------------------------------------------------------------


class TestSessionMetadata:
    """Tests for the SessionMetadata helper class."""

    def setup_method(self):
        now = utcnow()
        self.meta = SessionMetadata(
            session_id="test-sid",
            created_at=now,
            last_activity=now,
            expires_at=now + timedelta(days=7),
        )

    # -- is_expired -----------------------------------------------------------

    def test_is_expired_returns_false_for_future_expiry(self):
        assert self.meta.is_expired() is False

    def test_is_expired_returns_true_for_past_expiry(self):
        self.meta.expires_at = utcnow() - timedelta(seconds=1)
        assert self.meta.is_expired() is True

    # -- is_inactive ----------------------------------------------------------

    def test_is_inactive_returns_false_for_recent_activity(self):
        # last_activity was just set in setup_method
        assert self.meta.is_inactive(threshold_hours=24) is False

    def test_is_inactive_returns_true_for_old_activity(self):
        self.meta.last_activity = utcnow() - timedelta(hours=25)
        assert self.meta.is_inactive(threshold_hours=24) is True

    def test_is_inactive_custom_threshold(self):
        self.meta.last_activity = utcnow() - timedelta(hours=2)
        # 1-hour threshold → inactive
        assert self.meta.is_inactive(threshold_hours=1) is True
        # 3-hour threshold → still active
        assert self.meta.is_inactive(threshold_hours=3) is False

    # -- touch ----------------------------------------------------------------

    def test_touch_updates_last_activity(self):
        old_activity = self.meta.last_activity
        # Make sure there is a measurable gap
        self.meta.last_activity = old_activity - timedelta(minutes=5)
        self.meta.touch()
        assert self.meta.last_activity > old_activity - timedelta(minutes=5)

    # -- to_dict / from_dict round-trip ---------------------------------------

    def test_to_dict_contains_required_keys(self):
        d = self.meta.to_dict()
        assert "session_id" in d
        assert "created_at" in d
        assert "last_activity" in d
        assert "expires_at" in d

    def test_to_dict_values_are_iso_strings(self):
        d = self.meta.to_dict()
        # Should be parseable ISO-8601 strings
        datetime.fromisoformat(d["created_at"])
        datetime.fromisoformat(d["last_activity"])
        datetime.fromisoformat(d["expires_at"])

    def test_from_dict_roundtrip(self):
        d = self.meta.to_dict()
        restored = SessionMetadata.from_dict(d)
        assert restored.session_id == self.meta.session_id
        # Compare truncated to microseconds to avoid any tiny float drift
        assert abs((restored.created_at - self.meta.created_at).total_seconds()) < 0.001
        assert abs((restored.last_activity - self.meta.last_activity).total_seconds()) < 0.001
        assert abs((restored.expires_at - self.meta.expires_at).total_seconds()) < 0.001

    def test_from_dict_preserves_expired_state(self):
        self.meta.expires_at = utcnow() - timedelta(hours=1)
        restored = SessionMetadata.from_dict(self.meta.to_dict())
        assert restored.is_expired() is True


# ---------------------------------------------------------------------------
# SessionService – in-memory mode lifecycle tests
# ---------------------------------------------------------------------------


class TestSessionServiceLifecycle:
    """Full create → get → update → delete lifecycle in in-memory mode."""

    def setup_method(self):
        self.service = _make_service()

    # -- create_session -------------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_session_returns_string_id(self):
        sid = await self.service.create_session()
        assert isinstance(sid, str)
        assert len(sid) > 0

    @pytest.mark.asyncio
    async def test_create_session_with_explicit_id(self):
        sid = await self.service.create_session(session_id="my-explicit-id")
        assert sid == "my-explicit-id"

    @pytest.mark.asyncio
    async def test_create_session_stores_user_id(self):
        sid = await self.service.create_session(user_id="user-42")
        state = await self.service.get_session(sid)
        assert state is not None
        assert state["user_id"] == "user-42"

    @pytest.mark.asyncio
    async def test_create_session_with_project(self):
        project = _make_project(claude_md="# Hello")
        sid = await self.service.create_session(project=project)
        state = await self.service.get_session(sid)
        assert state is not None
        assert state["project"]["id"] == project.id
        assert state["project"]["name"] == project.name
        assert state["system_context"] == "# Hello"

    @pytest.mark.asyncio
    async def test_create_session_with_project_no_claude_md(self):
        project = _make_project()  # claude_md=None
        sid = await self.service.create_session(project=project)
        state = await self.service.get_session(sid)
        assert state is not None
        # system_context should not be set when claude_md is absent
        assert state.get("system_context") is None

    @pytest.mark.asyncio
    async def test_create_session_embeds_metadata(self):
        sid = await self.service.create_session()
        state = self.service._memory_sessions[sid]
        assert "_metadata" in state
        assert state["_metadata"]["session_id"] == sid

    # -- get_session ----------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_session_returns_none_for_unknown_id(self):
        result = await self.service.get_session("nonexistent-id")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_session_updates_last_activity_by_default(self):
        sid = await self.service.create_session()
        # Manually age the last_activity
        meta = self.service._session_metadata[sid]
        meta.last_activity = utcnow() - timedelta(minutes=10)
        old_activity = meta.last_activity

        await self.service.get_session(sid, update_activity=True)
        assert self.service._session_metadata[sid].last_activity > old_activity

    @pytest.mark.asyncio
    async def test_get_session_skips_activity_update_when_disabled(self):
        sid = await self.service.create_session()
        meta = self.service._session_metadata[sid]
        meta.last_activity = utcnow() - timedelta(minutes=10)
        frozen = meta.last_activity

        await self.service.get_session(sid, update_activity=False)
        assert self.service._session_metadata[sid].last_activity == frozen

    # -- update_session -------------------------------------------------------

    @pytest.mark.asyncio
    async def test_update_session_returns_true_on_success(self):
        sid = await self.service.create_session()
        state = await self.service.get_session(sid)
        state["context"]["foo"] = "bar"
        result = await self.service.update_session(sid, state)
        assert result is True

    @pytest.mark.asyncio
    async def test_update_session_persists_changes(self):
        sid = await self.service.create_session()
        state = await self.service.get_session(sid)
        state["context"]["answer"] = 42
        await self.service.update_session(sid, state)

        refreshed = await self.service.get_session(sid)
        assert refreshed["context"]["answer"] == 42

    @pytest.mark.asyncio
    async def test_update_session_returns_false_for_unknown_id(self):
        from models.agent_state import create_initial_state

        dummy_state = create_initial_state(session_id="ghost")
        result = await self.service.update_session("ghost", dummy_state)
        assert result is False

    # -- delete_session -------------------------------------------------------

    @pytest.mark.asyncio
    async def test_delete_session_returns_true_on_success(self):
        sid = await self.service.create_session()
        result = await self.service.delete_session(sid)
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_session_makes_session_unreachable(self):
        sid = await self.service.create_session()
        await self.service.delete_session(sid)
        result = await self.service.get_session(sid)
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_session_removes_metadata(self):
        sid = await self.service.create_session()
        await self.service.delete_session(sid)
        assert sid not in self.service._session_metadata

    @pytest.mark.asyncio
    async def test_delete_session_returns_false_for_unknown_id(self):
        result = await self.service.delete_session("nonexistent-id")
        assert result is False


# ---------------------------------------------------------------------------
# SessionService – expiration and inactivity
# ---------------------------------------------------------------------------


class TestSessionServiceExpiration:
    """Tests related to TTL expiration and inactivity handling."""

    def setup_method(self):
        self.service = _make_service()

    @pytest.mark.asyncio
    async def test_get_session_returns_none_for_expired_session(self):
        sid = await self.service.create_session(ttl_days=1)
        # Manually expire
        self.service._session_metadata[sid].expires_at = utcnow() - timedelta(seconds=1)

        result = await self.service.get_session(sid)
        assert result is None
        # Also verify the session was auto-cleaned from memory
        assert sid not in self.service._memory_sessions

    @pytest.mark.asyncio
    async def test_cleanup_expired_sessions_removes_expired(self):
        sid1 = await self.service.create_session()
        sid2 = await self.service.create_session()

        # Expire sid1
        self.service._session_metadata[sid1].expires_at = (
            utcnow() - timedelta(seconds=1)
        )

        cleaned = await self.service.cleanup_expired_sessions()
        assert cleaned >= 1
        assert sid1 not in self.service._memory_sessions
        assert sid2 in self.service._memory_sessions

    @pytest.mark.asyncio
    async def test_cleanup_inactive_sessions(self):
        sid = await self.service.create_session()
        # Age the last_activity well beyond any reasonable threshold
        self.service._session_metadata[sid].last_activity = (
            utcnow() - timedelta(hours=72)
        )

        cleaned = await self.service.cleanup_expired_sessions()
        assert cleaned >= 1
        assert sid not in self.service._memory_sessions

    @pytest.mark.asyncio
    async def test_cleanup_active_session_is_kept(self):
        sid = await self.service.create_session()
        cleaned = await self.service.cleanup_expired_sessions()
        assert cleaned == 0
        assert sid in self.service._memory_sessions

    @pytest.mark.asyncio
    async def test_cleanup_legacy_session_without_metadata(self):
        """Sessions stored without a metadata entry but with embedded _metadata
        should also be cleaned up when expired."""
        from models.agent_state import create_initial_state

        sid = "legacy-sid"
        state = create_initial_state(session_id=sid)
        old_meta = SessionMetadata(
            session_id=sid,
            created_at=utcnow() - timedelta(days=10),
            last_activity=utcnow() - timedelta(hours=48),
            expires_at=utcnow() - timedelta(days=3),
        )
        state["_metadata"] = old_meta.to_dict()
        self.service._memory_sessions[sid] = state
        # No entry in _session_metadata (simulating legacy session)

        cleaned = await self.service.cleanup_expired_sessions()
        assert cleaned >= 1
        assert sid not in self.service._memory_sessions


# ---------------------------------------------------------------------------
# SessionService – refresh_session and get_session_info
# ---------------------------------------------------------------------------


class TestSessionServiceRefreshAndInfo:
    """Tests for refresh_session and get_session_info."""

    def setup_method(self):
        self.service = _make_service()

    @pytest.mark.asyncio
    async def test_refresh_session_extends_expiry(self):
        sid = await self.service.create_session(ttl_days=1)
        old_expiry = self.service._session_metadata[sid].expires_at

        refreshed = await self.service.refresh_session(sid, extend_days=7)
        assert refreshed is True
        new_expiry = self.service._session_metadata[sid].expires_at
        assert new_expiry > old_expiry

    @pytest.mark.asyncio
    async def test_refresh_session_returns_false_for_unknown_id(self):
        result = await self.service.refresh_session("ghost-sid")
        assert result is False

    @pytest.mark.asyncio
    async def test_get_session_info_returns_correct_fields(self):
        sid = await self.service.create_session(user_id="u1")
        info = await self.service.get_session_info(sid)
        assert info is not None
        assert info["session_id"] == sid
        assert "created_at" in info
        assert "last_activity" in info
        assert "expires_at" in info
        assert info["is_expired"] is False
        assert info["is_inactive"] is False
        assert info["ttl_remaining_hours"] > 0

    @pytest.mark.asyncio
    async def test_get_session_info_returns_none_for_expired(self):
        sid = await self.service.create_session()
        self.service._session_metadata[sid].expires_at = (
            utcnow() - timedelta(seconds=1)
        )
        info = await self.service.get_session_info(sid)
        assert info is None


# ---------------------------------------------------------------------------
# SessionService – list_sessions
# ---------------------------------------------------------------------------


class TestSessionServiceList:
    """Tests for list_sessions."""

    def setup_method(self):
        self.service = _make_service()

    @pytest.mark.asyncio
    async def test_list_sessions_returns_all_when_no_filter(self):
        await self.service.create_session(user_id="alice")
        await self.service.create_session(user_id="bob")
        sessions = await self.service.list_sessions()
        assert len(sessions) >= 2

    @pytest.mark.asyncio
    async def test_list_sessions_respects_limit(self):
        for _ in range(5):
            await self.service.create_session()
        sessions = await self.service.list_sessions(limit=3)
        assert len(sessions) <= 3

    @pytest.mark.asyncio
    async def test_list_sessions_entry_structure(self):
        sid = await self.service.create_session(user_id="user-xyz")
        sessions = await self.service.list_sessions()
        matching = [s for s in sessions if s["id"] == sid]
        assert len(matching) == 1
        entry = matching[0]
        assert entry["user_id"] == "user-xyz"
        assert "status" in entry
        assert "created_at" in entry


# ---------------------------------------------------------------------------
# SessionService – quota enforcement
# ---------------------------------------------------------------------------


class TestSessionServiceQuota:
    """Tests for organisation quota enforcement.

    OrganizationService and QuotaService are imported lazily inside
    create_session's function body:

        from services.organization_service import OrganizationService
        from services.quota_service import QuotaService

    Because patch() cannot target a name that does not yet exist in the module
    namespace, we inject mock modules into sys.modules so the lazy imports
    resolve to our fakes.
    """

    def setup_method(self):
        self.service = _make_service()

    @pytest.mark.asyncio
    async def test_quota_exceeded_raises_value_error(self):
        """When quota check returns not-allowed, create_session must raise ValueError."""
        import sys

        mock_org_module = MagicMock()
        mock_quota_module = MagicMock()

        mock_org = MagicMock()
        mock_org_module.OrganizationService.get_organization.return_value = mock_org

        mock_check = MagicMock()
        mock_check.allowed = False
        mock_check.message = "Daily session quota exceeded"
        mock_quota_module.QuotaService.check_session_quota.return_value = mock_check

        with (
            patch.dict(
                sys.modules,
                {
                    "services.organization_service": mock_org_module,
                    "services.quota_service": mock_quota_module,
                },
            )
        ):
            with pytest.raises(ValueError, match="quota"):
                await self.service.create_session(organization_id="org-1")

    @pytest.mark.asyncio
    async def test_quota_allowed_creates_session_normally(self):
        """When quota check returns allowed, create_session proceeds."""
        import sys

        mock_org_module = MagicMock()
        mock_quota_module = MagicMock()

        mock_org = MagicMock()
        mock_org_module.OrganizationService.get_organization.return_value = mock_org

        mock_check = MagicMock()
        mock_check.allowed = True
        mock_quota_module.QuotaService.check_session_quota.return_value = mock_check

        with (
            patch.dict(
                sys.modules,
                {
                    "services.organization_service": mock_org_module,
                    "services.quota_service": mock_quota_module,
                },
            )
        ):
            sid = await self.service.create_session(organization_id="org-2")
            assert isinstance(sid, str)


# ---------------------------------------------------------------------------
# Global service accessor helpers
# ---------------------------------------------------------------------------


class TestGlobalServiceHelpers:
    """Tests for get_session_service / set_session_service singletons."""

    def setup_method(self):
        # Reset global to None before each test
        import services.session_service as mod

        mod._session_service = None

    def test_get_session_service_creates_instance(self):
        svc = get_session_service()
        assert isinstance(svc, SessionService)

    def test_get_session_service_returns_same_instance(self):
        svc1 = get_session_service()
        svc2 = get_session_service()
        assert svc1 is svc2

    def test_set_session_service_replaces_instance(self):
        custom = SessionService(use_database=False)
        set_session_service(custom)
        assert get_session_service() is custom
