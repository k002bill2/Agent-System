import pytest


@pytest.mark.anyio
async def test_monitoring_capability_is_disabled_in_database_mode(monkeypatch):
    monkeypatch.setenv("USE_DATABASE", "true")

    from api.monitoring import get_monitoring_capabilities

    monkeypatch.setattr("api.monitoring.require_project_role", _allow_project_role)

    result = await get_monitoring_capabilities("project-1", current_user=object(), db=object())

    assert result.mode == "database"
    assert result.health_config == "disabled"
    assert result.health == "disabled"
    assert result.checks == "disabled"


async def _allow_project_role(*_args, **_kwargs):
    return "viewer"
