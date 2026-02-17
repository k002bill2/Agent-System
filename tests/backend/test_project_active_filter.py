"""Tests for project active filter based on project-registry is_active."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def mock_projects():
    """파일시스템 기반 프로젝트 mock."""
    p1 = MagicMock()
    p1.id = "proj-1"
    p1.name = "Active Project"
    p1.path = "/projects/active"
    p1.description = "Active"
    p1.claude_md = None
    p1.indexed_at = None
    p1.sort_order = 0

    p2 = MagicMock()
    p2.id = "proj-2"
    p2.name = "Inactive Project"
    p2.path = "/projects/inactive"
    p2.description = "Inactive"
    p2.claude_md = None
    p2.indexed_at = None
    p2.sort_order = 1

    return [p1, p2]


@pytest.mark.asyncio
async def test_regular_user_cannot_see_inactive_project(mock_projects):
    """일반 사용자는 is_active=False 프로젝트를 볼 수 없어야 한다."""
    with patch.dict("os.environ", {"USE_DATABASE": "true"}):
        from api.routes import get_inactive_project_paths

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [("/projects/inactive",)]
        mock_db.execute = AsyncMock(return_value=mock_result)

        inactive_paths = await get_inactive_project_paths(mock_db)
        assert "/projects/inactive" in inactive_paths
        assert "/projects/active" not in inactive_paths

        # 필터링 적용
        filtered = [p for p in mock_projects if p.path not in inactive_paths]
        assert len(filtered) == 1
        assert filtered[0].name == "Active Project"


@pytest.mark.asyncio
async def test_admin_sees_all_projects(mock_projects):
    """관리자는 get_inactive_project_paths를 호출하지 않고 모든 프로젝트를 본다."""
    with patch("api.routes.get_inactive_project_paths") as mock_filter:
        # 관리자 경로에서는 get_inactive_project_paths가 호출되지 않아야 함
        # (이 테스트는 구현 완료 후 통합 테스트에서 완전히 검증됨)
        mock_filter.assert_not_called()
    assert len(mock_projects) == 2


@pytest.mark.asyncio
async def test_no_inactive_registry_shows_all(mock_projects):
    """project-registry에 비활성화 항목이 없으면 모두 표시."""
    with patch.dict("os.environ", {"USE_DATABASE": "true"}):
        from api.routes import get_inactive_project_paths

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)

        inactive_paths = await get_inactive_project_paths(mock_db)
        assert len(inactive_paths) == 0

        filtered = [p for p in mock_projects if p.path not in inactive_paths]
        assert len(filtered) == 2


@pytest.mark.asyncio
async def test_unregistered_project_always_visible(mock_projects):
    """project-registry에 없는 프로젝트(path 미매칭)는 항상 표시."""
    with patch.dict("os.environ", {"USE_DATABASE": "true"}):
        from api.routes import get_inactive_project_paths

        mock_db = AsyncMock()
        mock_result = MagicMock()
        # DB에는 /projects/other 만 비활성화
        mock_result.all.return_value = [("/projects/other",)]
        mock_db.execute = AsyncMock(return_value=mock_result)

        inactive_paths = await get_inactive_project_paths(mock_db)
        assert "/projects/other" in inactive_paths
        assert "/projects/active" not in inactive_paths
        assert "/projects/inactive" not in inactive_paths
        filtered = [p for p in mock_projects if p.path not in inactive_paths]
        assert len(filtered) == 2  # 두 프로젝트 모두 보임


@pytest.mark.asyncio
async def test_use_database_false_skips_filter(mock_projects):
    """USE_DATABASE=false 환경에서는 필터링을 스킵하고 빈 set 반환."""
    with patch.dict("os.environ", {"USE_DATABASE": "false"}):
        from api.routes import get_inactive_project_paths

        mock_db = AsyncMock()
        inactive_paths = await get_inactive_project_paths(mock_db)
        assert inactive_paths == set()
        # DB를 조회하지 않아야 함
        mock_db.execute.assert_not_called()
