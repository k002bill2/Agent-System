"""Tests for PipelineService and built-in stages."""

import sys
from pathlib import Path
from typing import Any

import pytest

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src" / "backend"))

from services.pipeline.models import PipelineConfig, StageConfig
from services.pipeline.pipeline_service import PipelineService
from services.pipeline.stage import BaseStage, PipelineContext, StageResult
from services.pipeline.stages.analyze_stage import AnalyzeStage
from services.pipeline.stages.collect_stage import CollectStage
from services.pipeline.stages.output_stage import OutputStage
from services.pipeline.stages.transform_stage import TransformStage


# ── Fixtures ────────────────────────────────────────────────


@pytest.fixture
def service():
    """Fresh PipelineService for each test."""
    return PipelineService()


@pytest.fixture
def simple_config():
    """Simple 2-stage pipeline config."""
    return PipelineConfig(
        name="simple-test",
        stages=[
            StageConfig(
                stage_type="collect",
                params={"source_type": "static", "data": {"value": 42}},
            ),
            StageConfig(
                stage_type="output",
                params={"output_type": "log", "message": "Test output"},
            ),
        ],
    )


@pytest.fixture
def full_config():
    """Full 4-stage pipeline config."""
    return PipelineConfig(
        name="full-pipeline",
        stages=[
            StageConfig(
                stage_type="collect",
                params={
                    "source_type": "static",
                    "data": [10, 20, 30, 40, 50, 100],
                },
            ),
            StageConfig(
                stage_type="transform",
                params={"operation": "aggregate"},
            ),
            StageConfig(
                stage_type="analyze",
                params={"analysis_type": "statistics"},
            ),
            StageConfig(
                stage_type="output",
                params={"output_type": "summary"},
            ),
        ],
    )


# ── Context Tests ───────────────────────────────────────────


class TestPipelineContext:
    """Test PipelineContext data flow."""

    def test_initial_data(self):
        ctx = PipelineContext({"key": "value"})
        assert ctx.get("key") == "value"

    def test_empty_initial(self):
        ctx = PipelineContext()
        assert ctx.data == {}

    def test_set_and_get(self):
        ctx = PipelineContext()
        ctx.set("key", 42)
        assert ctx.get("key") == 42

    def test_get_default(self):
        ctx = PipelineContext()
        assert ctx.get("missing", "default") == "default"

    def test_add_result_merges_data(self):
        ctx = PipelineContext()
        result = StageResult(
            stage_name="test",
            status="success",
            data={"collected": [1, 2, 3]},
        )
        ctx.add_result(result)
        assert ctx.get("collected") == [1, 2, 3]
        assert len(ctx.stage_results) == 1

    def test_stage_results_immutable_copy(self):
        ctx = PipelineContext()
        results1 = ctx.stage_results
        ctx.add_result(StageResult(stage_name="a", status="success"))
        results2 = ctx.stage_results
        assert len(results1) == 0
        assert len(results2) == 1


# ── Model Tests ─────────────────────────────────────────────


class TestModels:
    """Test model immutability."""

    def test_stage_result_frozen(self):
        r = StageResult(stage_name="test", status="success")
        with pytest.raises(Exception):
            r.stage_name = "changed"

    def test_pipeline_config_frozen(self):
        config = PipelineConfig(
            name="test",
            stages=[StageConfig(stage_type="collect", params={})],
        )
        with pytest.raises(Exception):
            config.name = "changed"

    def test_stage_config_frozen(self):
        sc = StageConfig(stage_type="collect", params={"k": "v"})
        with pytest.raises(Exception):
            sc.stage_type = "other"


# ── CollectStage Tests ──────────────────────────────────────


class TestCollectStage:
    """Test data collection stages."""

    @pytest.mark.asyncio
    async def test_static_collect(self):
        stage = CollectStage({"source_type": "static", "data": {"x": 1}})
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "success"
        assert result.data["collected"] == {"x": 1}

    @pytest.mark.asyncio
    async def test_unknown_source_type(self):
        stage = CollectStage({"source_type": "unknown"})
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "failed"
        assert "Unknown source_type" in result.error

    @pytest.mark.asyncio
    async def test_file_read_missing_path(self):
        stage = CollectStage({"source_type": "file_read"})
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "failed"
        assert "file_path" in result.error

    @pytest.mark.asyncio
    async def test_file_read_nonexistent(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AOS_PIPELINE_DATA_DIR", str(tmp_path))
        stage = CollectStage(
            {"source_type": "file_read", "file_path": str(tmp_path / "missing.json")}
        )
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "failed"
        assert "not found" in result.error.lower()

    @pytest.mark.asyncio
    async def test_file_read_path_traversal_blocked(self):
        """Path traversal should be blocked."""
        stage = CollectStage({"source_type": "file_read", "file_path": "/etc/passwd"})
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "failed"
        assert "must be within" in result.error

    @pytest.mark.asyncio
    async def test_file_read_json(self, tmp_path, monkeypatch):
        import json

        monkeypatch.setenv("AOS_PIPELINE_DATA_DIR", str(tmp_path))
        test_file = tmp_path / "data.json"
        test_file.write_text(json.dumps({"key": "value"}))

        stage = CollectStage({"source_type": "file_read", "file_path": str(test_file)})
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "success"
        assert result.data["collected"] == {"key": "value"}


# ── TransformStage Tests ────────────────────────────────────


class TestTransformStage:
    """Test data transformation stages."""

    @pytest.mark.asyncio
    async def test_filter_dict_by_field(self):
        stage = TransformStage({"operation": "filter", "field": "name"})
        ctx = PipelineContext()
        ctx.set("collected", {"name": "test", "age": 25, "extra": True})
        result = await stage.execute(ctx)
        assert result.status == "success"
        assert result.data["transformed"] == {"name": "test"}

    @pytest.mark.asyncio
    async def test_filter_list_by_value(self):
        stage = TransformStage(
            {"operation": "filter", "field": "status", "value": "active"}
        )
        ctx = PipelineContext()
        ctx.set(
            "collected",
            [
                {"name": "a", "status": "active"},
                {"name": "b", "status": "inactive"},
                {"name": "c", "status": "active"},
            ],
        )
        result = await stage.execute(ctx)
        assert len(result.data["transformed"]) == 2

    @pytest.mark.asyncio
    async def test_map_fields(self):
        stage = TransformStage(
            {"operation": "map", "field_map": {"old_name": "new_name"}}
        )
        ctx = PipelineContext()
        ctx.set("collected", {"old_name": "value", "keep": True})
        result = await stage.execute(ctx)
        assert "new_name" in result.data["transformed"]
        assert "old_name" not in result.data["transformed"]

    @pytest.mark.asyncio
    async def test_aggregate_list(self):
        stage = TransformStage({"operation": "aggregate"})
        ctx = PipelineContext()
        ctx.set("collected", [10, 20, 30])
        result = await stage.execute(ctx)
        agg = result.data["transformed"]
        assert agg["count"] == 3
        assert agg["sum"] == 60
        assert agg["avg"] == 20.0

    @pytest.mark.asyncio
    async def test_aggregate_by_field(self):
        stage = TransformStage({"operation": "aggregate", "field": "score"})
        ctx = PipelineContext()
        ctx.set(
            "collected",
            [{"score": 10}, {"score": 20}, {"name": "no-score"}],
        )
        result = await stage.execute(ctx)
        agg = result.data["transformed"]
        assert agg["count"] == 2
        assert agg["sum"] == 30

    @pytest.mark.asyncio
    async def test_flatten_nested_dict(self):
        stage = TransformStage({"operation": "flatten"})
        ctx = PipelineContext()
        ctx.set("collected", {"a": {"b": {"c": 1}}, "d": 2})
        result = await stage.execute(ctx)
        flat = result.data["transformed"]
        assert flat["a.b.c"] == 1
        assert flat["d"] == 2

    @pytest.mark.asyncio
    async def test_unknown_operation(self):
        stage = TransformStage({"operation": "unknown"})
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "failed"


# ── AnalyzeStage Tests ──────────────────────────────────────


class TestAnalyzeStage:
    """Test analysis stages."""

    @pytest.mark.asyncio
    async def test_statistics(self):
        stage = AnalyzeStage({"analysis_type": "statistics"})
        ctx = PipelineContext()
        ctx.set("collected", [10, 20, 30, 40, 50])
        result = await stage.execute(ctx)
        assert result.status == "success"
        stats = result.data["analysis"]
        assert stats["count"] == 5
        assert stats["mean"] == 30.0
        assert stats["min"] == 10
        assert stats["max"] == 50

    @pytest.mark.asyncio
    async def test_statistics_empty(self):
        stage = AnalyzeStage({"analysis_type": "statistics"})
        ctx = PipelineContext()
        ctx.set("collected", [])
        result = await stage.execute(ctx)
        assert result.data["analysis"]["count"] == 0

    @pytest.mark.asyncio
    async def test_anomaly_detection(self):
        stage = AnalyzeStage({"analysis_type": "anomaly_detection", "z_threshold": 2.0})
        ctx = PipelineContext()
        # 999 is clearly an outlier
        ctx.set("collected", [10, 11, 10, 12, 10, 11, 999])
        result = await stage.execute(ctx)
        assert result.status == "success"
        analysis = result.data["analysis"]
        assert analysis["anomaly_count"] >= 1
        anomaly_values = [a["value"] for a in analysis["anomalies"]]
        assert 999 in anomaly_values

    @pytest.mark.asyncio
    async def test_anomaly_insufficient_data(self):
        stage = AnalyzeStage({"analysis_type": "anomaly_detection"})
        ctx = PipelineContext()
        ctx.set("collected", [1, 2])
        result = await stage.execute(ctx)
        assert "Insufficient" in result.data["analysis"]["message"]

    @pytest.mark.asyncio
    async def test_trend_increasing(self):
        stage = AnalyzeStage({"analysis_type": "trend"})
        ctx = PipelineContext()
        ctx.set("collected", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        result = await stage.execute(ctx)
        assert result.data["analysis"]["trend"] == "increasing"

    @pytest.mark.asyncio
    async def test_trend_decreasing(self):
        stage = AnalyzeStage({"analysis_type": "trend"})
        ctx = PipelineContext()
        ctx.set("collected", [10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
        result = await stage.execute(ctx)
        assert result.data["analysis"]["trend"] == "decreasing"

    @pytest.mark.asyncio
    async def test_trend_stable(self):
        stage = AnalyzeStage({"analysis_type": "trend", "trend_threshold": 0.1})
        ctx = PipelineContext()
        ctx.set("collected", [5, 5, 5, 5, 5])
        result = await stage.execute(ctx)
        assert result.data["analysis"]["trend"] == "stable"

    @pytest.mark.asyncio
    async def test_unknown_analysis_type(self):
        stage = AnalyzeStage({"analysis_type": "unknown"})
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "failed"


# ── OutputStage Tests ───────────────────────────────────────


class TestOutputStage:
    """Test output stages."""

    @pytest.mark.asyncio
    async def test_log_output(self):
        stage = OutputStage({"output_type": "log", "message": "Test"})
        ctx = PipelineContext()
        ctx.set("collected", {"x": 1})
        result = await stage.execute(ctx)
        assert result.status == "success"
        assert result.data["output"]["type"] == "log"

    @pytest.mark.asyncio
    async def test_file_output(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AOS_PIPELINE_DATA_DIR", str(tmp_path))
        output_file = tmp_path / "output.json"
        stage = OutputStage({"output_type": "file", "file_path": str(output_file)})
        ctx = PipelineContext()
        ctx.set("collected", {"result": "test"})
        result = await stage.execute(ctx)
        assert result.status == "success"
        assert output_file.exists()

    @pytest.mark.asyncio
    async def test_file_output_path_traversal_blocked(self):
        """Path traversal should be blocked on write."""
        stage = OutputStage(
            {"output_type": "file", "file_path": "/tmp/evil/output.json"}
        )
        ctx = PipelineContext()
        ctx.set("collected", {"x": 1})
        result = await stage.execute(ctx)
        assert result.status == "failed"
        assert "must be within" in result.error

    @pytest.mark.asyncio
    async def test_file_output_missing_path(self):
        stage = OutputStage({"output_type": "file"})
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "failed"
        assert "file_path" in result.error

    @pytest.mark.asyncio
    async def test_summary_output(self):
        stage = OutputStage({"output_type": "summary"})
        ctx = PipelineContext()
        ctx.add_result(
            StageResult(stage_name="collect", status="success", duration_ms=10)
        )
        ctx.add_result(
            StageResult(stage_name="transform", status="success", duration_ms=5)
        )
        result = await stage.execute(ctx)
        assert result.status == "success"
        assert result.data["output"]["total_stages"] == 2

    @pytest.mark.asyncio
    async def test_unknown_output_type(self):
        stage = OutputStage({"output_type": "unknown"})
        ctx = PipelineContext()
        result = await stage.execute(ctx)
        assert result.status == "failed"


# ── PipelineService CRUD Tests ──────────────────────────────


class TestPipelineCRUD:
    """Test pipeline creation, listing, deletion."""

    @pytest.mark.asyncio
    async def test_create_pipeline(self, service, simple_config):
        pid = await service.create_pipeline(simple_config)
        assert pid is not None

    @pytest.mark.asyncio
    async def test_create_with_unknown_stage(self, service):
        config = PipelineConfig(
            name="bad",
            stages=[StageConfig(stage_type="nonexistent", params={})],
        )
        with pytest.raises(ValueError, match="Unknown stage type"):
            await service.create_pipeline(config)

    @pytest.mark.asyncio
    async def test_list_pipelines(self, service, simple_config):
        await service.create_pipeline(simple_config)
        pipelines = await service.list_pipelines()
        assert len(pipelines) == 1
        assert pipelines[0].name == "simple-test"

    @pytest.mark.asyncio
    async def test_delete_pipeline(self, service, simple_config):
        pid = await service.create_pipeline(simple_config)
        assert await service.delete_pipeline(pid) is True
        assert await service.delete_pipeline(pid) is False

    @pytest.mark.asyncio
    async def test_register_custom_stage(self, service):
        class CustomStage(BaseStage):
            @property
            def name(self) -> str:
                return "custom"

            def __init__(self, params: dict[str, Any]) -> None:
                pass

            async def execute(self, context: PipelineContext) -> StageResult:
                return StageResult(
                    stage_name=self.name, status="success", data={"custom": True}
                )

        service.register_stage("custom", CustomStage)
        assert "custom" in service.get_registered_stages()


# ── Pipeline Execution Tests ────────────────────────────────


class TestPipelineExecution:
    """Test full pipeline execution flows."""

    @pytest.mark.asyncio
    async def test_simple_pipeline(self, service, simple_config):
        pid = await service.create_pipeline(simple_config)
        result = await service.execute_pipeline(pid)
        assert result.status == "success"
        assert len(result.stage_results) == 2

    @pytest.mark.asyncio
    async def test_full_pipeline(self, service, full_config):
        pid = await service.create_pipeline(full_config)
        result = await service.execute_pipeline(pid)
        assert result.status == "success"
        assert len(result.stage_results) == 4

    @pytest.mark.asyncio
    async def test_pipeline_with_initial_data(self, service):
        config = PipelineConfig(
            name="with-data",
            stages=[
                StageConfig(
                    stage_type="transform",
                    params={"operation": "aggregate"},
                ),
            ],
        )
        pid = await service.create_pipeline(config)
        result = await service.execute_pipeline(
            pid, initial_data={"collected": [1, 2, 3]}
        )
        assert result.status == "success"

    @pytest.mark.asyncio
    async def test_pipeline_not_found(self, service):
        with pytest.raises(ValueError, match="not found"):
            await service.execute_pipeline("nonexistent")

    @pytest.mark.asyncio
    async def test_fail_fast_strategy(self, service):
        """Pipeline should stop on first failure with fail_fast."""

        class FailStage(BaseStage):
            @property
            def name(self) -> str:
                return "fail"

            def __init__(self, params: dict[str, Any]) -> None:
                pass

            async def execute(self, context: PipelineContext) -> StageResult:
                return StageResult(
                    stage_name=self.name,
                    status="failed",
                    error="Intentional failure",
                )

        service.register_stage("fail", FailStage)

        config = PipelineConfig(
            name="fail-fast-test",
            stages=[
                StageConfig(stage_type="fail", params={}),
                StageConfig(
                    stage_type="output",
                    params={"output_type": "log"},
                ),
            ],
            error_strategy="fail_fast",
        )
        pid = await service.create_pipeline(config)
        result = await service.execute_pipeline(pid)
        assert result.status == "failed"
        assert len(result.stage_results) == 1  # Stopped after first

    @pytest.mark.asyncio
    async def test_continue_strategy(self, service):
        """Pipeline should continue on failure with continue strategy."""

        class FailStage(BaseStage):
            @property
            def name(self) -> str:
                return "fail_continue"

            def __init__(self, params: dict[str, Any]) -> None:
                pass

            async def execute(self, context: PipelineContext) -> StageResult:
                return StageResult(
                    stage_name=self.name,
                    status="failed",
                    error="Intentional failure",
                )

        service.register_stage("fail_continue", FailStage)

        config = PipelineConfig(
            name="continue-test",
            stages=[
                StageConfig(stage_type="fail_continue", params={}),
                StageConfig(
                    stage_type="output",
                    params={"output_type": "log"},
                ),
            ],
            error_strategy="continue",
        )
        pid = await service.create_pipeline(config)
        result = await service.execute_pipeline(pid)
        assert result.status == "partial"
        assert len(result.stage_results) == 2  # Both ran

    @pytest.mark.asyncio
    async def test_get_pipeline_result(self, service, simple_config):
        pid = await service.create_pipeline(simple_config)
        exec_result = await service.execute_pipeline(pid)
        stored = await service.get_pipeline_result(exec_result.run_id)
        assert stored is not None
        assert stored.run_id == exec_result.run_id

    @pytest.mark.asyncio
    async def test_run_count_increments(self, service, simple_config):
        pid = await service.create_pipeline(simple_config)
        await service.execute_pipeline(pid)
        await service.execute_pipeline(pid)
        pipelines = await service.list_pipelines()
        assert pipelines[0].run_count == 2


# ── E2E Data Flow Tests ────────────────────────────────────


class TestE2EDataFlow:
    """Test data flows through complete pipeline chains."""

    @pytest.mark.asyncio
    async def test_collect_transform_output(self, service):
        """Data flows: collect static → aggregate → log output."""
        config = PipelineConfig(
            name="e2e-flow",
            stages=[
                StageConfig(
                    stage_type="collect",
                    params={
                        "source_type": "static",
                        "data": [10, 20, 30],
                    },
                ),
                StageConfig(
                    stage_type="transform",
                    params={"operation": "aggregate"},
                ),
                StageConfig(
                    stage_type="output",
                    params={"output_type": "log", "message": "E2E test"},
                ),
            ],
        )
        pid = await service.create_pipeline(config)
        result = await service.execute_pipeline(pid)
        assert result.status == "success"
        assert len(result.stage_results) == 3

        # Verify aggregate was computed
        transform_result = result.stage_results[1]
        assert transform_result["data"]["transformed"]["sum"] == 60

    @pytest.mark.asyncio
    async def test_collect_analyze_output(self, service):
        """Data flows: collect static → analyze statistics → summary."""
        config = PipelineConfig(
            name="analyze-flow",
            stages=[
                StageConfig(
                    stage_type="collect",
                    params={
                        "source_type": "static",
                        "data": [1, 2, 3, 4, 5],
                    },
                ),
                StageConfig(
                    stage_type="analyze",
                    params={"analysis_type": "statistics"},
                ),
                StageConfig(
                    stage_type="output",
                    params={"output_type": "summary"},
                ),
            ],
        )
        pid = await service.create_pipeline(config)
        result = await service.execute_pipeline(pid)
        assert result.status == "success"

        # Verify statistics
        analyze_result = result.stage_results[1]
        assert analyze_result["data"]["analysis"]["mean"] == 3.0

    @pytest.mark.asyncio
    async def test_collect_flatten_analyze(self, service):
        """Data flows: collect nested → flatten → analyze."""
        config = PipelineConfig(
            name="flatten-flow",
            stages=[
                StageConfig(
                    stage_type="collect",
                    params={
                        "source_type": "static",
                        "data": {"a": {"x": 10, "y": 20}, "b": 30},
                    },
                ),
                StageConfig(
                    stage_type="transform",
                    params={"operation": "flatten"},
                ),
                StageConfig(
                    stage_type="analyze",
                    params={"analysis_type": "statistics"},
                ),
            ],
        )
        pid = await service.create_pipeline(config)
        result = await service.execute_pipeline(pid)
        assert result.status == "success"

        # Flattened values should be analyzed
        analyze_data = result.stage_results[2]["data"]["analysis"]
        assert analyze_data["count"] == 3
