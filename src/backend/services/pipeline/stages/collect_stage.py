"""Collect stage — data acquisition from various sources."""

import logging
from typing import Any

from services.pipeline.stage import BaseStage, PipelineContext, StageResult

logger = logging.getLogger(__name__)


class CollectStage(BaseStage):
    """Collects data from configured sources."""

    def __init__(self, params: dict[str, Any]) -> None:
        self._source_type: str = params.get("source_type", "health_metrics")
        self._params = params

    @property
    def name(self) -> str:
        return "collect"

    async def execute(self, context: PipelineContext) -> StageResult:
        """Collect data based on source_type."""
        if self._source_type == "health_metrics":
            return await self._collect_health_metrics()
        elif self._source_type == "static":
            return self._collect_static()
        elif self._source_type == "file_read":
            return await self._collect_file()
        else:
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=f"Unknown source_type: {self._source_type}",
            )

    async def _collect_health_metrics(self) -> StageResult:
        """Collect metrics from HealthService."""
        try:
            from services.health_service import get_health_service

            service = get_health_service()
            health = await service.check_health(include_details=True)

            metrics: dict[str, Any] = {
                "overall_status": health.status.value,
                "uptime_seconds": health.uptime_seconds,
                "healthy_count": health.healthy_components,
                "total_count": health.total_components,
                "components": {},
            }

            for comp_name, comp in health.components.items():
                metrics["components"][comp_name] = {
                    "status": comp.status.value,
                    "latency_ms": comp.latency_ms,
                    "message": comp.message,
                }

            return StageResult(
                stage_name=self.name,
                status="success",
                data={"collected": metrics},
            )
        except Exception as e:
            logger.warning(f"Health metrics collection failed: {e}")
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=f"Health metrics unavailable: {e}",
            )

    def _collect_static(self) -> StageResult:
        """Collect static data from params (for testing/seeding)."""
        data = self._params.get("data", {})
        return StageResult(
            stage_name=self.name,
            status="success",
            data={"collected": data},
        )

    async def _collect_file(self) -> StageResult:
        """Read data from a file (sandboxed to allowed directory)."""
        import json
        import os
        from pathlib import Path

        file_path = self._params.get("file_path")
        if not file_path:
            return StageResult(
                stage_name=self.name,
                status="failed",
                error="file_path parameter required",
            )

        # Path traversal prevention: resolve and validate
        allowed_base = Path(os.getenv("AOS_PIPELINE_DATA_DIR", "/tmp/aos-pipeline-data")).resolve()
        path = Path(file_path).resolve()
        if not path.is_relative_to(allowed_base):
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=f"file_path must be within {allowed_base}",
            )

        if not path.exists():
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=f"File not found: {file_path}",
            )

        try:
            content = path.read_text()
            # Try JSON parse
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                data = {"raw": content}

            return StageResult(
                stage_name=self.name,
                status="success",
                data={"collected": data},
            )
        except Exception as e:
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=f"File read error: {e}",
            )
