"""RAG must resolve projects stored in the database registry."""

from unittest.mock import MagicMock

import pytest

from api import rag


@pytest.mark.asyncio
async def test_resolve_project_falls_back_to_the_database_registry(monkeypatch) -> None:
    """A DB project UUID must work for RAG indexing and queries.

    `_get_db_project` 이 아니라 그 아래의 `authorize_db_project` 를 갈아끼운다 —
    `_get_db_project` 를 통째로 스텁하면 `_resolve_project` 가 실제로 하는 일
    (인가 결과 변환 + 빈 경로 거부)을 전부 건너뛰어 동어반복이 된다.
    """
    row = MagicMock()
    row.id = "05c4302d-9602-4b70-8267-65964f5bed4d"
    row.name = "Agent System"
    row.path = "/workspace/agent-system"
    row.description = None
    row.organization_id = None

    async def _authorized(project_id, user, session, min_role="viewer"):
        return row

    monkeypatch.setattr(rag, "get_project", lambda _project_id: None)
    monkeypatch.setattr(rag, "authorize_db_project", _authorized)

    resolved = await rag._resolve_project(row.id, MagicMock(), MagicMock())

    assert resolved is not None
    assert resolved.id == row.id
    assert resolved.path == "/workspace/agent-system"
