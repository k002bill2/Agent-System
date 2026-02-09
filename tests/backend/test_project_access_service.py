"""Tests for ProjectAccessService."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.project_access_service import ProjectAccessService


@pytest.fixture
def mock_db():
    """Create a mock async database session."""
    db = AsyncMock()
    return db


@pytest.fixture
def project_id():
    return str(uuid.uuid4())


@pytest.fixture
def user_id():
    return str(uuid.uuid4())


class TestGrantAccess:
    """Tests for ProjectAccessService.grant_access."""

    @pytest.mark.asyncio
    async def test_grant_access_new_user(self, mock_db, project_id, user_id):
        """Should create a new access record for a user."""
        # Mock check_access to return None (no existing access)
        with patch.object(
            ProjectAccessService, "check_access", return_value=None
        ):
            mock_db.flush = AsyncMock()

            result = await ProjectAccessService.grant_access(
                db=mock_db,
                project_id=project_id,
                user_id=user_id,
                role="editor",
                granted_by="admin-id",
            )

            assert result.project_id == project_id
            assert result.user_id == user_id
            assert result.role == "editor"
            assert result.granted_by == "admin-id"
            mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_grant_access_existing_user_raises(self, mock_db, project_id, user_id):
        """Should raise ValueError when user already has access."""
        with patch.object(
            ProjectAccessService, "check_access", return_value="viewer"
        ):
            with pytest.raises(ValueError, match="already has"):
                await ProjectAccessService.grant_access(
                    db=mock_db,
                    project_id=project_id,
                    user_id=user_id,
                    role="editor",
                )


class TestRevokeAccess:
    """Tests for ProjectAccessService.revoke_access."""

    @pytest.mark.asyncio
    async def test_revoke_access_success(self, mock_db, project_id, user_id):
        """Should return True when access record is deleted."""
        mock_result = MagicMock()
        mock_result.rowcount = 1
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await ProjectAccessService.revoke_access(mock_db, project_id, user_id)
        assert result is True

    @pytest.mark.asyncio
    async def test_revoke_access_not_found(self, mock_db, project_id, user_id):
        """Should return False when no access record exists."""
        mock_result = MagicMock()
        mock_result.rowcount = 0
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await ProjectAccessService.revoke_access(mock_db, project_id, user_id)
        assert result is False


class TestCheckAccess:
    """Tests for ProjectAccessService.check_access."""

    @pytest.mark.asyncio
    async def test_check_access_found(self, mock_db, project_id, user_id):
        """Should return role string when access exists."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = "editor"
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await ProjectAccessService.check_access(mock_db, project_id, user_id)
        assert result == "editor"

    @pytest.mark.asyncio
    async def test_check_access_not_found(self, mock_db, project_id, user_id):
        """Should return None when no access exists."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await ProjectAccessService.check_access(mock_db, project_id, user_id)
        assert result is None


class TestHasAnyAccessControl:
    """Tests for ProjectAccessService.has_any_access_control."""

    @pytest.mark.asyncio
    async def test_has_access_control_true(self, mock_db, project_id):
        """Should return True when project has access records."""
        mock_result = MagicMock()
        mock_result.scalar.return_value = 3
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await ProjectAccessService.has_any_access_control(mock_db, project_id)
        assert result is True

    @pytest.mark.asyncio
    async def test_has_access_control_false(self, mock_db, project_id):
        """Should return False when project has no access records."""
        mock_result = MagicMock()
        mock_result.scalar.return_value = 0
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await ProjectAccessService.has_any_access_control(mock_db, project_id)
        assert result is False


class TestUpdateRole:
    """Tests for ProjectAccessService.update_role."""

    @pytest.mark.asyncio
    async def test_update_role_not_found(self, mock_db, project_id, user_id):
        """Should raise ValueError when no access record exists."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="has no access"):
            await ProjectAccessService.update_role(mock_db, project_id, user_id, "editor")


class TestGetAccessibleProjectIds:
    """Tests for ProjectAccessService.get_accessible_project_ids."""

    @pytest.mark.asyncio
    async def test_returns_none_when_no_explicit_access(self, mock_db, user_id):
        """Should return None when user has no explicit access records."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await ProjectAccessService.get_accessible_project_ids(mock_db, user_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_project_ids(self, mock_db, user_id):
        """Should return list of project IDs the user has access to."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = ["proj-1", "proj-2"]
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await ProjectAccessService.get_accessible_project_ids(mock_db, user_id)
        assert result == ["proj-1", "proj-2"]
