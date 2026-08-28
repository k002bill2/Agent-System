"""Claude CLI usage 메타데이터 파싱과 LLM 원장 기록 브리지.

`record_usage_best_effort` · `enforce_usage_quota_preflight_best_effort` 를
읽는 함수가 전부 이 모듈에 있다. 테스트는 그 둘을
`services.tmux_service.usage.<이름>` 으로 패치한다 — 읽는 쪽을 다른
모듈로 가르면 패치가 조용히 무효가 된다.
"""

import asyncio
import json
import logging
import re
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from models.llm_usage import (
    LLMRuntimeMode,
    LLMUsageMeasurementMethod,
    LLMUsageRecordCreate,
    LLMUsageSource,
    LLMUsageStatus,
)
from services.llm_usage_ledger_service import (
    enforce_usage_quota_preflight_best_effort,
    record_usage_best_effort,
)

logger = logging.getLogger(__name__)


def _usage_context_value(usage_context: dict[str, Any] | None, key: str) -> Any:
    if not usage_context:
        return None
    value = usage_context.get(key)
    if isinstance(value, Enum):
        return value.value
    return value


def _usage_context_metadata(usage_context: dict[str, Any] | None) -> dict[str, Any]:
    if not usage_context:
        return {}
    metadata = usage_context.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def _estimate_prompt_tokens(prompt: str) -> int:
    return max(1, len(prompt.split()) * 2)


def _compact_text(value: str, *, limit: int = 2000) -> str:
    return value.strip()[:limit]


def _as_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float):
        return int(value) if value >= 0 else None
    if isinstance(value, str):
        cleaned = value.strip().replace(",", "")
        if cleaned.isdigit():
            return int(cleaned)
    return None


def _as_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value) if value >= 0 else None
    if isinstance(value, str):
        cleaned = value.strip().replace(",", "").removeprefix("$")
        try:
            parsed = float(cleaned)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def _first_int(source: dict[str, Any], keys: tuple[str, ...]) -> int | None:
    for key in keys:
        value = _as_int(source.get(key))
        if value is not None:
            return value
    return None


def _first_float(source: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = _as_float(source.get(key))
        if value is not None:
            return value
    return None


def _merge_usage_dict(target: dict[str, Any], source: dict[str, Any]) -> None:
    input_tokens = _first_int(
        source,
        (
            "input_tokens",
            "prompt_tokens",
            "input_token_count",
            "inputTokenCount",
        ),
    )
    output_tokens = _first_int(
        source,
        (
            "output_tokens",
            "completion_tokens",
            "output_token_count",
            "outputTokenCount",
        ),
    )
    total_tokens = _first_int(
        source,
        (
            "total_tokens",
            "total_token_count",
            "totalTokenCount",
            "tokens",
        ),
    )
    cost_usd = _first_float(
        source,
        (
            "estimated_cost_usd",
            "total_cost_usd",
            "cost_usd",
            "cost",
        ),
    )

    if input_tokens is not None and target.get("input_tokens") is None:
        target["input_tokens"] = input_tokens
    if output_tokens is not None and target.get("output_tokens") is None:
        target["output_tokens"] = output_tokens
    if total_tokens is not None and target.get("total_tokens") is None:
        target["total_tokens"] = total_tokens
    if cost_usd is not None and target.get("estimated_cost_usd") is None:
        target["estimated_cost_usd"] = cost_usd


def _iter_usage_dicts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, dict):
        return []
    candidates: list[dict[str, Any]] = [value]
    for key in ("usage", "usage_metadata", "token_usage", "metrics"):
        nested = value.get(key)
        if isinstance(nested, dict):
            candidates.extend(_iter_usage_dicts(nested))
    return candidates


def _extract_labeled_usage(text: str, target: dict[str, Any]) -> None:
    patterns = {
        "input_tokens": r"(?:input|prompt)[ _-]?tokens?\s*[:=]\s*([\d,]+)",
        "output_tokens": r"(?:output|completion)[ _-]?tokens?\s*[:=]\s*([\d,]+)",
        "total_tokens": r"total[ _-]?tokens?\s*[:=]\s*([\d,]+)",
        "estimated_cost_usd": r"(?:estimated\s+)?(?:total\s+)?cost(?:\s+usd)?\s*[:=]\s*\$?([\d,.]+)",
    }
    for key, pattern in patterns.items():
        if target.get(key) is not None:
            continue
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        value = (
            _as_float(match.group(1)) if key == "estimated_cost_usd" else _as_int(match.group(1))
        )
        if value is not None:
            target[key] = value


def parse_claude_cli_usage_metadata(transcript: str | None) -> dict[str, Any]:
    """Extract token/cost metadata from Claude CLI transcript text."""
    if not transcript:
        return {}

    usage: dict[str, Any] = {
        "input_tokens": None,
        "output_tokens": None,
        "total_tokens": None,
        "estimated_cost_usd": None,
    }
    for line in transcript.splitlines():
        stripped = line.strip()
        if not stripped.startswith("{"):
            continue
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        for candidate in _iter_usage_dicts(payload):
            _merge_usage_dict(usage, candidate)

    _extract_labeled_usage(transcript, usage)
    if usage["total_tokens"] is None and (
        usage["input_tokens"] is not None or usage["output_tokens"] is not None
    ):
        usage["total_tokens"] = (usage["input_tokens"] or 0) + (usage["output_tokens"] or 0)

    return {key: value for key, value in usage.items() if value is not None}


async def _enforce_tmux_quota_preflight(
    usage_context: dict[str, Any] | None,
    prompt: str,
) -> None:
    await enforce_usage_quota_preflight_best_effort(
        user_id=_usage_context_value(usage_context, "user_id"),
        organization_id=_usage_context_value(usage_context, "organization_id"),
        estimated_tokens=_estimate_prompt_tokens(prompt),
    )


async def _record_tmux_cli_usage(
    *,
    usage_context: dict[str, Any] | None,
    analysis_id: str,
    project_path: str,
    branch_name: str | None,
    session_name: str | None,
    status: LLMUsageStatus,
    started_at: datetime,
    event: str = "tmux_execute_analysis_started",
    prompt_chars: int | None = None,
    cli_usage_metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> None:
    source = _usage_context_value(usage_context, "source") or (
        LLMUsageSource.TASK_ANALYZER_EXECUTION.value
    )
    metadata = {
        "event": event,
        "project_path": project_path,
        "branch_name": branch_name,
        "tmux_session": session_name,
        "prompt_chars": prompt_chars,
    }
    if cli_usage_metadata:
        metadata["cli_usage_metadata"] = cli_usage_metadata
    metadata.update(_usage_context_metadata(usage_context))
    metadata = {k: v for k, v in metadata.items() if v is not None}
    measurement_method = (
        LLMUsageMeasurementMethod.CLI_METADATA
        if cli_usage_metadata
        else LLMUsageMeasurementMethod.UNKNOWN
    )

    await record_usage_best_effort(
        LLMUsageRecordCreate(
            user_id=_usage_context_value(usage_context, "user_id"),
            organization_id=_usage_context_value(usage_context, "organization_id"),
            provider="claude_cli",
            mode=LLMRuntimeMode.CLI,
            source=source,
            model="claude-code-cli",
            input_tokens=cli_usage_metadata.get("input_tokens") if cli_usage_metadata else None,
            output_tokens=cli_usage_metadata.get("output_tokens") if cli_usage_metadata else None,
            total_tokens=cli_usage_metadata.get("total_tokens") if cli_usage_metadata else None,
            measurement_method=measurement_method,
            estimated_cost_usd=cli_usage_metadata.get("estimated_cost_usd")
            if cli_usage_metadata
            else None,
            status=status,
            session_id=session_name,
            analysis_id=analysis_id,
            project_id=_usage_context_value(usage_context, "project_id"),
            error_message=error_message,
            metadata=metadata,
            started_at=started_at,
            completed_at=datetime.now(tz=UTC),
        )
    )


def _schedule_tmux_cli_usage(**kwargs) -> None:
    """Schedule ledger writes from sync tmux lifecycle methods."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        try:
            asyncio.run(_record_tmux_cli_usage(**kwargs))
        except Exception:
            logger.warning("tmux_cli_usage_record_failed", exc_info=True)
        return

    loop.create_task(_record_tmux_cli_usage(**kwargs))
