"""RAG must resolve projects stored in the database registry."""

from unittest.mock import AsyncMock

import pytest

from api import rag
from models.project import Project


@pytest.mark.asyncio
async def test_resolve_project_falls_back_to_the_database_registry(monkeypatch) -> None:
    """A DB project UUID must work for RAG indexing and queries."""
    database_project = Project(
        id="05c4302d-9602-4b70-8267-65964f5bed4d",
        name="Agent System",
        path="/workspace/agent-system",
    )
    monkeypatch.setattr(rag, "get_project", lambda _project_id: None)
    monkeypatch.setattr(rag, "_get_db_project", AsyncMock(return_value=database_project))

    assert await rag._resolve_project(database_project.id) == database_project
