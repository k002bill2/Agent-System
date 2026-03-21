"""Pipeline orchestration service."""

import asyncio
import logging
import uuid
from typing import Any

from services.pipeline.models import PipelineConfig, PipelineResult, PipelineSummary, StageConfig
from services.pipeline.stage import BaseStage, PipelineContext, StageResult
from utils.time import utcnow

logger = logging.getLogger(__name__)


class PipelineService:
    """Modular data pipeline orchestrator.

    Manages pipeline definitions, executes stage chains,
    and stores results in memory.
    """

    def __init__(self) -> None:
        self._pipelines: dict[str, dict[str, Any]] = {}
        self._results: dict[str, PipelineResult] = {}
        self._stage_registry: dict[str, type[BaseStage]] = {}

        # Register built-in stages
        self._register_builtins()

    def _register_builtins(self) -> None:
        """Register built-in stage types."""
        from services.pipeline.stages.analyze_stage import AnalyzeStage
        from services.pipeline.stages.collect_stage import CollectStage
        from services.pipeline.stages.output_stage import OutputStage
        from services.pipeline.stages.transform_stage import TransformStage

        self._stage_registry["collect"] = CollectStage
        self._stage_registry["transform"] = TransformStage
        self._stage_registry["analyze"] = AnalyzeStage
        self._stage_registry["output"] = OutputStage

    # ── Plugin Registry ─────────────────────────────────────

    def register_stage(self, stage_type: str, stage_class: type[BaseStage]) -> None:
        """Register a custom stage type."""
        self._stage_registry[stage_type] = stage_class
        logger.info(f"Stage type registered: {stage_type}")

    def get_registered_stages(self) -> list[str]:
        """List registered stage type names."""
        return list(self._stage_registry.keys())

    # ── CRUD ────────────────────────────────────────────────

    async def create_pipeline(self, config: PipelineConfig) -> str:
        """Create a pipeline definition. Returns pipeline_id."""
        # Validate all stage types are registered
        for stage_config in config.stages:
            if stage_config.stage_type not in self._stage_registry:
                raise ValueError(
                    f"Unknown stage type: {stage_config.stage_type}. "
                    f"Available: {list(self._stage_registry.keys())}"
                )

        pipeline_id = str(uuid.uuid4())
        self._pipelines[pipeline_id] = {
            "id": pipeline_id,
            "config": config,
            "created_at": utcnow(),
            "run_count": 0,
        }

        logger.info(f"Pipeline created: {pipeline_id} ({config.name})")
        return pipeline_id

    async def delete_pipeline(self, pipeline_id: str) -> bool:
        """Delete a pipeline definition."""
        return self._pipelines.pop(pipeline_id, None) is not None

    async def list_pipelines(self) -> list[PipelineSummary]:
        """List all pipeline definitions."""
        return [
            PipelineSummary(
                pipeline_id=data["id"],
                name=data["config"].name,
                stage_count=len(data["config"].stages),
                error_strategy=data["config"].error_strategy,
                created_at=data["created_at"],
                run_count=data["run_count"],
            )
            for data in self._pipelines.values()
        ]

    # ── Execution ───────────────────────────────────────────

    async def execute_pipeline(
        self,
        pipeline_id: str,
        initial_data: dict[str, Any] | None = None,
    ) -> PipelineResult:
        """Execute a pipeline by running stages sequentially."""
        pipeline_data = self._pipelines.get(pipeline_id)
        if not pipeline_data:
            raise ValueError(f"Pipeline not found: {pipeline_id}")

        config: PipelineConfig = pipeline_data["config"]
        run_id = str(uuid.uuid4())
        context = PipelineContext(initial_data)
        started_at = utcnow()

        result = PipelineResult(
            run_id=run_id,
            pipeline_id=pipeline_id,
            pipeline_name=config.name,
            status="success",
            started_at=started_at,
        )

        try:
            async with asyncio.timeout(config.timeout_seconds):
                for stage_config in config.stages:
                    stage_result = await self._execute_stage(stage_config, context, config)
                    context.add_result(stage_result)
                    result.stage_results.append(stage_result.model_dump())

                    if stage_result.status == "failed":
                        if config.error_strategy == "fail_fast":
                            result.status = "failed"
                            result.error = (
                                f"Stage '{stage_result.stage_name}' failed: {stage_result.error}"
                            )
                            break
                        elif config.error_strategy == "continue":
                            result.status = "partial"
                        # retry is handled in _execute_stage

        except TimeoutError:
            result.status = "failed"
            result.error = f"Pipeline timed out after {config.timeout_seconds}s"
        except Exception as e:
            result.status = "failed"
            result.error = str(e)

        result.completed_at = utcnow()
        result.total_duration_ms = (result.completed_at - started_at).total_seconds() * 1000

        # Store result and increment run count
        self._results[run_id] = result
        pipeline_data["run_count"] += 1

        logger.info(
            f"Pipeline {config.name} run {run_id}: "
            f"{result.status} ({result.total_duration_ms:.1f}ms)"
        )
        return result

    async def _execute_stage(
        self,
        stage_config: StageConfig,
        context: PipelineContext,
        pipeline_config: PipelineConfig,
    ) -> StageResult:
        """Execute a single stage with optional retry."""
        stage_class = self._stage_registry.get(stage_config.stage_type)
        if not stage_class:
            return StageResult(
                stage_name=stage_config.stage_type,
                status="failed",
                error=f"Stage type not registered: {stage_config.stage_type}",
            )

        stage = stage_class(stage_config.params)
        max_attempts = (
            pipeline_config.max_retries + 1 if pipeline_config.error_strategy == "retry" else 1
        )

        last_result: StageResult | None = None
        for attempt in range(max_attempts):
            last_result = await stage.execute_with_timing(context)

            if last_result.status != "failed":
                return last_result

            if attempt < max_attempts - 1:
                logger.warning(
                    f"Stage '{stage.name}' failed (attempt {attempt + 1}/{max_attempts}), "
                    f"retrying: {last_result.error}"
                )

        return last_result  # type: ignore[return-value]

    # ── Results ─────────────────────────────────────────────

    async def get_pipeline_result(self, run_id: str) -> PipelineResult | None:
        """Get result of a pipeline run."""
        return self._results.get(run_id)


# ── Singleton ───────────────────────────────────────────────

_service: PipelineService | None = None


def get_pipeline_service() -> PipelineService:
    """Get or create the singleton PipelineService."""
    global _service
    if _service is None:
        _service = PipelineService()
    return _service
