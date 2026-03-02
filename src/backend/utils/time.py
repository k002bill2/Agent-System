"""UTC datetime helpers (DB-compatible naive datetimes)."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return naive UTC now. Avoids deprecated datetime.utcnow() while staying DB-compatible.

    All DB columns use TIMESTAMP WITHOUT TIME ZONE, so we strip tzinfo.
    """
    return datetime.now(UTC).replace(tzinfo=None)
