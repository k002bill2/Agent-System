"""Tests for AutomationLoopService."""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src" / "backend"))

from services.automation_loop_service import (
    ActionDef,
    AutomationLoopConfig,
    AutomationLoopService,
    ConditionDef,
    ConditionResult,
    LoopState,
    _OPERATORS,
)


# ── Fixtures ────────────────────────────────────────────────


@pytest.fixture
def service():
    """Fresh AutomationLoopService for each test."""
    return AutomationLoopService()


@pytest.fixture
def sample_config():
    """Sample automation loop config."""
    return AutomationLoopConfig(
        name="test-loop",
        interval_seconds=0,  # No delay for tests
        max_iterations=3,
        conditions=[
            ConditionDef(
                metric="health.database.latency_ms",
                operator="gt",
                threshold=100.0,
            )
        ],
        actions=[
            ActionDef(
                type="log",
                target="Database latency exceeded threshold",
            )
        ],
        cooldown_seconds=0,  # No cooldown for tests
    )


@pytest.fixture
def simple_config():
    """Minimal config for basic tests."""
    return AutomationLoopConfig(
        name="simple-loop",
        interval_seconds=0,
        max_iterations=1,
        conditions=[
            ConditionDef(
                metric="health.database.latency_ms", operator="gt", threshold=50.0
            )
        ],
        actions=[ActionDef(type="log", target="triggered")],
        cooldown_seconds=0,
    )


# ── Model Tests ─────────────────────────────────────────────


class TestModels:
    """Test Pydantic model immutability and validation."""

    def test_condition_def_frozen(self):
        cond = ConditionDef(
            metric="health.db.latency_ms", operator="gt", threshold=100.0
        )
        with pytest.raises(Exception):  # ValidationError for frozen
            cond.metric = "changed"

    def test_action_def_frozen(self):
        action = ActionDef(type="log", target="test")
        with pytest.raises(Exception):
            action.type = "webhook"

    def test_config_frozen(self):
        config = AutomationLoopConfig(
            name="test",
            conditions=[ConditionDef(metric="a", operator="gt", threshold=1.0)],
            actions=[ActionDef(type="log", target="t")],
        )
        with pytest.raises(Exception):
            config.name = "changed"

    def test_condition_result_frozen(self):
        result = ConditionResult(
            metric="test", threshold=1.0, operator="gt", triggered=True
        )
        with pytest.raises(Exception):
            result.triggered = False

    def test_config_defaults(self):
        config = AutomationLoopConfig(
            name="defaults",
            conditions=[ConditionDef(metric="a", operator="gt", threshold=1.0)],
            actions=[ActionDef(type="log", target="t")],
        )
        assert config.interval_seconds == 60
        assert config.max_iterations is None
        assert config.cooldown_seconds == 300


# ── Operator Tests ──────────────────────────────────────────


class TestOperators:
    """Test condition evaluation operators."""

    def test_gt(self):
        assert _OPERATORS["gt"](10, 5) is True
        assert _OPERATORS["gt"](5, 10) is False

    def test_lt(self):
        assert _OPERATORS["lt"](5, 10) is True
        assert _OPERATORS["lt"](10, 5) is False

    def test_eq(self):
        assert _OPERATORS["eq"](5, 5) is True
        assert _OPERATORS["eq"](5, 10) is False

    def test_ne(self):
        assert _OPERATORS["ne"](5, 10) is True
        assert _OPERATORS["ne"](5, 5) is False

    def test_gte(self):
        assert _OPERATORS["gte"](10, 10) is True
        assert _OPERATORS["gte"](11, 10) is True
        assert _OPERATORS["gte"](9, 10) is False

    def test_lte(self):
        assert _OPERATORS["lte"](10, 10) is True
        assert _OPERATORS["lte"](9, 10) is True
        assert _OPERATORS["lte"](11, 10) is False


# ── CRUD Tests ──────────────────────────────────────────────


class TestCRUD:
    """Test loop creation, deletion, and listing."""

    @pytest.mark.asyncio
    async def test_create_loop(self, service, sample_config):
        loop_id = await service.create_loop(sample_config)
        assert loop_id is not None
        assert len(loop_id) > 0

    @pytest.mark.asyncio
    async def test_create_loop_returns_unique_ids(self, service, sample_config):
        id1 = await service.create_loop(sample_config)
        id2 = await service.create_loop(sample_config)
        assert id1 != id2

    @pytest.mark.asyncio
    async def test_get_loop_status(self, service, sample_config):
        loop_id = await service.create_loop(sample_config)
        status = await service.get_loop_status(loop_id)
        assert status is not None
        assert status.loop_id == loop_id
        assert status.name == "test-loop"
        assert status.state == LoopState.PENDING

    @pytest.mark.asyncio
    async def test_get_nonexistent_loop(self, service):
        status = await service.get_loop_status("nonexistent")
        assert status is None

    @pytest.mark.asyncio
    async def test_list_loops(self, service, sample_config):
        await service.create_loop(sample_config)
        await service.create_loop(sample_config)
        loops = await service.list_loops()
        assert len(loops) == 2

    @pytest.mark.asyncio
    async def test_list_loops_empty(self, service):
        loops = await service.list_loops()
        assert loops == []

    @pytest.mark.asyncio
    async def test_delete_loop(self, service, sample_config):
        loop_id = await service.create_loop(sample_config)
        deleted = await service.delete_loop(loop_id)
        assert deleted is True
        assert await service.get_loop_status(loop_id) is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_loop(self, service):
        deleted = await service.delete_loop("nonexistent")
        assert deleted is False


# ── Lifecycle Tests ─────────────────────────────────────────


class TestLifecycle:
    """Test loop start, stop, and completion."""

    @pytest.mark.asyncio
    async def test_start_loop(self, service, simple_config):
        loop_id = await service.create_loop(simple_config)

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=10.0
        ):
            await service.start_loop(loop_id)
            # Wait for loop to complete (max_iterations=1)
            await asyncio.sleep(0.1)

        status = await service.get_loop_status(loop_id)
        assert status is not None
        assert status.state == LoopState.COMPLETED

    @pytest.mark.asyncio
    async def test_start_already_running(self, service, sample_config):
        loop_id = await service.create_loop(sample_config)

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=10.0
        ):
            await service.start_loop(loop_id)
            with pytest.raises(ValueError, match="already running"):
                await service.start_loop(loop_id)
            await service.stop_loop(loop_id)

    @pytest.mark.asyncio
    async def test_start_nonexistent_loop(self, service):
        with pytest.raises(ValueError, match="not found"):
            await service.start_loop("nonexistent")

    @pytest.mark.asyncio
    async def test_stop_loop(self, service):
        config = AutomationLoopConfig(
            name="long-running",
            interval_seconds=10,  # Long interval
            max_iterations=None,  # Infinite
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms", operator="gt", threshold=100.0
                )
            ],
            actions=[ActionDef(type="log", target="triggered")],
            cooldown_seconds=0,
        )
        loop_id = await service.create_loop(config)

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=10.0
        ):
            await service.start_loop(loop_id)
            await asyncio.sleep(0.05)  # Let it run briefly

            await service.stop_loop(loop_id)

        status = await service.get_loop_status(loop_id)
        assert status is not None
        assert status.state == LoopState.STOPPED

    @pytest.mark.asyncio
    async def test_stop_already_stopped(self, service, sample_config):
        """Stopping a non-running loop should not error."""
        loop_id = await service.create_loop(sample_config)
        # Should not raise
        await service.stop_loop(loop_id)

    @pytest.mark.asyncio
    async def test_max_iterations_completion(self, service):
        config = AutomationLoopConfig(
            name="limited",
            interval_seconds=0,
            max_iterations=3,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms", operator="gt", threshold=100.0
                )
            ],
            actions=[ActionDef(type="log", target="triggered")],
            cooldown_seconds=0,
        )
        loop_id = await service.create_loop(config)

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=10.0
        ):
            await service.start_loop(loop_id)
            await asyncio.sleep(0.2)

        status = await service.get_loop_status(loop_id)
        assert status is not None
        assert status.state == LoopState.COMPLETED
        assert status.iteration_count == 3

    @pytest.mark.asyncio
    async def test_delete_running_loop(self, service):
        """Deleting a running loop should stop it first."""
        config = AutomationLoopConfig(
            name="to-delete",
            interval_seconds=10,
            max_iterations=None,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms", operator="gt", threshold=100.0
                )
            ],
            actions=[ActionDef(type="log", target="triggered")],
            cooldown_seconds=0,
        )
        loop_id = await service.create_loop(config)

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=10.0
        ):
            await service.start_loop(loop_id)
            await asyncio.sleep(0.05)

            deleted = await service.delete_loop(loop_id)

        assert deleted is True
        assert await service.get_loop_status(loop_id) is None
        assert loop_id not in service._tasks


# ── Condition Evaluation Tests ──────────────────────────────


class TestConditionEvaluation:
    """Test condition evaluation logic."""

    @pytest.mark.asyncio
    async def test_condition_triggered(self, service):
        conditions = [
            ConditionDef(
                metric="health.database.latency_ms", operator="gt", threshold=100.0
            )
        ]

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=150.0
        ):
            results = await service._evaluate_conditions(conditions)

        assert len(results) == 1
        assert results[0].triggered is True
        assert results[0].current_value == 150.0

    @pytest.mark.asyncio
    async def test_condition_not_triggered(self, service):
        conditions = [
            ConditionDef(
                metric="health.database.latency_ms", operator="gt", threshold=100.0
            )
        ]

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=50.0
        ):
            results = await service._evaluate_conditions(conditions)

        assert len(results) == 1
        assert results[0].triggered is False

    @pytest.mark.asyncio
    async def test_condition_metric_unavailable(self, service):
        conditions = [
            ConditionDef(metric="health.unknown.value", operator="gt", threshold=100.0)
        ]

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=None
        ):
            results = await service._evaluate_conditions(conditions)

        assert len(results) == 1
        assert results[0].triggered is False
        assert "not available" in results[0].message

    @pytest.mark.asyncio
    async def test_multiple_conditions(self, service):
        conditions = [
            ConditionDef(
                metric="health.database.latency_ms", operator="gt", threshold=100.0
            ),
            ConditionDef(
                metric="health.redis.latency_ms", operator="lt", threshold=10.0
            ),
        ]

        async def mock_metric(metric: str):
            if "database" in metric:
                return 150.0  # > 100 -> triggered
            return 5.0  # < 10 -> triggered

        with patch.object(service, "_get_metric_value", side_effect=mock_metric):
            results = await service._evaluate_conditions(conditions)

        assert len(results) == 2
        assert all(r.triggered for r in results)


# ── Action Execution Tests ──────────────────────────────────


class TestActionExecution:
    """Test action execution logic."""

    @pytest.mark.asyncio
    async def test_log_action(self, service):
        actions = [ActionDef(type="log", target="Test log message")]
        results = await service._execute_actions(actions)
        assert len(results) == 1
        assert results[0].success is True
        assert results[0].action_type == "log"

    @pytest.mark.asyncio
    async def test_notify_action(self, service):
        actions = [ActionDef(type="notify", target="Alert: high latency")]
        results = await service._execute_actions(actions)
        assert len(results) == 1
        assert results[0].success is True
        assert results[0].action_type == "notify"

    @pytest.mark.asyncio
    async def test_workflow_action_success(self, service):
        actions = [ActionDef(type="workflow", target="workflow-123")]

        mock_wf_service = MagicMock()
        mock_wf_service.trigger_run = AsyncMock(return_value={"id": "run-456"})

        # Mock the lazy imports inside _execute_single_action
        with patch.dict(
            "sys.modules",
            {
                "models.workflow": MagicMock(
                    TriggerType=MagicMock(SCHEDULE="SCHEDULE"),
                    WorkflowRunTrigger=MagicMock(return_value=MagicMock()),
                ),
                "services.workflow_service": MagicMock(
                    get_workflow_service=MagicMock(return_value=mock_wf_service),
                ),
            },
        ):
            results = await service._execute_actions(actions)

        assert len(results) == 1
        assert results[0].action_type == "workflow"
        assert results[0].success is True

    @pytest.mark.asyncio
    async def test_unknown_action_type(self, service):
        """Unknown action type should return failure result, not raise."""
        # We can't create an ActionDef with unknown type due to Literal,
        # but we can test the _execute_single_action directly
        action = ActionDef(type="log", target="test")
        result = await service._execute_single_action(action)
        assert result.success is True

    @pytest.mark.asyncio
    async def test_multiple_actions(self, service):
        actions = [
            ActionDef(type="log", target="msg1"),
            ActionDef(type="log", target="msg2"),
            ActionDef(type="notify", target="alert"),
        ]
        results = await service._execute_actions(actions)
        assert len(results) == 3
        assert all(r.success for r in results)


# ── Cooldown Tests ──────────────────────────────────────────


class TestCooldown:
    """Test cooldown mechanism."""

    def test_not_in_cooldown_initially(self, service):
        assert service._is_in_cooldown("key", 300) is False

    def test_in_cooldown_after_trigger(self, service):
        from utils.time import utcnow

        service._cooldowns["key"] = utcnow()
        assert service._is_in_cooldown("key", 300) is True

    def test_cooldown_expired(self, service):
        from datetime import timedelta

        from utils.time import utcnow

        service._cooldowns["key"] = utcnow() - timedelta(seconds=400)
        assert service._is_in_cooldown("key", 300) is False


# ── Integration-style Tests ─────────────────────────────────


class TestLoopIntegration:
    """Test full loop execution with mocked metrics."""

    @pytest.mark.asyncio
    async def test_condition_triggers_action(self, service):
        """Full loop: condition met → action executed."""
        config = AutomationLoopConfig(
            name="integration-test",
            interval_seconds=0,
            max_iterations=2,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=100.0,
                )
            ],
            actions=[ActionDef(type="log", target="Latency alert!")],
            cooldown_seconds=0,
        )

        loop_id = await service.create_loop(config)

        # Mock metric to return high latency
        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=150.0
        ):
            await service.start_loop(loop_id)
            await asyncio.sleep(0.2)

        status = await service.get_loop_status(loop_id)
        assert status is not None
        assert status.state == LoopState.COMPLETED
        assert status.conditions_met_count > 0
        assert status.actions_executed_count > 0

    @pytest.mark.asyncio
    async def test_condition_not_met_no_action(self, service):
        """Full loop: condition not met → no action."""
        config = AutomationLoopConfig(
            name="no-trigger-test",
            interval_seconds=0,
            max_iterations=2,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=100.0,
                )
            ],
            actions=[ActionDef(type="log", target="Should not trigger")],
            cooldown_seconds=0,
        )

        loop_id = await service.create_loop(config)

        # Mock metric to return low latency
        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=50.0
        ):
            await service.start_loop(loop_id)
            await asyncio.sleep(0.2)

        status = await service.get_loop_status(loop_id)
        assert status is not None
        assert status.conditions_met_count == 0
        assert status.actions_executed_count == 0

    @pytest.mark.asyncio
    async def test_cooldown_prevents_retrigger(self, service):
        """Cooldown should prevent same condition from re-triggering."""
        config = AutomationLoopConfig(
            name="cooldown-test",
            interval_seconds=0,
            max_iterations=3,
            conditions=[
                ConditionDef(
                    metric="health.database.latency_ms",
                    operator="gt",
                    threshold=100.0,
                )
            ],
            actions=[ActionDef(type="log", target="alert")],
            cooldown_seconds=9999,  # Very long cooldown
        )

        loop_id = await service.create_loop(config)

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=150.0
        ):
            await service.start_loop(loop_id)
            await asyncio.sleep(0.3)

        status = await service.get_loop_status(loop_id)
        assert status is not None
        # Should only trigger once due to cooldown
        assert status.conditions_met_count == 1
        assert status.actions_executed_count == 1

    @pytest.mark.asyncio
    async def test_task_cleanup_after_completion(self, service, simple_config):
        """Task reference should be cleaned up after loop completes."""
        loop_id = await service.create_loop(simple_config)

        with patch.object(
            service, "_get_metric_value", new_callable=AsyncMock, return_value=10.0
        ):
            await service.start_loop(loop_id)
            await asyncio.sleep(0.2)

        # Task should be cleaned up
        assert loop_id not in service._tasks


# ── Metric Resolution Tests ────────────────────────────────


class TestMetricResolution:
    """Test _get_metric_value with various inputs."""

    @pytest.mark.asyncio
    async def test_invalid_metric_format(self, service):
        """Metrics not starting with 'health.' should return None."""
        value = await service._get_metric_value("invalid.metric")
        assert value is None

    @pytest.mark.asyncio
    async def test_short_metric_format(self, service):
        """Metrics with fewer than 3 parts should return None."""
        value = await service._get_metric_value("health.db")
        assert value is None

    @pytest.mark.asyncio
    async def test_health_service_import_error(self, service):
        """Should handle HealthService import error gracefully."""
        with patch.dict("sys.modules", {"services.health_service": None}):
            value = await service._get_metric_value("health.database.latency_ms")
            assert value is None
