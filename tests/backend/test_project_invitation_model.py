import pytest
from datetime import datetime, timedelta
from db.models import ProjectInvitationModel

def test_invitation_model_fields():
    inv = ProjectInvitationModel(
        id="test-id",
        project_id="proj-1",
        invited_by="user-1",
        email="test@example.com",
        role="editor",
        token="secure-token-abc",
        status="pending",
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    assert inv.role == "editor"
    assert inv.status == "pending"
    assert inv.email == "test@example.com"
