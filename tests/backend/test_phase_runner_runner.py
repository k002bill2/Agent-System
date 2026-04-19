"""Tests for phase_runner.runner with a mock executor."""

import asyncio

import pytest

from phase_runner.runner import PhaseRunner, TaskExecutor
from phase_runner.schema import PhaseSpec, Task, Wave

pytestmark = pytest.mark.asyncio


class MockExecutor(TaskExecutor):
    def __init__(self, behavior: dict[str, list[bool]] | None = None) -> None:
        # behavior[task_id] = list of return values for successive calls;
        # missing ids default to always-success
        self.behavior = behavior or {}
        self.calls: list[str] = []
        self.concurrent_peak = 0
        self._active = 0
        self._lock = asyncio.Lock()

    async def run(self, task, phase, body):  # type: ignore[override]
        async with self._lock:
            self._active += 1
            self.concurrent_peak = max(self.concurrent_peak, self._active)
        try:
            await asyncio.sleep(0.01)  # give concurrency a chance to stack
            self.calls.append(task.id)
            results = self.behavior.get(task.id)
            if results is None:
                return True
            idx = sum(1 for c in self.calls if c == task.id) - 1
            return results[idx] if idx < len(results) else results[-1]
        finally:
            async with self._lock:
                self._active -= 1


def _phase(*waves: Wave) -> PhaseSpec:
    return PhaseSpec(phase="t", waves=list(waves))


class TestHappyPath:
    async def test_single_task_success(self):
        spec = _phase(Wave(name="w", tasks=[Task(id="a")]))
        executor = MockExecutor()
        await PhaseRunner(executor).run(spec)
        assert spec.waves[0].tasks[0].status == "done"
        assert executor.calls == ["a"]


class TestRetries:
    async def test_always_failing_stops_at_max_retries(self):
        spec = _phase(Wave(name="w", tasks=[Task(id="a")]))
        executor = MockExecutor({"a": [False, False, False, False]})
        await PhaseRunner(executor, max_retries=3).run(spec)
        assert spec.waves[0].tasks[0].status == "failed"
        assert executor.calls == ["a", "a", "a"]

    async def test_succeeds_on_second_attempt(self):
        spec = _phase(Wave(name="w", tasks=[Task(id="a")]))
        executor = MockExecutor({"a": [False, True]})
        await PhaseRunner(executor, max_retries=3).run(spec)
        assert spec.waves[0].tasks[0].status == "done"
        assert executor.calls == ["a", "a"]

    async def test_retry_budget_is_per_task(self):
        # If retries are shared across tasks, second task's first attempt
        # would be refused. Here both must run up to their own budget.
        spec = _phase(
            Wave(
                name="w",
                tasks=[Task(id="a"), Task(id="b")],
            )
        )
        executor = MockExecutor({"a": [False, False, False], "b": [False, True]})
        await PhaseRunner(executor, max_retries=3).run(spec)
        assert spec.waves[0].tasks[0].status == "failed"
        assert spec.waves[0].tasks[1].status == "done"


class TestWaveOrdering:
    async def test_wave_2_waits_for_wave_1(self):
        order: list[str] = []

        class OrderExec(TaskExecutor):
            async def run(self, task, phase, body):  # type: ignore[override]
                order.append(f"start:{task.id}")
                await asyncio.sleep(0.01)
                order.append(f"end:{task.id}")
                return True

        spec = _phase(
            Wave(name="w1", tasks=[Task(id="a")]),
            Wave(name="w2", tasks=[Task(id="b")]),
        )
        await PhaseRunner(OrderExec()).run(spec)
        assert order == ["start:a", "end:a", "start:b", "end:b"]


class TestParallelismWithinWave:
    async def test_independent_tasks_run_concurrently(self):
        spec = _phase(
            Wave(
                name="w",
                tasks=[Task(id="a"), Task(id="b"), Task(id="c")],
            )
        )
        executor = MockExecutor()
        await PhaseRunner(executor, max_concurrency=3).run(spec)
        assert executor.concurrent_peak >= 2  # actually expected 3

    async def test_concurrency_cap_respected(self):
        spec = _phase(
            Wave(
                name="w",
                tasks=[Task(id="a"), Task(id="b"), Task(id="c"), Task(id="d")],
            )
        )
        executor = MockExecutor()
        await PhaseRunner(executor, max_concurrency=2).run(spec)
        assert executor.concurrent_peak <= 2


class TestDependencyOrdering:
    async def test_depends_on_forces_sequential(self):
        spec = _phase(
            Wave(
                name="w",
                tasks=[
                    Task(id="a"),
                    Task(id="b", depends_on=["a"]),
                ],
            )
        )
        executor = MockExecutor()
        await PhaseRunner(executor).run(spec)
        assert executor.calls.index("a") < executor.calls.index("b")

    async def test_failed_dep_cascades_without_calling_child(self):
        spec = _phase(
            Wave(
                name="w",
                tasks=[
                    Task(id="a"),
                    Task(id="b", depends_on=["a"]),
                ],
            )
        )
        executor = MockExecutor({"a": [False, False, False]})
        await PhaseRunner(executor, max_retries=3).run(spec)
        assert spec.waves[0].tasks[0].status == "failed"
        assert spec.waves[0].tasks[1].status == "failed"
        assert "b" not in executor.calls


@pytest.mark.asyncio
async def test_executor_receives_task_and_phase():
    """Executor signature contract: run(task, phase, body)."""
    captured: dict = {}

    class CaptureExec(TaskExecutor):
        async def run(self, task, phase, body):  # type: ignore[override]
            captured["task_id"] = task.id
            captured["phase"] = phase.phase
            captured["body"] = body
            return True

    spec = _phase(Wave(name="w", tasks=[Task(id="only")]))
    await PhaseRunner(CaptureExec()).run(spec, body="BODY")
    assert captured == {"task_id": "only", "phase": "t", "body": "BODY"}
