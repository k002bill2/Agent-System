"""Built-in pipeline stages."""

from services.pipeline.stages.analyze_stage import AnalyzeStage
from services.pipeline.stages.collect_stage import CollectStage
from services.pipeline.stages.output_stage import OutputStage
from services.pipeline.stages.transform_stage import TransformStage

__all__ = [
    "AnalyzeStage",
    "CollectStage",
    "OutputStage",
    "TransformStage",
]
