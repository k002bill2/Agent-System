"""Project cleanup service for cascade deletion.

Handles cleanup of all project-related data:
- DB records (sessions -> tasks, messages, approvals, feedbacks cascade)
- RAG vector index
- Health cache
- Config monitor cache
- Symlink removal
- Registry unregistration
"""

import logging
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from models.project import Project

logger = logging.getLogger(__name__)


class DeletionPreview(BaseModel):
    """Preview of what will be deleted."""

    project_id: str
    project_name: str
    project_path: str

    # DB records
    sessions_count: int = 0
    tasks_count: int = 0
    messages_count: int = 0
    # 항상 0 이다. `approvals` 테이블은 #306 에서 제거했다. 대시보드의 삭제
    # 프리뷰가 이 필드를 합계에 더하므로 응답 형태 유지를 위해 남긴다.
    approvals_count: int = 0
    feedbacks_count: int = 0
    dataset_entries_count: int = 0

    # Other resources
    has_rag_index: bool = False
    rag_chunks_count: int = 0
    has_symlink: bool = False

    # Safety note
    source_files_preserved: bool = True


class CleanupSummary(BaseModel):
    """Summary of cleanup operations."""

    project_id: str
    success: bool

    # Deleted counts
    sessions_deleted: int = 0
    rag_index_deleted: bool = False
    health_cache_cleared: bool = False
    config_cache_cleared: bool = False
    symlink_removed: bool = False
    registry_unregistered: bool = False

    # Any errors encountered
    errors: list[str] = []


class ProjectCleanupService:
    """Service for cascade project deletion."""

    def __init__(self):
        self._is_docker = False

    async def get_deletion_preview(self, project: "Project") -> DeletionPreview:
        """Get preview of what will be deleted.

        Takes an already-resolved project rather than an id: the caller owns
        both authorization and registry resolution, and the filesystem registry
        this service used to read is empty of DB-mode ids.

        Args:
            project: Resolved project (``api.deps.get_project_or_404``)

        Returns:
            DeletionPreview
        """
        from models.project import get_projects_dir

        project_id = project.id

        preview = DeletionPreview(
            project_id=project_id,
            project_name=project.name,
            project_path=project.path,
        )

        # Count DB records (if database is enabled)
        try:
            db_counts = await self._count_db_records(project_id)
            preview.sessions_count = db_counts.get("sessions", 0)
            preview.tasks_count = db_counts.get("tasks", 0)
            preview.messages_count = db_counts.get("messages", 0)
            preview.feedbacks_count = db_counts.get("feedbacks", 0)
            preview.dataset_entries_count = db_counts.get("dataset_entries", 0)
        except Exception as e:
            logger.warning(f"Could not count DB records: {e}")

        # Check RAG index
        try:
            from services.rag_service import QDRANT_AVAILABLE, get_vector_store

            if QDRANT_AVAILABLE:
                store = get_vector_store()
                stats = store.get_collection_stats(project_id)
                preview.has_rag_index = stats.get("indexed", False)
                preview.rag_chunks_count = stats.get("document_count", 0)
        except Exception as e:
            logger.debug(f"RAG service not available: {e}")

        # Check symlink or project directory
        projects_dir = get_projects_dir()
        project_entry = projects_dir / project_id
        preview.has_symlink = project_entry.is_symlink() or (
            project_entry.is_dir() and project_entry.parent == projects_dir
        )

        return preview

    async def cascade_delete(self, project: "Project") -> CleanupSummary:
        """Perform cascade delete of all project data.

        Cleanup order:
        1. DB records (sessions cascade to tasks, messages, etc.)
        2. RAG vector index
        3. Health cache
        4. Config monitor cache
        5. Symlink removal
        6. Registry unregistration (in-memory registry + DB registry rows)

        Takes an already-resolved project: see ``get_deletion_preview``.

        Args:
            project: Resolved project (``api.deps.get_project_or_404``)

        Returns:
            CleanupSummary with results
        """
        from models.project import get_projects_dir, unregister_project

        project_id = project.id
        summary = CleanupSummary(project_id=project_id, success=True)

        # 1. Delete DB records
        try:
            deleted_count = await self._delete_db_records(project_id)
            summary.sessions_deleted = deleted_count
            logger.info(f"Deleted {deleted_count} sessions for project {project_id}")
        except Exception as e:
            error_msg = f"DB cleanup failed: {e}"
            logger.error(error_msg)
            summary.errors.append(error_msg)

        # 2. Delete RAG index
        try:
            from services.rag_service import QDRANT_AVAILABLE, get_vector_store

            if QDRANT_AVAILABLE:
                store = get_vector_store()
                deleted = await store.delete_project_index(project_id)
                summary.rag_index_deleted = deleted
                if deleted:
                    logger.info(f"Deleted RAG index for project {project_id}")
        except Exception as e:
            logger.debug(f"RAG index cleanup skipped: {e}")

        # 3. Clear health cache
        try:
            from api.routes import _project_health

            if project_id in _project_health:
                del _project_health[project_id]
                summary.health_cache_cleared = True
                logger.info(f"Cleared health cache for project {project_id}")
        except Exception as e:
            logger.debug(f"Health cache cleanup skipped: {e}")

        # 4. Clear config monitor cache
        try:
            from services.project_config_monitor import get_project_config_monitor

            monitor = get_project_config_monitor()
            removed = monitor.remove_external_project(project.path)
            summary.config_cache_cleared = removed
            if removed:
                logger.info(f"Removed from config monitor: {project.path}")
        except Exception as e:
            logger.debug(f"Config monitor cleanup skipped: {e}")

        # 5. Remove symlink or e2e test directory
        try:
            import asyncio
            import shutil

            projects_dir = get_projects_dir()
            project_entry = projects_dir / project_id

            if project_entry.is_symlink():
                project_entry.unlink()
                summary.symlink_removed = True
                logger.info(f"Removed symlink: {project_entry}")
            elif project_entry.is_dir() and project_entry.parent == projects_dir:
                # Non-symlink directory inside projects/ (e.g. e2e test residual)
                await asyncio.to_thread(shutil.rmtree, project_entry)
                summary.symlink_removed = True
                logger.info(f"Removed project directory: {project_entry}")
        except Exception as e:
            error_msg = f"Symlink removal failed: {e}"
            logger.error(error_msg)
            summary.errors.append(error_msg)

        # 6. Unregister from registry
        #
        # Both registries have to go. The in-memory one is keyed by the
        # projects/<name> symlink, the DB one by ProjectModel.id -- dropping
        # only the former leaves the project listed by GET /api/projects with
        # its sessions, index and symlink already gone.
        try:
            unregister_project(project_id)
            await self._delete_db_project_registry(project_id)
            summary.registry_unregistered = True
            logger.info(f"Unregistered project: {project_id}")
        except Exception as e:
            error_msg = f"Registry unregistration failed: {e}"
            logger.error(error_msg)
            summary.errors.append(error_msg)

        # Mark as failed if critical errors occurred
        if summary.errors and not summary.registry_unregistered:
            summary.success = False

        return summary

    async def _delete_db_project_registry(self, project_id: str) -> bool:
        """Remove the project's DB registry rows (project + access + invites).

        Mirrors ``DELETE /api/project-registry/{id}/permanent``: sessions,
        activities and audit rows keep their project_id for historical record.
        No-op outside database mode, where there is no registry row.
        """
        import os

        if os.getenv("USE_DATABASE", "").lower() != "true":
            return False

        from sqlalchemy import delete as sa_delete
        from sqlalchemy import select

        from db.database import async_session_factory
        from db.models import ProjectAccessModel, ProjectInvitationModel, ProjectModel

        async with async_session_factory() as db:
            row = (
                await db.execute(select(ProjectModel).where(ProjectModel.id == project_id))
            ).scalar_one_or_none()
            if row is None:
                return False

            await db.execute(
                sa_delete(ProjectAccessModel).where(ProjectAccessModel.project_id == project_id)
            )
            await db.execute(
                sa_delete(ProjectInvitationModel).where(
                    ProjectInvitationModel.project_id == project_id
                )
            )
            await db.delete(row)
            await db.commit()

        logger.info(f"Removed DB registry rows for project: {project_id}")
        return True

    async def _count_db_records(self, project_id: str) -> dict[str, int]:
        """Count DB records related to a project.

        Returns dict with counts for sessions, tasks, messages, etc.
        """
        import os

        if not os.getenv("USE_DATABASE", "").lower() == "true":
            return {}

        from db.database import async_session_factory
        from db.repository import SessionRepository

        async with async_session_factory() as db:
            repo = SessionRepository(db)
            counts = await repo.count_related_by_project(project_id)
            return counts

    async def _delete_db_records(self, project_id: str) -> int:
        """Delete all DB records for a project.

        Returns number of sessions deleted.
        """
        import os

        if not os.getenv("USE_DATABASE", "").lower() == "true":
            return 0

        from db.database import async_session_factory
        from db.repository import SessionRepository

        async with async_session_factory() as db:
            repo = SessionRepository(db)
            deleted = await repo.delete_by_project(project_id)
            await db.commit()
            return deleted


# Global instance
_cleanup_service: ProjectCleanupService | None = None


def get_cleanup_service() -> ProjectCleanupService:
    """Get or create the global cleanup service instance."""
    global _cleanup_service
    if _cleanup_service is None:
        _cleanup_service = ProjectCleanupService()
    return _cleanup_service
