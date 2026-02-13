"""Station CRUD API endpoints.

충전소(Station) 관리를 위한 RESTful API.
GET, POST, PUT, DELETE 엔드포인트를 제공합니다.
"""

from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/stations", tags=["stations"])


# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────


class StationBase(BaseModel):
    """충전소 기본 필드."""

    name: str = Field(..., min_length=1, max_length=200, description="충전소 이름")
    address: str = Field(..., min_length=1, description="충전소 주소")
    latitude: float | None = Field(None, ge=-90, le=90, description="위도")
    longitude: float | None = Field(None, ge=-180, le=180, description="경도")
    total_connectors: int = Field(default=0, ge=0, description="총 커넥터 수")
    available_connectors: int = Field(default=0, ge=0, description="가용 커넥터 수")
    status: str = Field(default="available", description="상태 (available, busy, offline)")


class StationCreate(StationBase):
    """충전소 생성 요청."""

    pass


class StationUpdate(BaseModel):
    """충전소 수정 요청 (부분 업데이트 지원)."""

    name: str | None = Field(None, min_length=1, max_length=200)
    address: str | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    total_connectors: int | None = Field(None, ge=0)
    available_connectors: int | None = Field(None, ge=0)
    status: str | None = None


class StationResponse(StationBase):
    """충전소 응답."""

    id: str
    created_at: str
    updated_at: str


class PaginatedResponse(BaseModel):
    """페이지네이션 응답."""

    items: list[StationResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ─────────────────────────────────────────────────────────────
# In-memory Storage (실제로는 DB 사용)
# ─────────────────────────────────────────────────────────────

_stations: dict[str, dict[str, Any]] = {}


def _validate_status(status: str) -> str:
    """상태 값 검증."""
    valid_statuses = {"available", "busy", "offline"}
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: '{status}'. Must be one of: {', '.join(valid_statuses)}",
        )
    return status


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedResponse)
async def list_stations(
    page: int = Query(1, ge=1, description="페이지 번호"),
    page_size: int = Query(20, ge=1, le=100, description="페이지 크기"),
    status: str | None = Query(None, description="상태 필터"),
    search: str | None = Query(None, description="이름/주소 검색"),
) -> PaginatedResponse:
    """충전소 목록 조회 (페이지네이션)."""
    stations = list(_stations.values())

    # 필터링
    if status:
        _validate_status(status)
        stations = [s for s in stations if s["status"] == status]

    if search:
        search_lower = search.lower()
        stations = [
            s
            for s in stations
            if search_lower in s["name"].lower() or search_lower in s["address"].lower()
        ]

    # 정렬 (최신 먼저)
    stations.sort(key=lambda s: s["created_at"], reverse=True)

    total = len(stations)
    total_pages = max(1, (total + page_size - 1) // page_size)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = stations[start:end]

    return PaginatedResponse(
        items=[StationResponse(**s) for s in page_items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{station_id}", response_model=StationResponse)
async def get_station(station_id: str) -> StationResponse:
    """단일 충전소 조회."""
    station = _stations.get(station_id)
    if not station:
        raise HTTPException(status_code=404, detail=f"Station '{station_id}' not found")
    return StationResponse(**station)


@router.post("", response_model=StationResponse, status_code=201)
async def create_station(request: StationCreate) -> StationResponse:
    """충전소 생성."""
    _validate_status(request.status)

    if request.available_connectors > request.total_connectors:
        raise HTTPException(
            status_code=400,
            detail="available_connectors cannot exceed total_connectors",
        )

    station_id = str(uuid4())
    now = datetime.utcnow().isoformat()

    station_data = {
        "id": station_id,
        **request.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    _stations[station_id] = station_data

    return StationResponse(**station_data)


@router.put("/{station_id}", response_model=StationResponse)
async def update_station(station_id: str, request: StationUpdate) -> StationResponse:
    """충전소 수정 (부분 업데이트)."""
    station = _stations.get(station_id)
    if not station:
        raise HTTPException(status_code=404, detail=f"Station '{station_id}' not found")

    update_data = request.model_dump(exclude_unset=True)

    if "status" in update_data and update_data["status"] is not None:
        _validate_status(update_data["status"])

    # 커넥터 수 검증
    total = update_data.get("total_connectors", station["total_connectors"])
    available = update_data.get("available_connectors", station["available_connectors"])
    if available > total:
        raise HTTPException(
            status_code=400,
            detail="available_connectors cannot exceed total_connectors",
        )

    station.update(update_data)
    station["updated_at"] = datetime.utcnow().isoformat()

    return StationResponse(**station)


@router.delete("/{station_id}")
async def delete_station(station_id: str) -> dict[str, str]:
    """충전소 삭제."""
    if station_id not in _stations:
        raise HTTPException(status_code=404, detail=f"Station '{station_id}' not found")

    del _stations[station_id]
    return {"message": f"Station '{station_id}' deleted successfully"}
