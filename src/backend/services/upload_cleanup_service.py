"""Upload directory cleanup service.

Periodically removes stale uploaded files to prevent disk exhaustion.
"""

import logging
import os
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# Default TTL: 1 hour
UPLOAD_FILE_TTL_SECONDS = int(os.getenv("AOS_UPLOAD_TTL_SECONDS", "3600"))
UPLOAD_DIR = Path(os.getenv("AOS_UPLOAD_DIR", "/tmp/aos-uploads"))


def cleanup_stale_uploads(
    upload_dir: Path | None = None,
    ttl_seconds: int | None = None,
) -> int:
    """Remove uploaded files older than TTL.

    Args:
        upload_dir: Directory to clean. Defaults to UPLOAD_DIR.
        ttl_seconds: Max age in seconds. Defaults to UPLOAD_FILE_TTL_SECONDS.

    Returns:
        Number of files removed.
    """
    target_dir = upload_dir or UPLOAD_DIR
    ttl = ttl_seconds if ttl_seconds is not None else UPLOAD_FILE_TTL_SECONDS

    if not target_dir.exists():
        return 0

    now = time.time()
    removed = 0

    for file_path in target_dir.iterdir():
        if not file_path.is_file():
            continue
        try:
            age = now - file_path.stat().st_mtime
            if age > ttl:
                file_path.unlink()
                removed += 1
        except OSError as e:
            logger.warning("Failed to remove stale upload %s: %s", file_path, e)

    if removed:
        logger.info("Cleaned up %d stale uploads from %s", removed, target_dir)

    return removed


async def schedule_upload_cleanup(interval_seconds: int = 600) -> None:
    """Background task to periodically clean up uploads.

    Call this from FastAPI lifespan or startup event.
    """
    import asyncio

    while True:
        try:
            cleanup_stale_uploads()
        except Exception as e:
            logger.error("Upload cleanup failed: %s", e)
        await asyncio.sleep(interval_seconds)
