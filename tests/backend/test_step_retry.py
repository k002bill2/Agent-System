"""Tests for step-level retry."""

import pytest

from models.workflow import (
    TriggerType,
    WorkflowDefinitionSchema,
    WorkflowJobDef,
    WorkflowRunStatus,
    WorkflowStepDef,
)
from services.workflow_engine import WorkflowEngine


class TestStepRetry:
    def setup_method(self):
        self.engine = WorkflowEngine()

    @pytest.mark.asyncio
    async def test_step_retry_on_failure(self):
        """Test that a step with retry config retries on failure."""
        definition = WorkflowDefinitionSchema(
            name="retry-test",
            jobs={
                "test": WorkflowJobDef(
                    steps=[
                        WorkflowStepDef(
                            name="flaky",
                            run="exit 1",
                            retry={"max_attempts": 2, "backoff": "linear"},
                        )
                    ]
                )
            },
        )
        result = await self.engine.execute_run(
            run_id="retry-1",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        # Should still fail after retries
        assert result["status"] == WorkflowRunStatus.FAILED
        # Check logs for retry attempts
        logs = self.engine.get_logs("retry-1")
        retry_logs = [l for l in logs if "retry" in l["message"].lower()]
        assert len(retry_logs) >= 1

    @pytest.mark.asyncio
    async def test_step_no_retry_on_success(self):
        """Test that successful steps don't retry."""
        definition = WorkflowDefinitionSchema(
            name="no-retry",
            jobs={
                "test": WorkflowJobDef(
                    steps=[
                        WorkflowStepDef(
                            name="ok",
                            run="echo ok",
                            retry={"max_attempts": 3},
                        )
                    ]
                )
            },
        )
        result = await self.engine.execute_run(
            run_id="retry-2",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        assert result["status"] == WorkflowRunStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_step_without_retry_config(self):
        """Test normal step execution without retry."""
        definition = WorkflowDefinitionSchema(
            name="normal",
            jobs={
                "test": WorkflowJobDef(
                    steps=[WorkflowStepDef(name="ok", run="echo hi")]
                )
            },
        )
        result = await self.engine.execute_run(
            run_id="retry-3",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        assert result["status"] == WorkflowRunStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_step_retry_max_attempts(self):
        """Test that retry respects max_attempts."""
        definition = WorkflowDefinitionSchema(
            name="max-retry",
            jobs={
                "test": WorkflowJobDef(
                    steps=[
                        WorkflowStepDef(
                            name="always-fail",
                            run="exit 1",
                            retry={"max_attempts": 3, "backoff": "exponential"},
                        )
                    ]
                )
            },
        )
        result = await self.engine.execute_run(
            run_id="retry-4",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        assert result["status"] == WorkflowRunStatus.FAILED

    @pytest.mark.asyncio
    async def test_continue_on_error_with_retry(self):
        """Test continue_on_error with retry."""
        definition = WorkflowDefinitionSchema(
            name="continue-retry",
            jobs={
                "test": WorkflowJobDef(
                    steps=[
                        WorkflowStepDef(
                            name="fail-ok",
                            run="exit 1",
                            continue_on_error=True,
                            retry={"max_attempts": 2},
                        ),
                        WorkflowStepDef(name="after", run="echo after"),
                    ]
                )
            },
        )
        result = await self.engine.execute_run(
            run_id="retry-5",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        # Should complete because continue_on_error is True
        assert result["status"] == WorkflowRunStatus.COMPLETED
