"""Workflow artifact management service."""

import os
import shutil
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


class ArtifactService:
    """Manages workflow run artifacts with local filesystem storage."""

    def __init__(self, base_dir: str = "./data/artifacts"):
        self._artifacts: dict[str, dict[str, Any]] = {}
        self._base_dir = Path(base_dir)
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def list_artifacts(self, run_id: str) -> list[dict]:
        """List artifacts for a run."""
        return [
            a for a in self._artifacts.values()
            if a["run_id"] == run_id
        ]

    def get_artifact(self, artifact_id: str) -> dict | None:
        """Get artifact metadata by ID."""
        return self._artifacts.get(artifact_id)

    def create_artifact(
        self,
        run_id: str,
        name: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        job_id: str | None = None,
        step_id: str | None = None,
        retention_days: int = 30,
    ) -> dict:
        """Store an artifact for a workflow run."""
        artifact_id = str(uuid.uuid4())
        now = datetime.utcnow()
        expires_at = now + timedelta(days=retention_days)

        # Store file
        artifact_dir = self._base_dir / run_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        file_path = artifact_dir / f"{artifact_id}_{name}"
        file_path.write_bytes(data)

        artifact = {
            "id": artifact_id,
            "run_id": run_id,
            "job_id": job_id,
            "step_id": step_id,
            "name": name,
            "path": str(file_path),
            "size_bytes": len(data),
            "content_type": content_type,
            "retention_days": retention_days,
            "expires_at": expires_at,
            "created_at": now,
        }
        self._artifacts[artifact_id] = artifact
        return artifact

    def get_artifact_data(self, artifact_id: str) -> bytes | None:
        """Get artifact file data."""
        artifact = self._artifacts.get(artifact_id)
        if not artifact:
            return None
        file_path = Path(artifact["path"])
        if file_path.exists():
            return file_path.read_bytes()
        return None

    def delete_artifact(self, artifact_id: str) -> bool:
        """Delete an artifact."""
        artifact = self._artifacts.pop(artifact_id, None)
        if not artifact:
            return False
        file_path = Path(artifact["path"])
        if file_path.exists():
            file_path.unlink()
        return True

    def cleanup_expired(self) -> int:
        """Remove expired artifacts. Returns number of artifacts cleaned."""
        now = datetime.utcnow()
        expired_ids = [
            aid for aid, a in self._artifacts.items()
            if a.get("expires_at") and a["expires_at"] < now
        ]
        for aid in expired_ids:
            self.delete_artifact(aid)
        return len(expired_ids)

    def get_run_artifacts_size(self, run_id: str) -> int:
        """Get total size of artifacts for a run."""
        return sum(
            a["size_bytes"] for a in self._artifacts.values()
            if a["run_id"] == run_id
        )


# Singleton
_service: ArtifactService | None = None


def get_artifact_service() -> ArtifactService:
    global _service
    if _service is None:
        _service = ArtifactService()
    return _service
