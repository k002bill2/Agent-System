"""Analyze stage — statistical analysis and anomaly detection."""

import logging
import math
from typing import Any

from services.pipeline.stage import BaseStage, PipelineContext, StageResult

logger = logging.getLogger(__name__)


class AnalyzeStage(BaseStage):
    """Analyzes data with statistics and anomaly detection."""

    def __init__(self, params: dict[str, Any]) -> None:
        self._analysis_type: str = params.get("analysis_type", "statistics")
        self._params = params

    @property
    def name(self) -> str:
        return "analyze"

    async def execute(self, context: PipelineContext) -> StageResult:
        """Run analysis on context data."""
        # Use transformed data if available, else collected, else raw
        input_data = context.get("transformed", context.get("collected", context.data))

        if self._analysis_type == "statistics":
            return self._compute_statistics(input_data)
        elif self._analysis_type == "anomaly_detection":
            return self._detect_anomalies(input_data)
        elif self._analysis_type == "trend":
            return self._analyze_trend(input_data)
        else:
            return StageResult(
                stage_name=self.name,
                status="failed",
                error=f"Unknown analysis_type: {self._analysis_type}",
            )

    def _extract_values(self, data: Any) -> list[float]:
        """Extract numeric values from various data structures."""
        field = self._params.get("field")

        if isinstance(data, list):
            if field:
                return [
                    float(item[field])
                    for item in data
                    if isinstance(item, dict) and isinstance(item.get(field), (int, float))
                ]
            return [float(v) for v in data if isinstance(v, (int, float))]

        if isinstance(data, dict):
            if field and field in data:
                val = data[field]
                if isinstance(val, (int, float)):
                    return [float(val)]
                if isinstance(val, list):
                    return [float(v) for v in val if isinstance(v, (int, float))]
            # Extract all numeric values from dict
            return [float(v) for v in data.values() if isinstance(v, (int, float))]

        return []

    def _compute_statistics(self, data: Any) -> StageResult:
        """Compute basic statistics (mean, std, percentiles)."""
        values = self._extract_values(data)

        if not values:
            return StageResult(
                stage_name=self.name,
                status="success",
                data={"analysis": {"count": 0, "message": "No numeric values found"}},
            )

        n = len(values)
        mean = sum(values) / n
        sorted_vals = sorted(values)

        # Standard deviation
        variance = sum((x - mean) ** 2 for x in values) / n
        std = math.sqrt(variance)

        # Percentiles
        def percentile(vals: list[float], p: float) -> float:
            idx = (len(vals) - 1) * p / 100
            lower = int(math.floor(idx))
            upper = int(math.ceil(idx))
            if lower == upper:
                return vals[lower]
            weight = idx - lower
            return vals[lower] * (1 - weight) + vals[upper] * weight

        return StageResult(
            stage_name=self.name,
            status="success",
            data={
                "analysis": {
                    "count": n,
                    "mean": round(mean, 4),
                    "std": round(std, 4),
                    "min": sorted_vals[0],
                    "max": sorted_vals[-1],
                    "p25": round(percentile(sorted_vals, 25), 4),
                    "p50": round(percentile(sorted_vals, 50), 4),
                    "p75": round(percentile(sorted_vals, 75), 4),
                    "p95": round(percentile(sorted_vals, 95), 4),
                }
            },
        )

    def _detect_anomalies(self, data: Any) -> StageResult:
        """Detect anomalies using Z-score method."""
        values = self._extract_values(data)
        z_threshold = self._params.get("z_threshold", 2.0)

        if len(values) < 3:
            return StageResult(
                stage_name=self.name,
                status="success",
                data={
                    "analysis": {
                        "anomalies": [],
                        "message": "Insufficient data for anomaly detection (need 3+)",
                    }
                },
            )

        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        std = math.sqrt(variance)

        if std == 0:
            return StageResult(
                stage_name=self.name,
                status="success",
                data={
                    "analysis": {
                        "anomalies": [],
                        "message": "No variance in data",
                    }
                },
            )

        anomalies = []
        for i, val in enumerate(values):
            z_score = abs(val - mean) / std
            if z_score > z_threshold:
                anomalies.append(
                    {
                        "index": i,
                        "value": val,
                        "z_score": round(z_score, 4),
                    }
                )

        return StageResult(
            stage_name=self.name,
            status="success",
            data={
                "analysis": {
                    "anomaly_count": len(anomalies),
                    "anomalies": anomalies,
                    "z_threshold": z_threshold,
                    "mean": round(mean, 4),
                    "std": round(std, 4),
                }
            },
        )

    def _analyze_trend(self, data: Any) -> StageResult:
        """Simple trend analysis (increasing, decreasing, stable)."""
        values = self._extract_values(data)

        if len(values) < 2:
            return StageResult(
                stage_name=self.name,
                status="success",
                data={
                    "analysis": {
                        "trend": "insufficient_data",
                        "message": "Need at least 2 values",
                    }
                },
            )

        # Simple linear regression slope
        n = len(values)
        x_mean = (n - 1) / 2
        y_mean = sum(values) / n

        numerator = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
        denominator = sum((i - x_mean) ** 2 for i in range(n))

        slope = numerator / denominator if denominator != 0 else 0

        # Classify trend
        threshold = self._params.get("trend_threshold", 0.01)
        if abs(slope) < threshold:
            trend = "stable"
        elif slope > 0:
            trend = "increasing"
        else:
            trend = "decreasing"

        return StageResult(
            stage_name=self.name,
            status="success",
            data={
                "analysis": {
                    "trend": trend,
                    "slope": round(slope, 6),
                    "data_points": n,
                }
            },
        )
