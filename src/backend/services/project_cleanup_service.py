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

from pydantic import BaseModel

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

    async def get_deletion_preview(self, project_id: str) -> DeletionPreview | None:
        """Get preview of what will be deleted.

        Args:
            project_id: Project identifier

        Returns:
            DeletionPreview or None if project not found
        """
        from models.project import get_project, get_projects_dir

        project = get_project(project_id)
        if not project:
            return None

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
            preview.approvals_count = db_counts.get("approvals", 0)
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

    async def cascade_delete(self, project_id: str) -> CleanupSummary:
        """Perform cascade delete of all project data.

        Cleanup order:
        1. DB records (sessions cascade to tasks, messages, etc.)
        2. RAG vector index
        3. Health cache
        4. Config monitor cache
        5. Symlink removal
        6. Registry unregistration

        Args:
            project_id: Project identifier

        Returns:
            CleanupSummary with results
        """
        from models.project import get_project, get_projects_dir, unregister_project

        project = get_project(project_id)
        if not project:
            return CleanupSummary(
                project_id=project_id,
                success=False,
                errors=["Project not found"],
            )

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
            import shutil

            projects_dir = get_projects_dir()
            project_entry = projects_dir / project_id

            if project_entry.is_symlink():
                project_entry.unlink()
                summary.symlink_removed = True
                logger.info(f"Removed symlink: {project_entry}")
            elif project_entry.is_dir() and project_entry.parent == projects_dir:
                # Non-symlink directory inside projects/ (e.g. e2e test residual)
                shutil.rmtree(project_entry)
                summary.symlink_removed = True
                logger.info(f"Removed project directory: {project_entry}")
        except Exception as e:
            error_msg = f"Symlink removal failed: {e}"
            logger.error(error_msg)
            summary.errors.append(error_msg)

        # 6. Unregister from registry
        try:
            unregister_project(project_id)
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

    async def _count_db_records(self, project_id: str) -> dict[str, int]:
        """Count DB records related to a project.

        Returns dict with counts for sessions, tasks, messages, etc.
        """
        import os

        if not os.getenv("USE_DATABASE", "").lower() == "true":
            return {}

        from db.database import get_db_session
        from db.repository import SessionRepository

        async with get_db_session() as db:
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

        from db.database import get_db_session
        from db.repository import SessionRepository

        async with get_db_session() as db:
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
