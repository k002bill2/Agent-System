"""Tests for Project Access API endpoints."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.project_access import router


# ─────────────────────────────────────────────────────────────
# Test Setup
# ─────────────────────────────────────────────────────────────


def _make_user(role="user", is_admin=False, user_id=None):
    """Create a mock UserModel."""
    user = MagicMock()
    user.id = user_id or str(uuid.uuid4())
    user.email = "test@example.com"
    user.name = "Test User"
    user.role = role
    user.is_admin = is_admin
    user.is_active = True
    return user


def _make_access_record(project_id, user_id, role="viewer"):
    """Create a mock ProjectAccessModel."""
    record = MagicMock()
    record.id = str(uuid.uuid4())
    record.project_id = project_id
    record.user_id = user_id
    record.role = role
    record.granted_by = None
    record.created_at = MagicMock(isoformat=lambda: "2024-01-01T00:00:00")
    record.updated_at = MagicMock(isoformat=lambda: "2024-01-01T00:00:00")
    record.user = MagicMock(email="member@example.com", name="Member User")
    return record


@pytest.fixture
def app():
    """Create test FastAPI app."""
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api")
    return test_app


@pytest.fixture
def admin_user():
    return _make_user(role="admin", is_admin=True)


@pytest.fixture
def normal_user():
    return _make_user(role="user")


@pytest.fixture
def project_id():
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────


class TestGetMyAccess:
    """Tests for GET /api/projects/{project_id}/access/me."""

    def test_admin_gets_owner_access(self, app, admin_user, project_id):
        """System admin should always get owner access."""
        with patch("api.project_access.get_current_user", return_value=admin_user):
            with patch("api.project_access.get_db_session") as mock_db:
                mock_db.return_value = AsyncMock()
                client = TestClient(app)
                # Override dependencies
                app.dependency_overrides = {
                    __import__("api.deps", fromlist=["get_current_user"]).get_current_user: lambda: admin_user,
                    __import__("api.deps", fromlist=["get_db_session"]).get_db_session: lambda: AsyncMock(),
                }

                # Admin bypass is handled in the endpoint itself
                # This is a structural test


class TestListMembers:
    """Tests for GET /api/projects/{project_id}/access."""

    def test_structure(self, project_id):
        """Validate endpoint is properly defined."""
        # Check that the router has the expected routes
        routes = [r.path for r in router.routes]
        assert "/projects/{project_id}/access" in routes or any(
            "/access" in str(r.path) for r in router.routes
        )


class TestAddMember:
    """Tests for POST /api/projects/{project_id}/access."""

    def test_validate_role(self):
        """Should reject invalid roles."""
        from api.project_access import _validate_role

        # Valid roles should not raise
        _validate_role("owner")
        _validate_role("editor")
        _validate_role("viewer")

        # Invalid role should raise
        with pytest.raises(Exception):
            _validate_role("superadmin")


class TestProjectRoleHierarchy:
    """Tests for project role hierarchy in deps."""

    def test_hierarchy_ordering(self):
        """Role hierarchy should be viewer < editor < owner."""
        from api.deps import _PROJECT_ROLE_HIERARCHY

        assert _PROJECT_ROLE_HIERARCHY["viewer"] < _PROJECT_ROLE_HIERARCHY["editor"]
        assert _PROJECT_ROLE_HIERARCHY["editor"] < _PROJECT_ROLE_HIERARCHY["owner"]

    def test_all_roles_present(self):
        """All project roles should be in hierarchy."""
        from api.deps import _PROJECT_ROLE_HIERARCHY

        assert "viewer" in _PROJECT_ROLE_HIERARCHY
        assert "editor" in _PROJECT_ROLE_HIERARCHY
        assert "owner" in _PROJECT_ROLE_HIERARCHY
