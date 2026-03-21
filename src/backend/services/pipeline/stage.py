"""Pipeline stage base class and context."""

import time
from abc import ABC, abstractmethod
from typing import Any, Literal

from pydantic import BaseModel


class StageResult(BaseModel, frozen=True):
    """Stage execution result (immutable)."""

    stage_name: str
    status: Literal["success", "failed", "skipped"]
    data: dict[str, Any] = {}
    error: str | None = None
    duration_ms: float = 0


class PipelineContext:
    """Mutable context passed between pipeline stages.

    Each stage reads from and writes to this context,
    enabling Chain of Responsibility data flow.
    """

    def __init__(self, initial_data: dict[str, Any] | None = None) -> None:
        self._data: dict[str, Any] = dict(initial_data) if initial_data else {}
        self._stage_results: list[StageResult] = []

    @property
    def data(self) -> dict[str, Any]:
        """Current pipeline data."""
        return self._data

    @property
    def stage_results(self) -> list[StageResult]:
        """Results from completed stages."""
        return list(self._stage_results)

    def set(self, key: str, value: Any) -> None:
        """Set a value in the context."""
        self._data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        """Get a value from the context."""
        return self._data.get(key, default)

    def add_result(self, result: StageResult) -> None:
        """Record a stage result."""
        self._stage_results.append(result)
        # Merge stage output data into context
        if result.data:
            self._data.update(result.data)


class BaseStage(ABC):
    """Abstract base class for pipeline stages."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Stage name identifier."""
        ...

    @property
    def input_schema(self) -> type[BaseModel] | None:
        """Optional input validation schema."""
        return None

    @property
    def output_schema(self) -> type[BaseModel] | None:
        """Optional output validation schema."""
        return None

    async def execute_with_timing(self, context: PipelineContext) -> StageResult:
        """Execute the stage with timing and error handling."""
        start = time.time()
        try:
            result = await self.execute(context)
            # Override duration with measured time
            duration = (time.time() - start) * 1000
            return StageResult(
                stage_name=result.stage_name,
                status=result.status,
                data=result.data,
                error=result.error,
                duration_ms=duration,
            )
        except Exception as e:
            duration = (time.time() - start) * 1000
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=str(e),
                duration_ms=duration,
            )

    @abstractmethod
    async def execute(self, context: PipelineContext) -> StageResult:
        """Execute this stage. Must be implemented by subclasses."""
        ...
