"""Parse-result cache for append-only session files.

Both the Claude and Codex monitors re-scan their whole session directory on every
list request, which the dashboard polls continuously. Session files are
append-only, so ``mtime`` plus size identifies a file whose parse result is still
valid: a finished session never changes, and a live one changes both.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from models.claude_session import ClaudeSessionInfo


@dataclass
class CacheEntry:
    """Cache entry for session file."""

    mtime: float
    file_size: int
    session_info: ClaudeSessionInfo


class SessionFileCache:
    """File-based cache for session parsing results.

    Uses mtime + file_size for cache invalidation.
    """

    def __init__(self) -> None:
        self._cache: dict[str, CacheEntry] = {}

    def get(self, file_path: Path) -> ClaudeSessionInfo | None:
        """Get cached session info if still valid.

        Args:
            file_path: Path to .jsonl file

        Returns:
            Cached ClaudeSessionInfo if valid, None if needs refresh
        """
        key = str(file_path)
        if key not in self._cache:
            return None

        entry = self._cache[key]
        try:
            stat = file_path.stat()
            # Check if file changed (mtime or size)
            if stat.st_mtime == entry.mtime and stat.st_size == entry.file_size:
                return entry.session_info
        except OSError:
            # File might have been deleted
            self._cache.pop(key, None)

        return None

    def set(self, file_path: Path, session_info: ClaudeSessionInfo, stat: os.stat_result) -> None:
        """Store session info in cache.

        Args:
            file_path: Path to .jsonl file
            session_info: Parsed session info
            stat: File stat result (for mtime/size)
        """
        key = str(file_path)
        self._cache[key] = CacheEntry(
            mtime=stat.st_mtime,
            file_size=stat.st_size,
            session_info=session_info,
        )

    def invalidate(self, file_path: Path) -> None:
        """Remove entry from cache."""
        self._cache.pop(str(file_path), None)

    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()
