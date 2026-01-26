"""Config version API routes."""

from fastapi import APIRouter, HTTPException, Query

from models.config_version import (
    ConfigType,
    ConfigVersion,
    ConfigVersionCreate,
    ConfigVersionCompare,
    ConfigVersionHistory,
    VersionStatus,
    RollbackRequest,
    RollbackResult,
    ConfigVersionStats,
)
from services.version_service import VersionService


router = APIRouter(prefix="/config-versions", tags=["config-versions"])


# ─────────────────────────────────────────────────────────────
# Version CRUD
# ─────────────────────────────────────────────────────────────


@router.post("", response_model=ConfigVersion)
async def create_version(data: ConfigVersionCreate):
    """Create a new config version."""
    return VersionService.create_version(data)


@router.get("", response_model=list[ConfigVersion])
async def list_versions(
    config_type: ConfigType | None = None,
    status: VersionStatus | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """List config versions with optional filtering."""
    return VersionService.list_versions(
        config_type=config_type,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.get("/stats", response_model=ConfigVersionStats)
async def get_stats():
    """Get version statistics."""
    return VersionService.get_stats()


@router.get("/{version_id}", response_model=ConfigVersion)
async def get_version(version_id: str):
    """Get a specific version by ID."""
    version = VersionService.get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.patch("/{version_id}/label")
async def update_label(version_id: str, label: str):
    """Update the label of a version."""
    version = VersionService.update_label(version_id, label)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post("/{version_id}/archive")
async def archive_version(version_id: str):
    """Archive a version."""
    version = VersionService.archive_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return {"success": True, "message": "Version archived"}


@router.delete("/{version_id}")
async def delete_version(version_id: str):
    """Delete a version (only drafts can be deleted)."""
    if not VersionService.delete_version(version_id):
        raise HTTPException(
            status_code=400,
            detail="Version not found or cannot be deleted (only drafts can be deleted)",
        )
    return {"success": True, "message": "Version deleted"}


# ─────────────────────────────────────────────────────────────
# History & Retrieval
# ─────────────────────────────────────────────────────────────


@router.get("/history/{config_type}/{config_id}", response_model=ConfigVersionHistory)
async def get_history(
    config_type: ConfigType,
    config_id: str,
    limit: int = Query(default=50, ge=1, le=200),
):
    """Get version history for a specific config."""
    return VersionService.get_history(config_type, config_id, limit)


@router.get("/latest/{config_type}/{config_id}", response_model=ConfigVersion)
async def get_latest_version(config_type: ConfigType, config_id: str):
    """Get the latest (active) version of a config."""
    version = VersionService.get_latest_version(config_type, config_id)
    if not version:
        raise HTTPException(status_code=404, detail="No versions found for this config")
    return version


@router.get("/by-number/{config_type}/{config_id}/{version_number}", response_model=ConfigVersion)
async def get_version_by_number(
    config_type: ConfigType,
    config_id: str,
    version_number: int,
):
    """Get a specific version by its version number."""
    version = VersionService.get_version_by_number(config_type, config_id, version_number)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


# ─────────────────────────────────────────────────────────────
# Comparison & Diff
# ─────────────────────────────────────────────────────────────


@router.get("/compare/{version_id_a}/{version_id_b}", response_model=ConfigVersionCompare)
async def compare_versions(version_id_a: str, version_id_b: str):
    """Compare two versions and get the diff."""
    result = VersionService.compare_versions(version_id_a, version_id_b)
    if not result:
        raise HTTPException(status_code=404, detail="One or both versions not found")
    return result


# ─────────────────────────────────────────────────────────────
# Rollback
# ─────────────────────────────────────────────────────────────


@router.post("/rollback", response_model=RollbackResult)
async def rollback_version(request: RollbackRequest):
    """Rollback to a specific version."""
    result = VersionService.rollback(request)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)
    return result
