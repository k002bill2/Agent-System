"""Timezone-aware UTC helpers."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return timezone-aware UTC now (replaces deprecated datetime.utcnow())."""
    return datetime.now(UTC)
