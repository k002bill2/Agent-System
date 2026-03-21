"""Output stage — deliver pipeline results to various targets."""

import json
import logging
from typing import Any

from services.pipeline.stage import BaseStage, PipelineContext, StageResult

logger = logging.getLogger(__name__)


class OutputStage(BaseStage):
    """Outputs pipeline results to configured targets."""

    def __init__(self, params: dict[str, Any]) -> None:
        self._output_type: str = params.get("output_type", "log")
        self._params = params

    @property
    def name(self) -> str:
        return "output"

    async def execute(self, context: PipelineContext) -> StageResult:
        """Output data based on output_type."""
        # Gather output data from context
        output_data = self._gather_output(context)

        if self._output_type == "log":
            return self._output_log(output_data)
        elif self._output_type == "file":
            return await self._output_file(output_data)
        elif self._output_type == "summary":
            return self._output_summary(context)
        else:
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=f"Unknown output_type: {self._output_type}",
            )

    def _gather_output(self, context: PipelineContext) -> Any:
        """Gather the most relevant data from context for output."""
        # Priority: analysis > transformed > collected > raw data
        for key in ("analysis", "transformed", "collected"):
            val = context.get(key)
            if val is not None:
                return val
        return context.data

    def _output_log(self, data: Any) -> StageResult:
        """Log output data."""
        message = self._params.get("message", "Pipeline output")
        logger.info(f"{message}: {json.dumps(data, default=str, ensure_ascii=False)}")

        return StageResult(
            stage_name=self.name,
            status="success",
            data={"output": {"type": "log", "message": message}},
        )

    async def _output_file(self, data: Any) -> StageResult:
        """Write output data to a file (sandboxed to allowed directory)."""
        import os
        from pathlib import Path

        file_path = self._params.get("file_path")
        if not file_path:
            return StageResult(
                stage_name=self.name,
                status="failed",
                error="file_path parameter required for file output",
            )

        # Path traversal prevention: resolve and validate
        allowed_base = Path(os.getenv("AOS_PIPELINE_DATA_DIR", "/tmp/aos-pipeline-data")).resolve()
        try:
            path = Path(file_path).resolve()
            if not path.is_relative_to(allowed_base):
                return StageResult(
                    stage_name=self.name,
                    status="failed",
                    error=f"file_path must be within {allowed_base}",
                )
            path.parent.mkdir(parents=True, exist_ok=True)

            content = json.dumps(data, default=str, indent=2, ensure_ascii=False)
            path.write_text(content)

            return StageResult(
                stage_name=self.name,
                status="success",
                data={"output": {"type": "file", "path": str(path), "bytes": len(content)}},
            )
        except Exception as e:
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=f"File write error: {e}",
            )

    def _output_summary(self, context: PipelineContext) -> StageResult:
        """Generate a summary of all pipeline stages."""
        stage_summaries = []
        for result in context.stage_results:
            stage_summaries.append(
                {
                    "stage": result.stage_name,
                    "status": result.status,
                    "duration_ms": result.duration_ms,
                    "has_data": bool(result.data),
                    "error": result.error,
                }
            )

        return StageResult(
            stage_name=self.name,
            status="success",
            data={
                "output": {
                    "type": "summary",
                    "stages": stage_summaries,
                    "total_stages": len(stage_summaries),
                }
            },
        )
