"""Invariants the ``services.audit_service`` package split has to keep.

The split is behavior-preserving movement, so most of its risk is invisible to
the existing suite — every existing test passes whether or not the barrel still
exposes what its 20-odd import sites reach for, because those sites are imported
at startup and a missing name fails there, not in a test of this package.
"""

from datetime import timedelta

import pytest

import services.audit_service as barrel
import services.audit_service.service as service_module
from services.audit_service import (
    AuditAction,
    AuditLogEntry,
    AuditLogFilter,
    AuditService,
    ResourceType,
)
from utils.time import utcnow

# Every name an importer outside the package reaches for, measured from the
# import sites rather than guessed. Dropping one breaks a caller at import time.
_PUBLIC_SURFACE = (
    "AuditAction",
    "AuditLogEntry",
    "AuditLogFilter",
    "AuditLogResponse",
    "AuditService",
    "ResourceType",
    "USE_DATABASE",
    "_audit_logs",
    "audit_config_change",
    "audit_task_created",
    "audit_task_status_change",
    "audit_tool_executed",
    "audit_user_auth",
    "build_recent_trend",
    "compute_stats_from_logs",
)


@pytest.fixture(autouse=True)
def _isolate_store():
    """Reset the store around each test.

    Contents only: ``cleanup_old_logs`` no longer rebinds the list, so identity
    is stable and there is nothing else to restore. If a future change brings
    rebinding back, the assertions below fail before this fixture matters.
    """
    service_module._audit_logs.clear()
    yield
    service_module._audit_logs.clear()


@pytest.mark.parametrize("name", _PUBLIC_SURFACE)
def test_barrel_still_exposes_every_imported_name(name: str) -> None:
    """``services.audit_service`` stays valid verbatim at all of its import sites."""
    assert hasattr(barrel, name), f"{name} 이 배럴에서 사라졌다"


def test_purge_and_query_agree_after_the_split() -> None:
    """The store, its purge, and the reader that filters it stay consistent.

    ``_audit_logs``, ``_filter_logs`` and ``AuditService`` live in one module so
    the store has a single owner; this pins that a purge and the reader that
    queries the store agree afterwards.
    """
    stale = AuditLogEntry(
        action=AuditAction.TOOL_EXECUTED,
        resource_type=ResourceType.TASK,
        resource_id="stale",
        created_at=utcnow() - timedelta(days=90),
    )
    fresh = AuditLogEntry(
        action=AuditAction.TOOL_EXECUTED,
        resource_type=ResourceType.TASK,
        resource_id="fresh",
    )
    service_module._audit_logs.extend([stale, fresh])

    removed = AuditService.cleanup_old_logs(days=30)
    surviving = service_module._filter_logs(AuditLogFilter(limit=100, offset=0))

    assert removed == 1
    assert len(service_module._audit_logs) == 1
    assert [entry.resource_id for entry in surviving] == ["fresh"]


def test_purge_is_visible_through_every_holder_of_the_store() -> None:
    """The barrel, the service module, and a captured reference all agree.

    Before the split this held for free: one module owned the list, so reading
    ``audit_service._audit_logs`` after a purge read the rebound name. The split
    broke it — the barrel's ``from .service import _audit_logs`` is a snapshot,
    so a ``global`` rebinding left the package exporting pre-purge contents.

    ``cleanup_old_logs`` now mutates in place, which restores the pre-split
    behavior for every holder at once. This asserts all three views, because
    checking only one of them is how the regression survived a first review.
    """
    captured = service_module._audit_logs
    captured.extend(
        [
            AuditLogEntry(
                action=AuditAction.TOOL_EXECUTED,
                resource_type=ResourceType.TASK,
                resource_id="stale",
                created_at=utcnow() - timedelta(days=90),
            ),
            AuditLogEntry(
                action=AuditAction.TOOL_EXECUTED,
                resource_type=ResourceType.TASK,
                resource_id="fresh",
            ),
        ]
    )

    removed = AuditService.cleanup_old_logs(days=30)

    assert removed == 1
    assert len(service_module._audit_logs) == 1
    assert len(barrel._audit_logs) == 1, "배럴이 purge 이전 리스트를 노출한다"
    assert len(captured) == 1, "미리 잡아둔 참조가 purge 를 못 본다"
