"""Regression test: the Agent Monitor router must be mounted on the real app.

``api.v1.agent_monitor.router`` existed but was never passed to
``app.include_router`` in ``api/app.py`` — every route in the file 404'd in
production even though ``tests/backend/api/test_agent_monitor.py`` passed
(it builds its own throwaway ``FastAPI()`` app). This pins the router to the
app actually served by ``create_app()``, and pins that it inherits the same
auth dependency other protected routers use (``api.deps.get_current_user``)
rather than being mounted wide open.
"""

from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from api import deps as api_deps


@pytest_asyncio.fixture
async def app():
    from api.app import create_app

    test_app = create_app(title="Agent Monitor Registration Test", debug=True)
    test_app.dependency_overrides[api_deps.get_db_session] = lambda: MagicMock()
    yield test_app
    test_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_metrics_summary_route_is_mounted_on_the_real_app(app, client):
    """Router must be registered — a 404 here means it's still orphaned."""
    app.dependency_overrides[api_deps.get_current_user] = lambda: MagicMock(
        id="u1", role="admin", is_admin=True, is_active=True
    )
    res = await client.get("/api/v1/agents/metrics/summary")
    assert res.status_code != 404, "agent_monitor router is not mounted on the app"
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_metrics_summary_requires_authentication(app, client):
    """Unauthenticated callers must not reach agent monitoring data."""
    res = await client.get("/api/v1/agents/metrics/summary")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_monitor_agents_list_requires_authentication(app, client):
    res = await client.get("/api/v1/agents/monitor/agents")
    assert res.status_code == 401
