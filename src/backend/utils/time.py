"""Timezone-aware UTC helpers."""
from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return timezone-aware UTC now (replaces deprecated datetime.utcnow())."""
    return datetime.now(timezone.utc)
