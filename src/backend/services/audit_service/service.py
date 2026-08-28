"""The audit service and the in-memory store it owns.

``_audit_logs``, ``_filter_logs`` and ``AuditService`` stay together so the store
has one owner. ``cleanup_old_logs`` used to rebind the list through ``global``,
which replaces only the defining module's name — after the split that left the
package barrel exporting the pre-purge list. It now mutates in place, so every
holder of the list sees the same contents and no layout here depends on that.
"""

import asyncio
import os
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.audit import ComplianceAuditEntry, DataClassification
from services.audit_service.models import (
    AuditAction,
    AuditLogEntry,
    AuditLogFilter,
    AuditLogResponse,
    ResourceType,
)
from services.audit_service.stats import (
    _APPROVAL_ACTIONS,
    _TOOL_ACTIONS,
    TREND_DAYS,
    _build_conditions,
    build_recent_trend,
    compute_stats_from_logs,
)
from utils.time import utcnow

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


_audit_logs: list[AuditLogEntry] = []


def _filter_logs(filter: AuditLogFilter) -> list[AuditLogEntry]:
    """Apply an :class:`AuditLogFilter` to the in-memory log store (no pagination)."""
    results = _audit_logs.copy()

    if filter.session_id:
        results = [r for r in results if r.session_id == filter.session_id]
    if filter.user_id:
        results = [r for r in results if r.user_id == filter.user_id]
    if filter.project_id:
        if filter.include_global:
            results = [
                r for r in results if r.project_id == filter.project_id or r.project_id is None
            ]
        else:
            results = [r for r in results if r.project_id == filter.project_id]
    if filter.action:
        results = [r for r in results if r.action == filter.action]
    if filter.resource_type:
        results = [r for r in results if r.resource_type == filter.resource_type]
    if filter.resource_id:
        results = [r for r in results if r.resource_id == filter.resource_id]
    if filter.status:
        results = [r for r in results if r.status == filter.status]
    if filter.start_date:
        results = [r for r in results if r.created_at >= filter.start_date]
    if filter.end_date:
        results = [r for r in results if r.created_at <= filter.end_date]

    return results


class AuditService:
    """Service for managing audit logs."""

    _integrity_service = None
    _db_session: AsyncSession | None = None

    def __init__(self, use_database: bool = USE_DATABASE):
        self.use_database = use_database

    @classmethod
    def _get_integrity_service(cls):
        """Lazy load integrity service."""
        if cls._integrity_service is None:
            try:
                from services.audit_integrity import get_audit_integrity_service

                cls._integrity_service = get_audit_integrity_service()
            except ImportError:
                pass
        return cls._integrity_service

    @staticmethod
    def _calculate_changes(old: dict, new: dict) -> dict:
        """Calculate the difference between old and new values."""
        changes = {}

        # Added keys
        for key in set(new.keys()) - set(old.keys()):
            changes[key] = {"action": "added", "new": new[key]}

        # Removed keys
        for key in set(old.keys()) - set(new.keys()):
            changes[key] = {"action": "removed", "old": old[key]}

        # Modified keys
        for key in set(old.keys()) & set(new.keys()):
            if old[key] != new[key]:
                changes[key] = {
                    "action": "modified",
                    "old": old[key],
                    "new": new[key],
                }

        return changes

    @staticmethod
    def log(
        action: AuditAction,
        resource_type: ResourceType,
        resource_id: str | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
        project_id: str | None = None,
        agent_id: str | None = None,
        old_value: dict | None = None,
        new_value: dict | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict | None = None,
        status: str = "success",
        error_message: str | None = None,
        data_classification: DataClassification | None = None,
        change_reason: str | None = None,
        compliance_flags: list[str] | None = None,
    ) -> AuditLogEntry:
        """
        Log an audit event (sync version for in-memory).
        For database persistence, use log_async.
        """
        # Calculate changes if both old and new values are provided
        changes = None
        if old_value and new_value:
            changes = AuditService._calculate_changes(old_value, new_value)

        entry = AuditLogEntry(
            session_id=session_id,
            user_id=user_id,
            project_id=project_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            changes=changes,
            agent_id=agent_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {},
            status=status,
            error_message=error_message,
            data_classification=data_classification or DataClassification.INTERNAL,
            change_reason=change_reason,
            compliance_flags=compliance_flags or [],
        )

        # Add to integrity chain if service available
        integrity = AuditService._get_integrity_service()
        if integrity:
            compliance_entry = ComplianceAuditEntry(
                id=entry.id,
                session_id=entry.session_id,
                user_id=entry.user_id,
                action=entry.action.value,
                resource_type=entry.resource_type.value,
                resource_id=entry.resource_id,
                old_value=entry.old_value,
                new_value=entry.new_value,
                changes=entry.changes,
                agent_id=entry.agent_id,
                ip_address=entry.ip_address,
                user_agent=entry.user_agent,
                metadata=entry.metadata,
                status=entry.status,
                error_message=entry.error_message,
                data_classification=entry.data_classification or DataClassification.INTERNAL,
                change_reason=entry.change_reason,
                compliance_flags=entry.compliance_flags,
                created_at=entry.created_at,
            )
            compliance_entry = integrity.add_entry(compliance_entry)
            entry.previous_hash = compliance_entry.previous_hash
            entry.hash = compliance_entry.hash

        _audit_logs.append(entry)

        # Background DB 저장 (USE_DATABASE=true일 때)
        if USE_DATABASE:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(AuditService._save_entry_to_db(entry))
            except RuntimeError:
                # No running event loop, skip background save
                pass

        return entry

    @staticmethod
    async def _save_entry_to_db(entry: "AuditLogEntry") -> None:
        """Background task to save audit entry to database."""
        try:
            from db.database import async_session_factory
            from db.models import AuditLogModel

            async with async_session_factory() as db:
                db_entry = AuditLogModel(
                    id=entry.id,
                    session_id=entry.session_id,
                    user_id=entry.user_id,
                    project_id=entry.project_id,
                    action=entry.action.value,
                    resource_type=entry.resource_type.value,
                    resource_id=entry.resource_id,
                    old_value=entry.old_value,
                    new_value=entry.new_value,
                    changes=entry.changes,
                    agent_id=entry.agent_id,
                    ip_address=entry.ip_address,
                    user_agent=entry.user_agent,
                    metadata_json=entry.metadata or {},
                    status=entry.status,
                    error_message=entry.error_message,
                    data_classification=(
                        entry.data_classification or DataClassification.INTERNAL
                    ).value,
                    change_reason=entry.change_reason,
                    compliance_flags=entry.compliance_flags or [],
                    created_at=entry.created_at,
                    previous_hash=entry.previous_hash,
                    hash=entry.hash,
                )
                db.add(db_entry)
                await db.commit()
        except Exception as e:
            # Log error but don't fail - audit is best-effort
            import logging

            logging.getLogger(__name__).warning(f"Failed to save audit entry to DB: {e}")

    @staticmethod
    async def log_async(
        db: AsyncSession,
        action: AuditAction,
        resource_type: ResourceType,
        resource_id: str | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
        project_id: str | None = None,
        agent_id: str | None = None,
        old_value: dict | None = None,
        new_value: dict | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict | None = None,
        status: str = "success",
        error_message: str | None = None,
        data_classification: DataClassification | None = None,
        change_reason: str | None = None,
        compliance_flags: list[str] | None = None,
    ) -> AuditLogEntry:
        """Log an audit event to the database."""
        from db.models import AuditLogModel

        # Calculate changes if both old and new values are provided
        changes = None
        if old_value and new_value:
            changes = AuditService._calculate_changes(old_value, new_value)

        entry_id = str(uuid.uuid4())
        now = utcnow()

        # Create DB model
        db_entry = AuditLogModel(
            id=entry_id,
            session_id=session_id,
            user_id=user_id,
            project_id=project_id,
            action=action.value,
            resource_type=resource_type.value,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            changes=changes,
            agent_id=agent_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata_json=metadata or {},
            status=status,
            error_message=error_message,
            data_classification=(data_classification or DataClassification.INTERNAL).value,
            change_reason=change_reason,
            compliance_flags=compliance_flags or [],
            created_at=now,
        )

        db.add(db_entry)
        await db.commit()

        # Return Pydantic model
        return AuditLogEntry(
            id=entry_id,
            session_id=session_id,
            user_id=user_id,
            project_id=project_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            changes=changes,
            agent_id=agent_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {},
            status=status,
            error_message=error_message,
            data_classification=data_classification or DataClassification.INTERNAL,
            change_reason=change_reason,
            compliance_flags=compliance_flags or [],
            created_at=now,
        )

    @staticmethod
    def query(filter: AuditLogFilter) -> AuditLogResponse:
        """Query audit logs with filters (in-memory)."""
        results = _filter_logs(filter)

        # Sort by created_at descending
        results.sort(key=lambda x: x.created_at, reverse=True)

        total = len(results)

        # Apply pagination
        results = results[filter.offset : filter.offset + filter.limit]

        return AuditLogResponse(
            logs=results,
            total=total,
            limit=filter.limit,
            offset=filter.offset,
        )

    @staticmethod
    async def query_async(db: AsyncSession, filter: AuditLogFilter) -> AuditLogResponse:
        """Query audit logs with filters from database."""
        from db.models import AuditLogModel

        conditions = _build_conditions(filter)

        # Count total
        count_stmt = select(func.count()).select_from(AuditLogModel)
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Get paginated results
        query = select(AuditLogModel)
        if conditions:
            query = query.where(and_(*conditions))
        query = query.order_by(desc(AuditLogModel.created_at))
        query = query.offset(filter.offset).limit(filter.limit)

        result = await db.execute(query)
        rows = result.scalars().all()

        # Convert to Pydantic models
        logs = []
        for row in rows:
            logs.append(
                AuditLogEntry(
                    id=row.id,
                    session_id=row.session_id,
                    user_id=row.user_id,
                    project_id=getattr(row, "project_id", None),
                    action=AuditAction(row.action),
                    resource_type=ResourceType(row.resource_type),
                    resource_id=row.resource_id,
                    old_value=row.old_value,
                    new_value=row.new_value,
                    changes=row.changes,
                    agent_id=row.agent_id,
                    ip_address=row.ip_address,
                    user_agent=row.user_agent,
                    metadata=row.metadata_json or {},
                    status=row.status,
                    error_message=row.error_message,
                    data_classification=DataClassification(row.data_classification)
                    if row.data_classification
                    else None,
                    change_reason=row.change_reason,
                    compliance_flags=row.compliance_flags or [],
                    previous_hash=row.previous_hash,
                    hash=row.hash,
                    created_at=row.created_at,
                )
            )

        return AuditLogResponse(
            logs=logs,
            total=total,
            limit=filter.limit,
            offset=filter.offset,
        )

    @staticmethod
    def get_stats(filter: AuditLogFilter) -> dict[str, Any]:
        """Compute audit statistics from the in-memory log store."""
        logs = _filter_logs(filter)
        return compute_stats_from_logs(logs, len(logs))

    @staticmethod
    async def get_stats_async(db: AsyncSession, filter: AuditLogFilter) -> dict[str, Any]:
        """Compute audit statistics from the database via aggregation queries.

        Uses ``GROUP BY`` aggregation instead of fetching a capped slice of rows,
        so the breakdown counts never diverge from ``total_actions`` regardless
        of how many audit rows exist.
        """
        from db.models import AuditLogModel

        conditions = _build_conditions(filter)

        def _scoped(stmt):
            return stmt.where(and_(*conditions)) if conditions else stmt

        # Total count
        total = (
            await db.execute(_scoped(select(func.count()).select_from(AuditLogModel)))
        ).scalar() or 0

        # Counts grouped by action type
        action_rows = (
            await db.execute(
                _scoped(select(AuditLogModel.action, func.count()).group_by(AuditLogModel.action))
            )
        ).all()
        actions_by_type = {action: count for action, count in action_rows}

        # Counts grouped by status
        status_rows = (
            await db.execute(
                _scoped(select(AuditLogModel.status, func.count()).group_by(AuditLogModel.status))
            )
        ).all()
        actions_by_status = {status: count for status, count in status_rows}

        # Daily counts for the trend window. The window is small, so rows are
        # bucketed in Python to keep day boundaries on UTC — a SQL date() would
        # use the session timezone and drift from the in-memory path.
        window_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
            days=TREND_DAYS - 1
        )
        trend_rows = (
            await db.execute(
                _scoped(
                    select(AuditLogModel.created_at).where(AuditLogModel.created_at >= window_start)
                )
            )
        ).all()
        day_counts: dict[str, int] = {}
        for (created_at,) in trend_rows:
            date_str = created_at.strftime("%Y-%m-%d")
            day_counts[date_str] = day_counts.get(date_str, 0) + 1

        return {
            "total_actions": total,
            "tool_executions": sum(actions_by_type.get(a.value, 0) for a in _TOOL_ACTIONS),
            "approvals": sum(actions_by_type.get(a.value, 0) for a in _APPROVAL_ACTIONS),
            "errors": actions_by_status.get("failed", 0),
            "actions_by_type": actions_by_type,
            "actions_by_status": actions_by_status,
            "recent_trend": build_recent_trend(day_counts),
        }

    @staticmethod
    def get_by_id(log_id: str) -> AuditLogEntry | None:
        """Get a specific audit log entry by ID (in-memory)."""
        for log in _audit_logs:
            if log.id == log_id:
                return log
        return None

    @staticmethod
    async def get_by_id_async(db: AsyncSession, log_id: str) -> AuditLogEntry | None:
        """Get a specific audit log entry by ID from database."""
        from db.models import AuditLogModel

        result = await db.execute(select(AuditLogModel).where(AuditLogModel.id == log_id))
        row = result.scalar_one_or_none()

        if not row:
            return None

        return AuditLogEntry(
            id=row.id,
            session_id=row.session_id,
            user_id=row.user_id,
            project_id=getattr(row, "project_id", None),
            action=AuditAction(row.action),
            resource_type=ResourceType(row.resource_type),
            resource_id=row.resource_id,
            old_value=row.old_value,
            new_value=row.new_value,
            changes=row.changes,
            agent_id=row.agent_id,
            ip_address=row.ip_address,
            user_agent=row.user_agent,
            metadata=row.metadata_json or {},
            status=row.status,
            error_message=row.error_message,
            created_at=row.created_at,
        )

    @staticmethod
    def get_session_audit_trail(session_id: str) -> list[AuditLogEntry]:
        """Get all audit logs for a specific session (in-memory)."""
        return sorted(
            [log for log in _audit_logs if log.session_id == session_id],
            key=lambda x: x.created_at,
            reverse=True,
        )

    @staticmethod
    async def get_session_audit_trail_async(
        db: AsyncSession, session_id: str
    ) -> list[AuditLogEntry]:
        """Get all audit logs for a specific session from database."""
        filter = AuditLogFilter(session_id=session_id, limit=1000)
        response = await AuditService.query_async(db, filter)
        return response.logs

    @staticmethod
    def cleanup_old_logs(days: int = 30) -> int:
        """Remove audit logs older than specified days (in-memory).

        Mutates the list in place rather than rebinding it. Rebinding through
        ``global`` replaces only this module's name, so the package barrel — and
        anything else holding the list — would keep the pre-purge contents and
        report audit data that no longer exists. Splitting the module made that
        reachable through ``services.audit_service._audit_logs``; mutating in
        place removes the hazard for every holder at once.
        """
        cutoff = utcnow() - timedelta(days=days)
        original_count = len(_audit_logs)
        _audit_logs[:] = [log for log in _audit_logs if log.created_at >= cutoff]
        return original_count - len(_audit_logs)

    @staticmethod
    async def cleanup_old_logs_async(db: AsyncSession, days: int = 30) -> int:
        """Remove audit logs older than specified days from database."""
        from sqlalchemy import delete

        from db.models import AuditLogModel

        cutoff = utcnow() - timedelta(days=days)
        stmt = delete(AuditLogModel).where(AuditLogModel.created_at < cutoff)
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount

    @staticmethod
    def export_logs(
        filter: AuditLogFilter,
        format: str = "json",
    ) -> str:
        """Export audit logs in specified format."""
        import csv
        import json
        from io import StringIO

        response = AuditService.query(filter)

        if format == "json":
            return json.dumps(
                [log.model_dump() for log in response.logs],
                default=str,
                indent=2,
            )

        elif format == "csv":
            output = StringIO()
            writer = csv.writer(output)

            # Header
            writer.writerow(
                [
                    "id",
                    "created_at",
                    "action",
                    "resource_type",
                    "resource_id",
                    "session_id",
                    "user_id",
                    "agent_id",
                    "status",
                    "error_message",
                ]
            )

            # Rows
            for log in response.logs:
                writer.writerow(
                    [
                        log.id,
                        log.created_at.isoformat(),
                        log.action.value,
                        log.resource_type.value,
                        log.resource_id or "",
                        log.session_id or "",
                        log.user_id or "",
                        log.agent_id or "",
                        log.status,
                        log.error_message or "",
                    ]
                )

            return output.getvalue()

        else:
            raise ValueError(f"Unsupported format: {format}")
