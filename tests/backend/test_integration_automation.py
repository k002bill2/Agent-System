"""Integration tests for AutomationLoopService + PipelineService E2E."""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src" / "backend"))

from services.automation_loop_service import (
    ActionDef,
    AutomationLoopConfig,
    AutomationLoopService,
    ConditionDef,
    LoopState,
)
from services.pipeline.models import PipelineConfig, StageConfig
from services.pipeline.pipeline_service import PipelineService


# ── Fixtures ────────────────────────────────────────────────


@pytest.fixture
def automation_service():
    """Fresh AutomationLoopService with cleanup."""
    return AutomationLoopService()


@pytest.fixture
def pipeline_service():
    """Fresh PipelineService."""
    return PipelineService()


# ── Scenario 1: 조건 감지 → 액션 실행 루프 ──────────────────


class TestScenario1ConditionTriggersAction:
    """
    Given: health.db.latency_ms > 100ms 조건의 루프가 활성화됨
    When: HealthService가 latency 120ms 반환
    Then: 설정된 액션(log)이 실행됨
    And: cooldown 기간 내 동일 조건 재트리거 안 됨
    """

    @pytest.mark.asyncio
    async def test_condition_triggers_action(self, automation_service):
        """조건 충족 시 액션이 실행되어야 한다."""
        config = AutomationLoopConfig(
            name="latency-monitor",
            interval_seconds=0,
            max_iterations=2,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=100.0,
                )
            ],
            actions=[
                ActionDef(type="log", target="High latency detected!"),
            ],
            cooldown_seconds=0,
        )

        loop_id = await automation_service.create_loop(config)

        # Mock metric to return 120ms (> 100ms threshold)
        with patch.object(
            automation_service,
            "_get_metric_value",
            new_callable=AsyncMock,
            return_value=120.0,
        ):
            await automation_service.start_loop(loop_id)
            await asyncio.sleep(0.3)

        status = await automation_service.get_loop_status(loop_id)
        assert status is not None
        assert status.state == LoopState.COMPLETED
        assert status.conditions_met_count >= 1
        assert status.actions_executed_count >= 1

    @pytest.mark.asyncio
    async def test_cooldown_prevents_retrigger(self, automation_service):
        """cooldown 기간 내 동일 조건 재트리거가 방지되어야 한다."""
        config = AutomationLoopConfig(
            name="cooldown-test",
            interval_seconds=0,
            max_iterations=5,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=100.0,
                )
            ],
            actions=[
                ActionDef(type="log", target="Alert!"),
            ],
            cooldown_seconds=9999,  # Very long cooldown
        )

        loop_id = await automation_service.create_loop(config)

        with patch.object(
            automation_service,
            "_get_metric_value",
            new_callable=AsyncMock,
            return_value=150.0,
        ):
            await automation_service.start_loop(loop_id)
            await asyncio.sleep(0.3)

        status = await automation_service.get_loop_status(loop_id)
        assert status is not None
        # Despite 5 iterations, cooldown should limit to 1 trigger
        assert status.conditions_met_count == 1
        assert status.actions_executed_count == 1

    @pytest.mark.asyncio
    async def test_condition_not_met_no_action(self, automation_service):
        """조건 미충족 시 액션이 실행되지 않아야 한다."""
        config = AutomationLoopConfig(
            name="no-trigger",
            interval_seconds=0,
            max_iterations=3,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=100.0,
                )
            ],
            actions=[
                ActionDef(type="log", target="Should not fire"),
            ],
            cooldown_seconds=0,
        )

        loop_id = await automation_service.create_loop(config)

        # Mock metric to return 50ms (< 100ms threshold)
        with patch.object(
            automation_service,
            "_get_metric_value",
            new_callable=AsyncMock,
            return_value=50.0,
        ):
            await automation_service.start_loop(loop_id)
            await asyncio.sleep(0.2)

        status = await automation_service.get_loop_status(loop_id)
        assert status is not None
        assert status.conditions_met_count == 0
        assert status.actions_executed_count == 0


# ── Scenario 2: 파이프라인 E2E 실행 ──────────────────────────


class TestScenario2PipelineE2E:
    """
    Given: collect → transform → output 3단계 파이프라인 정의
    When: 파이프라인 실행
    Then: 각 스테이지 순서대로 실행됨
    And: 스테이지 간 데이터가 올바르게 전달됨
    And: 최종 결과에 모든 스테이지 결과 포함
    """

    @pytest.mark.asyncio
    async def test_pipeline_collect_transform_output(self, pipeline_service):
        """3단계 파이프라인이 순차적으로 실행되어야 한다."""
        config = PipelineConfig(
            name="e2e-3stage",
            stages=[
                StageConfig(
                    stage_type="collect",
                    params={
                        "source_type": "static",
                        "data": [10, 20, 30, 40, 50],
                    },
                ),
                StageConfig(
                    stage_type="transform",
                    params={"operation": "aggregate"},
                ),
                StageConfig(
                    stage_type="output",
                    params={"output_type": "log", "message": "Integration test"},
                ),
            ],
        )

        pid = await pipeline_service.create_pipeline(config)
        result = await pipeline_service.execute_pipeline(pid)

        # All 3 stages should have executed
        assert result.status == "success"
        assert len(result.stage_results) == 3

        # Verify stage order
        assert result.stage_results[0]["stage_name"] == "collect"
        assert result.stage_results[1]["stage_name"] == "transform"
        assert result.stage_results[2]["stage_name"] == "output"

        # All stages succeeded
        assert all(sr["status"] == "success" for sr in result.stage_results)

    @pytest.mark.asyncio
    async def test_data_flows_between_stages(self, pipeline_service):
        """스테이지 간 데이터가 올바르게 전달되어야 한다."""
        config = PipelineConfig(
            name="data-flow-test",
            stages=[
                StageConfig(
                    stage_type="collect",
                    params={
                        "source_type": "static",
                        "data": {"a": {"x": 1, "y": 2}, "b": 3},
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

        pid = await pipeline_service.create_pipeline(config)
        result = await pipeline_service.execute_pipeline(pid)

        assert result.status == "success"

        # Collect outputs nested dict
        collect_data = result.stage_results[0]["data"]["collected"]
        assert "a" in collect_data

        # Transform flattens it
        transform_data = result.stage_results[1]["data"]["transformed"]
        assert "a.x" in transform_data
        assert transform_data["a.x"] == 1

        # Analyze computes stats on the flattened numeric values
        analysis = result.stage_results[2]["data"]["analysis"]
        assert analysis["count"] == 3  # a.x=1, a.y=2, b=3

    @pytest.mark.asyncio
    async def test_pipeline_result_stored(self, pipeline_service):
        """실행 결과가 저장되어 조회 가능해야 한다."""
        config = PipelineConfig(
            name="result-test",
            stages=[
                StageConfig(
                    stage_type="collect",
                    params={"source_type": "static", "data": [1]},
                ),
            ],
        )

        pid = await pipeline_service.create_pipeline(config)
        exec_result = await pipeline_service.execute_pipeline(pid)

        stored = await pipeline_service.get_pipeline_result(exec_result.run_id)
        assert stored is not None
        assert stored.run_id == exec_result.run_id
        assert stored.pipeline_id == pid

    @pytest.mark.asyncio
    async def test_full_4stage_pipeline(self, pipeline_service):
        """collect → transform → analyze → output 4단계 파이프라인."""
        config = PipelineConfig(
            name="full-4stage",
            stages=[
                StageConfig(
                    stage_type="collect",
                    params={
                        "source_type": "static",
                        "data": [5, 10, 15, 20, 25, 100],
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

        pid = await pipeline_service.create_pipeline(config)
        result = await pipeline_service.execute_pipeline(pid)

        assert result.status == "success"
        assert len(result.stage_results) == 4
        assert result.total_duration_ms > 0

        # Summary output should list all previous stages
        output_data = result.stage_results[3]["data"]["output"]
        assert output_data["total_stages"] == 3  # summary sees 3 prior stages


# ── Scenario 3: 자동화 루프 → 파이프라인 트리거 연동 ──────────


class TestScenario3AutomationTriggersPipeline:
    """
    Given: 조건 충족 시 pipeline을 실행하는 자동화 루프
    When: 조건이 충족됨
    Then: 해당 파이프라인이 자동 실행됨
    And: 파이프라인 결과가 기록됨
    """

    @pytest.mark.asyncio
    async def test_automation_loop_triggers_pipeline(
        self, automation_service, pipeline_service
    ):
        """자동화 루프가 조건 충족 시 파이프라인을 트리거해야 한다."""
        # 1. Create pipeline first
        pipeline_config = PipelineConfig(
            name="auto-triggered",
            stages=[
                StageConfig(
                    stage_type="collect",
                    params={"source_type": "static", "data": [1, 2, 3]},
                ),
                StageConfig(
                    stage_type="output",
                    params={"output_type": "log", "message": "Auto-triggered"},
                ),
            ],
        )
        pipeline_id = await pipeline_service.create_pipeline(pipeline_config)

        # 2. Create automation loop with pipeline action
        loop_config = AutomationLoopConfig(
            name="pipeline-trigger-loop",
            interval_seconds=0,
            max_iterations=1,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=50.0,
                )
            ],
            actions=[
                ActionDef(
                    type="pipeline",
                    target=pipeline_id,
                    params={},
                ),
            ],
            cooldown_seconds=0,
        )
        loop_id = await automation_service.create_loop(loop_config)

        # 3. Mock metric and pipeline service, then run
        from unittest.mock import MagicMock

        mock_pipeline_module = MagicMock()
        mock_pipeline_module.get_pipeline_service = MagicMock(
            return_value=pipeline_service,
        )

        with patch.object(
            automation_service,
            "_get_metric_value",
            new_callable=AsyncMock,
            return_value=100.0,  # > 50 threshold
        ):
            with patch.dict(
                "sys.modules",
                {"services.pipeline.pipeline_service": mock_pipeline_module},
            ):
                await automation_service.start_loop(loop_id)
                await asyncio.sleep(0.3)

        # 4. Verify loop completed and triggered
        status = await automation_service.get_loop_status(loop_id)
        assert status is not None
        assert status.state == LoopState.COMPLETED
        assert status.conditions_met_count == 1
        assert status.actions_executed_count == 1

        # 5. Verify pipeline was actually executed
        pipelines = await pipeline_service.list_pipelines()
        triggered = [p for p in pipelines if p.pipeline_id == pipeline_id]
        assert len(triggered) == 1
        assert triggered[0].run_count == 1

    @pytest.mark.asyncio
    async def test_pipeline_action_failure_handled(
        self, automation_service, pipeline_service
    ):
        """존재하지 않는 파이프라인 트리거 시 에러가 적절히 처리되어야 한다."""
        loop_config = AutomationLoopConfig(
            name="bad-pipeline-loop",
            interval_seconds=0,
            max_iterations=1,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=50.0,
                )
            ],
            actions=[
                ActionDef(
                    type="pipeline",
                    target="nonexistent-pipeline-id",
                    params={},
                ),
            ],
            cooldown_seconds=0,
        )
        loop_id = await automation_service.create_loop(loop_config)

        from unittest.mock import MagicMock

        mock_pipeline_module = MagicMock()
        mock_pipeline_module.get_pipeline_service = MagicMock(
            return_value=pipeline_service,
        )

        with patch.object(
            automation_service,
            "_get_metric_value",
            new_callable=AsyncMock,
            return_value=100.0,
        ):
            with patch.dict(
                "sys.modules",
                {"services.pipeline.pipeline_service": mock_pipeline_module},
            ):
                await automation_service.start_loop(loop_id)
                await asyncio.sleep(0.3)

        # Loop should complete without crashing
        status = await automation_service.get_loop_status(loop_id)
        assert status is not None
        assert status.state == LoopState.COMPLETED
        assert status.conditions_met_count == 1
        # Action executed but failed (pipeline not found) — counts as 0 successful
        assert status.actions_executed_count == 0


# ── Graceful Shutdown & Cleanup Tests ───────────────────────


class TestGracefulShutdown:
    """Test graceful shutdown and resource cleanup."""

    @pytest.mark.asyncio
    async def test_stop_running_loop(self, automation_service):
        """진행 중 루프가 안전하게 종료되어야 한다."""
        config = AutomationLoopConfig(
            name="long-running",
            interval_seconds=10,
            max_iterations=None,  # Infinite
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=100.0,
                )
            ],
            actions=[ActionDef(type="log", target="running")],
            cooldown_seconds=0,
        )
        loop_id = await automation_service.create_loop(config)

        with patch.object(
            automation_service,
            "_get_metric_value",
            new_callable=AsyncMock,
            return_value=50.0,
        ):
            await automation_service.start_loop(loop_id)
            await asyncio.sleep(0.1)
            await automation_service.stop_loop(loop_id)

        status = await automation_service.get_loop_status(loop_id)
        assert status is not None
        assert status.state == LoopState.STOPPED
        assert loop_id not in automation_service._tasks

    @pytest.mark.asyncio
    async def test_task_cleanup_after_completion(self, automation_service):
        """루프 완료 후 asyncio.Task 참조가 정리되어야 한다."""
        config = AutomationLoopConfig(
            name="cleanup-test",
            interval_seconds=0,
            max_iterations=1,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=100.0,
                )
            ],
            actions=[ActionDef(type="log", target="done")],
            cooldown_seconds=0,
        )
        loop_id = await automation_service.create_loop(config)

        with patch.object(
            automation_service,
            "_get_metric_value",
            new_callable=AsyncMock,
            return_value=50.0,
        ):
            await automation_service.start_loop(loop_id)
            await asyncio.sleep(0.2)

        # Task should be cleaned up
        assert loop_id not in automation_service._tasks

    @pytest.mark.asyncio
    async def test_delete_stops_and_removes(self, automation_service):
        """삭제 시 루프를 먼저 정지한 후 삭제해야 한다."""
        config = AutomationLoopConfig(
            name="delete-test",
            interval_seconds=10,
            max_iterations=None,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=100.0,
                )
            ],
            actions=[ActionDef(type="log", target="running")],
            cooldown_seconds=0,
        )
        loop_id = await automation_service.create_loop(config)

        with patch.object(
            automation_service,
            "_get_metric_value",
            new_callable=AsyncMock,
            return_value=50.0,
        ):
            await automation_service.start_loop(loop_id)
            await asyncio.sleep(0.1)
            deleted = await automation_service.delete_loop(loop_id)

        assert deleted is True
        assert await automation_service.get_loop_status(loop_id) is None
        assert loop_id not in automation_service._tasks
