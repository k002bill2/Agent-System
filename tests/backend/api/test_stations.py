"""Station CRUD API tests."""

import pytest
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI

from api.v1.stations import router, _stations


@pytest.fixture
def app():
    """Create test FastAPI app."""
    test_app = FastAPI()
    test_app.include_router(router)
    return test_app


@pytest.fixture
async def client(app):
    """Create async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest.fixture(autouse=True)
def clear_stations():
    """Clear in-memory stations before each test."""
    _stations.clear()
    yield
    _stations.clear()


# ─────────────────────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_station(client):
    """충전소 생성 테스트."""
    response = await client.post(
        "/api/v1/stations",
        json={
            "name": "Test Station",
            "address": "123 Test Street",
            "total_connectors": 8,
            "available_connectors": 5,
            "status": "available",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Station"
    assert data["address"] == "123 Test Street"
    assert data["total_connectors"] == 8
    assert data["available_connectors"] == 5
    assert data["status"] == "available"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_station_invalid_status(client):
    """잘못된 상태로 생성 시 400 에러."""
    response = await client.post(
        "/api/v1/stations",
        json={
            "name": "Bad Station",
            "address": "456 Bad Street",
            "status": "invalid_status",
        },
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_station_invalid_connectors(client):
    """available > total 시 400 에러."""
    response = await client.post(
        "/api/v1/stations",
        json={
            "name": "Bad Station",
            "address": "456 Bad Street",
            "total_connectors": 3,
            "available_connectors": 5,
            "status": "available",
        },
    )

    assert response.status_code == 400


# ─────────────────────────────────────────────────────────────
# READ
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_stations_empty(client):
    """빈 목록 조회."""
    response = await client.get("/api/v1/stations")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_list_stations_with_pagination(client):
    """페이지네이션 테스트."""
    # Create 5 stations
    for i in range(5):
        await client.post(
            "/api/v1/stations",
            json={"name": f"Station {i}", "address": f"Address {i}", "status": "available"},
        )

    # Get page 1 with size 2
    response = await client.get("/api/v1/stations?page=1&page_size=2")
    data = response.json()

    assert response.status_code == 200
    assert len(data["items"]) == 2
    assert data["total"] == 5
    assert data["total_pages"] == 3


@pytest.mark.asyncio
async def test_list_stations_with_status_filter(client):
    """상태 필터 테스트."""
    await client.post(
        "/api/v1/stations",
        json={"name": "Available", "address": "Addr 1", "status": "available"},
    )
    await client.post(
        "/api/v1/stations",
        json={"name": "Busy", "address": "Addr 2", "status": "busy"},
    )

    response = await client.get("/api/v1/stations?status=available")
    data = response.json()

    assert data["total"] == 1
    assert data["items"][0]["name"] == "Available"


@pytest.mark.asyncio
async def test_get_station(client):
    """단일 충전소 조회."""
    create_response = await client.post(
        "/api/v1/stations",
        json={"name": "Test", "address": "Addr", "status": "available"},
    )
    station_id = create_response.json()["id"]

    response = await client.get(f"/api/v1/stations/{station_id}")

    assert response.status_code == 200
    assert response.json()["name"] == "Test"


@pytest.mark.asyncio
async def test_get_station_not_found(client):
    """존재하지 않는 충전소 조회 시 404."""
    response = await client.get("/api/v1/stations/nonexistent-id")
    assert response.status_code == 404


# ─────────────────────────────────────────────────────────────
# UPDATE
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_station(client):
    """충전소 수정 테스트."""
    create_response = await client.post(
        "/api/v1/stations",
        json={"name": "Original", "address": "Addr", "status": "available"},
    )
    station_id = create_response.json()["id"]

    response = await client.put(
        f"/api/v1/stations/{station_id}",
        json={"name": "Updated Name", "status": "busy"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["status"] == "busy"
    assert data["address"] == "Addr"  # unchanged


@pytest.mark.asyncio
async def test_update_station_not_found(client):
    """존재하지 않는 충전소 수정 시 404."""
    response = await client.put(
        "/api/v1/stations/nonexistent-id",
        json={"name": "New Name"},
    )
    assert response.status_code == 404


# ─────────────────────────────────────────────────────────────
# DELETE
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_station(client):
    """충전소 삭제 테스트."""
    create_response = await client.post(
        "/api/v1/stations",
        json={"name": "To Delete", "address": "Addr", "status": "available"},
    )
    station_id = create_response.json()["id"]

    response = await client.delete(f"/api/v1/stations/{station_id}")
    assert response.status_code == 200

    # Verify deleted
    get_response = await client.get(f"/api/v1/stations/{station_id}")
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_delete_station_not_found(client):
    """존재하지 않는 충전소 삭제 시 404."""
    response = await client.delete("/api/v1/stations/nonexistent-id")
    assert response.status_code == 404
