"""Version service for config version control."""

import asyncio
import logging
import os
from typing import Any

from models.config_version import (
    ConfigType,
    ConfigVersion,
    ConfigVersionCompare,
    ConfigVersionCreate,
    ConfigVersionHistory,
    ConfigVersionStats,
    RollbackRequest,
    RollbackResult,
    VersionStatus,
)
from utils.time import utcnow

logger = logging.getLogger(__name__)

# Environment variable to control storage mode
USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

# In-memory storage
_versions: dict[str, ConfigVersion] = {}

# Index: (config_type, config_id) -> list of version IDs (ordered by version number)
_version_index: dict[tuple[str, str], list[str]] = {}


class VersionService:
    """Service for managing config versions."""

    # ─────────────────────────────────────────────────────────────
    # Version Creation
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def create_version(data: ConfigVersionCreate) -> ConfigVersion:
        """Create a new version of a config."""
        key = (data.config_type.value, data.config_id)

        # Determine version number
        existing_version_ids = _version_index.get(key, [])
        if existing_version_ids:
            # Get the highest version number
            existing_versions = [_versions[vid] for vid in existing_version_ids if vid in _versions]
            max_version = max((v.version for v in existing_versions), default=0)
            new_version_number = max_version + 1

            # Archive previous active version
            for v in existing_versions:
                if v.status == VersionStatus.ACTIVE:
                    v.status = VersionStatus.ARCHIVED

            # Calculate diff from previous
            previous_version = next(
                (
                    v
                    for v in reversed(existing_versions)
                    if v.status in (VersionStatus.ACTIVE, VersionStatus.ARCHIVED)
                ),
                None,
            )
            diff = None
            if previous_version:
                diff = _compute_diff(previous_version.data, data.data)
        else:
            new_version_number = 1
            diff = None

        # Create new version
        version = ConfigVersion(
            config_type=data.config_type,
            config_id=data.config_id,
            version=new_version_number,
            label=data.label,
            description=data.description,
            status=VersionStatus.ACTIVE,
            data=data.data,
            changes_summary=_generate_changes_summary(diff) if diff else "Initial version",
            diff_from_previous=diff,
            created_by=data.created_by,
        )

        # Store
        _versions[version.id] = version
        if key not in _version_index:
            _version_index[key] = []
        _version_index[key].append(version.id)

        # Sync to DB (fire-and-forget)
        VersionService._fire_and_forget_save(version)
        # Also sync any archived previous versions
        if existing_version_ids:
            for vid in existing_version_ids:
                v = _versions.get(vid)
                if v and v.status == VersionStatus.ARCHIVED and v.id != version.id:
                    VersionService._fire_and_forget_save(v)

        return version

    # ─────────────────────────────────────────────────────────────
    # Version Retrieval
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_version(version_id: str) -> ConfigVersion | None:
        """Get a specific version by ID."""
        return _versions.get(version_id)

    @staticmethod
    def get_latest_version(config_type: ConfigType, config_id: str) -> ConfigVersion | None:
        """Get the latest (active) version of a config."""
        key = (config_type.value, config_id)
        version_ids = _version_index.get(key, [])
        if not version_ids:
            return None

        # Find the active version (or latest if none active)
        versions = [_versions[vid] for vid in version_ids if vid in _versions]
        active = next((v for v in reversed(versions) if v.status == VersionStatus.ACTIVE), None)
        if active:
            return active
        # Return the latest by version number
        return max(versions, key=lambda v: v.version) if versions else None

    @staticmethod
    def get_version_by_number(
        config_type: ConfigType,
        config_id: str,
        version_number: int,
    ) -> ConfigVersion | None:
        """Get a specific version by version number."""
        key = (config_type.value, config_id)
        version_ids = _version_index.get(key, [])
        for vid in version_ids:
            v = _versions.get(vid)
            if v and v.version == version_number:
                return v
        return None

    @staticmethod
    def get_history(
        config_type: ConfigType,
        config_id: str,
        limit: int = 50,
    ) -> ConfigVersionHistory:
        """Get version history for a config."""
        key = (config_type.value, config_id)
        version_ids = _version_index.get(key, [])

        versions = [_versions[vid] for vid in version_ids if vid in _versions]
        versions.sort(key=lambda v: v.version, reverse=True)

        current_version = next(
            (v.version for v in versions if v.status == VersionStatus.ACTIVE),
            0,
        )

        return ConfigVersionHistory(
            config_type=config_type,
            config_id=config_id,
            versions=versions[:limit],
            current_version=current_version,
            total_versions=len(versions),
        )

    @staticmethod
    def list_versions(
        config_type: ConfigType | None = None,
        status: VersionStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ConfigVersion]:
        """List versions with optional filtering."""
        versions = list(_versions.values())

        # Filter by type
        if config_type:
            versions = [v for v in versions if v.config_type == config_type]

        # Filter by status
        if status:
            versions = [v for v in versions if v.status == status]

        # Sort by created_at descending
        versions.sort(key=lambda v: v.created_at, reverse=True)

        return versions[offset : offset + limit]

    # ─────────────────────────────────────────────────────────────
    # Version Comparison
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def compare_versions(version_id_a: str, version_id_b: str) -> ConfigVersionCompare | None:
        """Compare two versions."""
        version_a = _versions.get(version_id_a)
        version_b = _versions.get(version_id_b)

        if not version_a or not version_b:
            return None

        diff = _compute_diff(version_a.data, version_b.data)
        added, removed, modified = _categorize_changes(version_a.data, version_b.data)

        return ConfigVersionCompare(
            version_a=version_a,
            version_b=version_b,
            diff=diff,
            added_keys=added,
            removed_keys=removed,
            modified_keys=modified,
            is_identical=len(added) == 0 and len(removed) == 0 and len(modified) == 0,
        )

    # ─────────────────────────────────────────────────────────────
    # Rollback
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def rollback(request: RollbackRequest) -> RollbackResult:
        """Rollback to a specific version."""
        target_version = _versions.get(request.target_version_id)
        if not target_version:
            return RollbackResult(
                success=False,
                message=f"Version {request.target_version_id} not found",
            )

        # Get current active version
        current = VersionService.get_latest_version(
            target_version.config_type,
            target_version.config_id,
        )
        if not current:
            return RollbackResult(
                success=False,
                message="No current version found",
            )

        if current.id == target_version.id:
            return RollbackResult(
                success=False,
                message="Target version is already active",
            )

        # Create a new version from the target's data
        new_version = VersionService.create_version(
            ConfigVersionCreate(
                config_type=target_version.config_type,
                config_id=target_version.config_id,
                data=target_version.data,
                label=f"Rollback to v{target_version.version}",
                description=request.reason
                or f"Rolled back from v{current.version} to v{target_version.version}",
                created_by=request.created_by,
            )
        )

        # Mark as rolled back
        new_version.rolled_back_from = current.id
        new_version.rolled_back_at = utcnow()

        # Sync rollback metadata to DB
        VersionService._fire_and_forget_save(new_version)

        return RollbackResult(
            success=True,
            new_version=new_version,
            message=f"Successfully rolled back from v{current.version} to v{target_version.version}",
            rolled_back_from_version=current.version,
            rolled_back_to_version=target_version.version,
        )

    # ─────────────────────────────────────────────────────────────
    # Version Management
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def update_label(version_id: str, label: str) -> ConfigVersion | None:
        """Update the label of a version."""
        version = _versions.get(version_id)
        if not version:
            return None
        version.label = label
        VersionService._fire_and_forget_save(version)
        return version

    @staticmethod
    def archive_version(version_id: str) -> ConfigVersion | None:
        """Archive a version."""
        version = _versions.get(version_id)
        if not version:
            return None
        version.status = VersionStatus.ARCHIVED
        VersionService._fire_and_forget_save(version)
        return version

    @staticmethod
    def delete_version(version_id: str) -> bool:
        """Delete a version (only drafts can be deleted)."""
        version = _versions.get(version_id)
        if not version:
            return False
        if version.status != VersionStatus.DRAFT:
            return False

        # Remove from index
        key = (version.config_type.value, version.config_id)
        if key in _version_index and version_id in _version_index[key]:
            _version_index[key].remove(version_id)

        # Remove from storage
        del _versions[version_id]
        VersionService._fire_and_forget_delete(version_id)
        return True

    # ─────────────────────────────────────────────────────────────
    # Statistics
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_stats() -> ConfigVersionStats:
        """Get version statistics."""
        versions = list(_versions.values())

        # By type
        by_type: dict[str, int] = {}
        for v in versions:
            by_type[v.config_type.value] = by_type.get(v.config_type.value, 0) + 1

        # By status
        by_status: dict[str, int] = {}
        for v in versions:
            by_status[v.status.value] = by_status.get(v.status.value, 0) + 1

        # Recent versions
        recent = sorted(versions, key=lambda v: v.created_at, reverse=True)[:10]

        # Most versioned configs
        config_counts: dict[tuple[str, str], int] = {}
        for v in versions:
            key = (v.config_type.value, v.config_id)
            config_counts[key] = config_counts.get(key, 0) + 1

        most_versioned = [
            {"config_type": k[0], "config_id": k[1], "version_count": c}
            for k, c in sorted(config_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        ]

        return ConfigVersionStats(
            total_versions=len(versions),
            versions_by_type=by_type,
            versions_by_status=by_status,
            recent_versions=recent,
            most_versioned_configs=most_versioned,
        )

    # ─────────────────────────────────────────────────────────────
    # Database Persistence (dual-write)
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def _save_version_to_db(version: ConfigVersion) -> None:
        """Save or update a config version in the database."""
        try:
            from sqlalchemy import select

            from db.database import async_session_factory
            from db.models import ConfigVersionModel

            async with async_session_factory() as db:
                # Upsert: check if exists
                result = await db.execute(
                    select(ConfigVersionModel).where(ConfigVersionModel.id == version.id)
                )
                existing = result.scalar_one_or_none()

                if existing:
                    existing.status = version.status.value
                    existing.label = version.label
                    existing.description = version.description
                    existing.rolled_back_from = version.rolled_back_from
                    existing.rolled_back_at = version.rolled_back_at
                else:
                    model = ConfigVersionModel(
                        id=version.id,
                        config_type=version.config_type.value,
                        config_id=version.config_id,
                        version=version.version,
                        label=version.label,
                        data=version.data,
                        diff_from_previous=version.diff_from_previous,
                        status=version.status.value,
                        changes_summary=version.changes_summary,
                        created_by=version.created_by,
                        description=version.description,
                        rolled_back_from=version.rolled_back_from,
                        rolled_back_at=version.rolled_back_at,
                        created_at=version.created_at,
                    )
                    db.add(model)
                await db.commit()
        except Exception:
            logger.warning("Failed to save config version %s to DB", version.id, exc_info=True)

    @staticmethod
    async def _delete_version_from_db(version_id: str) -> None:
        """Delete a config version from the database."""
        try:
            from sqlalchemy import delete

            from db.database import async_session_factory
            from db.models import ConfigVersionModel

            async with async_session_factory() as db:
                await db.execute(
                    delete(ConfigVersionModel).where(ConfigVersionModel.id == version_id)
                )
                await db.commit()
        except Exception:
            logger.warning("Failed to delete config version %s from DB", version_id, exc_info=True)

    @staticmethod
    async def load_versions_from_db() -> int:
        """Load all config versions from DB into in-memory cache.

        Returns the number of versions loaded.
        """
        try:
            from sqlalchemy import select

            from db.database import async_session_factory
            from db.models import ConfigVersionModel

            async with async_session_factory() as db:
                result = await db.execute(select(ConfigVersionModel))
                rows = result.scalars().all()

            loaded = 0
            for row in rows:
                if row.id in _versions:
                    continue  # Skip already-loaded versions

                version = ConfigVersion(
                    id=row.id,
                    config_type=ConfigType(row.config_type),
                    config_id=row.config_id,
                    version=row.version,
                    label=row.label,
                    description=row.description,
                    status=VersionStatus(row.status),
                    data=row.data or {},
                    changes_summary=row.changes_summary,
                    diff_from_previous=row.diff_from_previous,
                    created_by=row.created_by,
                    created_at=row.created_at or utcnow(),
                    rolled_back_from=row.rolled_back_from,
                    rolled_back_at=row.rolled_back_at,
                )

                _versions[version.id] = version
                key = (version.config_type.value, version.config_id)
                if key not in _version_index:
                    _version_index[key] = []
                if version.id not in _version_index[key]:
                    _version_index[key].append(version.id)
                loaded += 1

            # Sort index lists by version number
            for key in _version_index:
                _version_index[key].sort(
                    key=lambda vid: _versions[vid].version if vid in _versions else 0
                )

            logger.info("Loaded %d config versions from DB", loaded)
            return loaded
        except Exception:
            logger.warning("Failed to load config versions from DB", exc_info=True)
            return 0

    @staticmethod
    def _fire_and_forget_save(version: ConfigVersion) -> None:
        """Fire-and-forget DB save for a config version."""
        if not USE_DATABASE:
            return
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(VersionService._save_version_to_db(version))
        except RuntimeError:
            pass  # No running event loop

    @staticmethod
    def _fire_and_forget_delete(version_id: str) -> None:
        """Fire-and-forget DB delete for a config version."""
        if not USE_DATABASE:
            return
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(VersionService._delete_version_from_db(version_id))
        except RuntimeError:
            pass  # No running event loop


# ─────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────


def _compute_diff(old_data: dict[str, Any], new_data: dict[str, Any]) -> dict[str, Any]:
    """Compute a simple diff between two dicts."""
    diff: dict[str, Any] = {"added": {}, "removed": {}, "modified": {}}

    all_keys = set(old_data.keys()) | set(new_data.keys())

    for key in all_keys:
        if key not in old_data:
            diff["added"][key] = new_data[key]
        elif key not in new_data:
            diff["removed"][key] = old_data[key]
        elif old_data[key] != new_data[key]:
            diff["modified"][key] = {
                "old": old_data[key],
                "new": new_data[key],
            }

    return diff


def _categorize_changes(
    old_data: dict[str, Any],
    new_data: dict[str, Any],
) -> tuple[list[str], list[str], list[str]]:
    """Categorize changes into added, removed, modified keys."""
    added = [k for k in new_data if k not in old_data]
    removed = [k for k in old_data if k not in new_data]
    modified = [k for k in old_data if k in new_data and old_data[k] != new_data[k]]
    return added, removed, modified


def _generate_changes_summary(diff: dict[str, Any]) -> str:
    """Generate a human-readable summary of changes."""
    parts = []
    if diff.get("added"):
        parts.append(f"Added {len(diff['added'])} fields")
    if diff.get("removed"):
        parts.append(f"Removed {len(diff['removed'])} fields")
    if diff.get("modified"):
        parts.append(f"Modified {len(diff['modified'])} fields")
    return ", ".join(parts) if parts else "No changes"
