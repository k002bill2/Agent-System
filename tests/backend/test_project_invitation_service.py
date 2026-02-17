"""Tests for ProjectInvitationService."""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src" / "backend"))


@pytest.mark.asyncio
async def test_create_invitation_returns_token():
    """초대 생성 시 token이 포함된 invitation 반환."""
    from services.project_invitation_service import ProjectInvitationService

    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=mock_result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    inv = await ProjectInvitationService.create_invitation(
        db=db,
        project_id="proj-1",
        invited_by="user-1",
        email="test@example.com",
        role="editor",
    )
    assert inv.token is not None
    assert len(inv.token) > 20
    assert inv.status == "pending"


@pytest.mark.asyncio
async def test_accept_invitation_wrong_email_raises():
    """초대 이메일과 수락 유저 이메일 불일치 시 ValueError 발생."""
    from services.project_invitation_service import ProjectInvitationService

    inv = MagicMock()
    inv.email = "other@example.com"
    inv.status = "pending"
    inv.expires_at = datetime.utcnow() + timedelta(days=1)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = inv

    db = AsyncMock()
    db.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(ValueError, match="이메일이 일치하지 않습니다"):
        await ProjectInvitationService.accept_invitation(
            db=db,
            token="valid-token",
            user_id="user-1",
            user_email="wrong@example.com",
        )


@pytest.mark.asyncio
async def test_cancel_invitation_returns_false_if_not_found():
    """존재하지 않는 초대 취소 시 False 반환."""
    from services.project_invitation_service import ProjectInvitationService

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    db = AsyncMock()
    db.execute = AsyncMock(return_value=mock_result)

    result = await ProjectInvitationService.cancel_invitation(
        db=db,
        invitation_id="nonexistent",
        project_id="proj-1",
    )
    assert result is False
