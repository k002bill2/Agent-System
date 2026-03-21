"""Transform stage — data transformation operations."""

import logging
from typing import Any

from services.pipeline.stage import BaseStage, PipelineContext, StageResult

logger = logging.getLogger(__name__)


class TransformStage(BaseStage):
    """Transforms data using configured operations."""

    def __init__(self, params: dict[str, Any]) -> None:
        self._operation: str = params.get("operation", "filter")
        self._params = params

    @property
    def name(self) -> str:
        return "transform"

    async def execute(self, context: PipelineContext) -> StageResult:
        """Apply transformation to context data."""
        input_data = context.get("collected", context.data)

        if self._operation == "filter":
            return self._filter(input_data)
        elif self._operation == "map":
            return self._map(input_data)
        elif self._operation == "aggregate":
            return self._aggregate(input_data)
        elif self._operation == "flatten":
            return self._flatten(input_data)
        else:
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=f"Unknown operation: {self._operation}",
            )

    def _filter(self, data: Any) -> StageResult:
        """Filter data by a field and condition."""
        field = self._params.get("field")
        value = self._params.get("value")

        if not isinstance(data, (list, dict)):
            return StageResult(
                stage_name=self.name,
                status="success",
                data={"transformed": data},
            )

        if isinstance(data, dict):
            if field and field in data:
                return StageResult(
                    stage_name=self.name,
                    status="success",
                    data={"transformed": {field: data[field]}},
                )
            return StageResult(
                stage_name=self.name,
                status="success",
                data={"transformed": data},
            )

        # List filtering
        if field and value is not None:
            filtered = [
                item for item in data if isinstance(item, dict) and item.get(field) == value
            ]
        elif field:
            filtered = [item for item in data if isinstance(item, dict) and field in item]
        else:
            filtered = data

        return StageResult(
            stage_name=self.name,
            status="success",
            data={"transformed": filtered},
        )

    def _map(self, data: Any) -> StageResult:
        """Map/rename fields in data."""
        field_map: dict[str, str] = self._params.get("field_map", {})

        if not field_map:
            return StageResult(
                stage_name=self.name,
                status="success",
                data={"transformed": data},
            )

        if isinstance(data, dict):
            mapped = {field_map.get(k, k): v for k, v in data.items()}
            return StageResult(
                stage_name=self.name,
                status="success",
                data={"transformed": mapped},
            )

        if isinstance(data, list):
            mapped_list = [
                {field_map.get(k, k): v for k, v in item.items()}
                if isinstance(item, dict)
                else item
                for item in data
            ]
            return StageResult(
                stage_name=self.name,
                status="success",
                data={"transformed": mapped_list},
            )

        return StageResult(
            stage_name=self.name,
            status="success",
            data={"transformed": data},
        )

    def _aggregate(self, data: Any) -> StageResult:
        """Aggregate numeric values."""
        if not isinstance(data, list):
            return StageResult(
                stage_name=self.name,
                status="success",
                data={"transformed": data},
            )

        field = self._params.get("field")
        if field:
            values = [
                item[field]
                for item in data
                if isinstance(item, dict) and isinstance(item.get(field), (int, float))
            ]
        else:
            values = [v for v in data if isinstance(v, (int, float))]

        if not values:
            return StageResult(
                stage_name=self.name,
                status="success",
                data={"transformed": {"count": 0}},
            )

        return StageResult(
            stage_name=self.name,
            status="success",
            data={
                "transformed": {
                    "count": len(values),
                    "sum": sum(values),
                    "avg": sum(values) / len(values),
                    "min": min(values),
                    "max": max(values),
                }
            },
        )

    def _flatten(self, data: Any) -> StageResult:
        """Flatten nested dict to dot-notation keys."""
        if not isinstance(data, dict):
            return StageResult(
                stage_name=self.name,
                status="success",
                data={"transformed": data},
            )

        flat: dict[str, Any] = {}
        self._flatten_dict(data, "", flat)

        return StageResult(
            stage_name=self.name,
            status="success",
            data={"transformed": flat},
        )

    def _flatten_dict(self, d: dict, prefix: str, result: dict) -> None:
        """Recursively flatten a dict."""
        for key, value in d.items():
            full_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                self._flatten_dict(value, full_key, result)
            else:
                result[full_key] = value
