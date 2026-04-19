"""Phase execution engine.

Waves run sequentially. Within a wave, tasks with satisfied dependencies run
in parallel up to `max_concurrency`. A task is retried up to `max_retries`;
if a dependency fails the dependent task is marked failed without running.
"""

from __future__ import annotations

import asyncio
from typing import Protocol

from phase_runner.schema import PhaseSpec, Task, Wave


class TaskExecutor(Protocol):
    async def run(self, task: Task, phase: PhaseSpec, body: str) -> bool: ...


class PhaseRunner:
    def __init__(
        self,
        executor: TaskExecutor,
        max_retries: int = 3,
        max_concurrency: int = 3,
    ) -> None:
        self.executor = executor
        self.max_retries = max_retries
        self._sem = asyncio.Semaphore(max_concurrency)

    async def run(self, spec: PhaseSpec, body: str = "") -> PhaseSpec:
        for wave in spec.waves:
            await self._run_wave(wave, spec, body)
        return spec

    async def _run_wave(self, wave: Wave, spec: PhaseSpec, body: str) -> None:
        by_id: dict[str, Task] = {t.id: t for t in wave.tasks}
        done: set[str] = set()
        failed: set[str] = set()
        remaining: set[str] = set(by_id.keys())

        while remaining:
            for tid in list(remaining):
                if any(d in failed for d in by_id[tid].depends_on):
                    by_id[tid].status = "failed"
                    failed.add(tid)
                    remaining.discard(tid)

            ready = [tid for tid in remaining if all(d in done for d in by_id[tid].depends_on)]
            if not ready:
                for tid in remaining:
                    by_id[tid].status = "failed"
                    failed.add(tid)
                remaining.clear()
                break

            results = await asyncio.gather(
                *(self._run_one(by_id[tid], spec, body) for tid in ready)
            )
            for tid, ok in zip(ready, results, strict=True):
                (done if ok else failed).add(tid)
                remaining.discard(tid)

    async def _run_one(self, task: Task, spec: PhaseSpec, body: str) -> bool:
        task.status = "in_progress"
        for _ in range(self.max_retries):
            async with self._sem:
                ok = await self.executor.run(task, spec, body)
            if ok:
                task.status = "done"
                return True
        task.status = "failed"
        return False
