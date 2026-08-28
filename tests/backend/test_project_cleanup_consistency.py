"""`cascade_delete` must not report a partially deleted project as success.

Unregistering is what makes a project unreachable, so it has to be the last
step and conditional on the rest. Reporting success after a failed step strands
whatever survived - sessions, the vector index, the symlink - with no route
left to reach it, and the dashboard tells the operator the delete worked.
"""

from unittest.mock import AsyncMock

import pytest

from models.project import Project

pytestmark = pytest.mark.asyncio


def _project(tmp_path):
    return Project(id="db-uuid", name="DB Project", path=str(tmp_path))


def _service(monkeypatch, tmp_path, *, db_records=0, db_error=None):
    from services.project_cleanup_service import ProjectCleanupService

    service = ProjectCleanupService()
    if db_error is not None:
        monkeypatch.setattr(service, "_delete_db_records", AsyncMock(side_effect=db_error))
    else:
        monkeypatch.setattr(service, "_delete_db_records", AsyncMock(return_value=db_records))
    return service


async def test_db_record_failure_keeps_the_project_registered(monkeypatch, tmp_path):
    """A failed session purge must not be followed by dropping the registry row.

    The project stays listed so the operator can retry; steps 1-5 are each
    idempotent, so the retry is safe.
    """
    monkeypatch.setenv("USE_DATABASE", "true")
    service = _service(monkeypatch, tmp_path, db_error=RuntimeError("connection reset"))

    registry_calls: list[str] = []

    async def record(project_id):
        registry_calls.append(project_id)
        return True

    monkeypatch.setattr(service, "_delete_db_project_registry", record)

    summary = await service.cascade_delete(_project(tmp_path))

    assert summary.success is False
    assert summary.registry_unregistered is False
    assert registry_calls == []
    assert any("DB cleanup failed" in e for e in summary.errors)


async def test_registry_failure_is_reported_as_failure(monkeypatch, tmp_path):
    """A registry deletion that raises must surface, not be swallowed."""
    monkeypatch.setenv("USE_DATABASE", "true")
    service = _service(monkeypatch, tmp_path)

    async def boom(_project_id):
        raise RuntimeError("registry row locked")

    monkeypatch.setattr(service, "_delete_db_project_registry", boom)

    summary = await service.cascade_delete(_project(tmp_path))

    assert summary.success is False
    assert summary.registry_unregistered is False
    assert any("Registry unregistration failed" in e for e in summary.errors)


async def test_clean_run_unregisters_both_registries(monkeypatch, tmp_path):
    """The happy path still reports success and drops the DB registry row."""
    monkeypatch.setenv("USE_DATABASE", "true")
    service = _service(monkeypatch, tmp_path, db_records=3)

    removed: list[str] = []

    async def record(project_id):
        removed.append(project_id)
        return True

    monkeypatch.setattr(service, "_delete_db_project_registry", record)

    summary = await service.cascade_delete(_project(tmp_path))

    assert summary.success is True
    assert summary.registry_unregistered is True
    assert summary.sessions_deleted == 3
    assert removed == ["db-uuid"]
    assert summary.errors == []
