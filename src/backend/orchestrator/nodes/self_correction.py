"""SelfCorrectionNode — 에러 분석과 재시도 전략 생성 (최대 3회)."""

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from models.agent_state import AgentState, TaskStatus
from models.errors import ErrorCategory
from utils.time import utcnow

from .base import BaseNode


class SelfCorrectionNode(BaseNode):
    """
    Self-correction node for automatic error recovery.

    Responsibilities:
    - Analyze failed task errors
    - Generate corrected approach using LLM
    - Update task description for retry
    - Track retry history
    """

    SYSTEM_PROMPT = """You are the Self-Correction agent in a multi-agent system.

A task has failed and you need to analyze the error and suggest a corrected approach.

Your role is to:
1. Analyze the error message and understand what went wrong
2. Consider the original task description and context
3. Generate a modified approach that avoids the error
4. Provide clear instructions for the retry attempt

Respond with a JSON object containing:
{
    "error_analysis": "What went wrong and why",
    "root_cause": "The underlying cause of the failure",
    "correction_strategy": "How to fix or work around the issue",
    "updated_description": "Modified task description with corrections",
    "should_retry": true|false,
    "confidence": "low|medium|high"
}

Be specific about what changes are needed. If the error suggests the task is impossible, set should_retry to false."""

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Analyze failed task and prepare for retry."""
        current_task_id = state.get("current_task_id")
        tasks = dict(state.get("tasks", {}))

        if not current_task_id or current_task_id not in tasks:
            return {
                "last_error": "No valid task for self-correction",
            }

        task = tasks[current_task_id]

        # Check if we've exceeded max retries
        if task.retry_count >= task.max_retries:
            return {
                "messages": [
                    self._create_message(
                        "system",
                        f"Task '{task.title}' has exceeded maximum retries ({task.max_retries}). "
                        f"Error history: {task.error_history}",
                    )
                ],
                "tasks": {current_task_id: task},
            }

        # Only process failed tasks
        if task.status != TaskStatus.FAILED:
            return {
                "messages": [self._create_message("system", "Task is not in failed state")],
            }

        # ── Category-based fast path (Boris Cherny: errors as values) ──
        structured_error = None
        if task.structured_errors:
            structured_error = task.structured_errors[-1]

        if structured_error:
            category = structured_error.category

            # PERMANENT → 즉시 실패 (재시도 무의미)
            if category == ErrorCategory.PERMANENT:
                task.error = (
                    f"Permanent error (no retry): [{structured_error.original_type}] "
                    f"{structured_error.message}"
                )
                task.updated_at = utcnow()
                return {
                    "tasks": {current_task_id: task},
                    "messages": [
                        self._create_message(
                            "system",
                            f"Self-correction: Permanent error for '{task.title}', skipping retry. "
                            f"Hint: {structured_error.retry_hint}",
                        )
                    ],
                }

            # TRANSIENT → LLM 없이 단순 재시도
            if category == ErrorCategory.TRANSIENT:
                task.error_history = task.error_history + [task.error or "Unknown error"]
                task.retry_count += 1
                task.status = TaskStatus.PENDING
                task.error = None
                task.updated_at = utcnow()
                return {
                    "tasks": {current_task_id: task},
                    "messages": [
                        self._create_message(
                            "system",
                            f"Self-correction: Transient error for '{task.title}', "
                            f"simple retry #{task.retry_count} (no LLM analysis needed).",
                        )
                    ],
                    "next_action": "execute",
                }

            # RESOURCE → 경고 후 제한된 재시도 (최대 1회)
            if category == ErrorCategory.RESOURCE:
                if task.retry_count >= 1:
                    task.error = (
                        f"Resource error persists after retry: [{structured_error.original_type}] "
                        f"{structured_error.message}"
                    )
                    task.updated_at = utcnow()
                    return {
                        "tasks": {current_task_id: task},
                        "messages": [
                            self._create_message(
                                "system",
                                f"Self-correction: Resource error for '{task.title}' "
                                f"persists after retry, marking as failed.",
                            )
                        ],
                    }
                task.error_history = task.error_history + [task.error or "Unknown error"]
                task.retry_count += 1
                task.status = TaskStatus.PENDING
                task.error = None
                task.updated_at = utcnow()
                return {
                    "tasks": {current_task_id: task},
                    "messages": [
                        self._create_message(
                            "system",
                            f"Self-correction: Resource error for '{task.title}', "
                            f"retry #{task.retry_count} after resource release.",
                        )
                    ],
                    "next_action": "execute",
                }

            # LLM_ERROR → 백오프 재시도 (LLM 분석 스킵)
            if category == ErrorCategory.LLM_ERROR:
                task.error_history = task.error_history + [task.error or "Unknown error"]
                task.retry_count += 1
                task.status = TaskStatus.PENDING
                task.error = None
                task.updated_at = utcnow()
                return {
                    "tasks": {current_task_id: task},
                    "messages": [
                        self._create_message(
                            "system",
                            f"Self-correction: LLM API error for '{task.title}', "
                            f"retry #{task.retry_count} with backoff.",
                        )
                    ],
                    "next_action": "execute",
                }

        # ── LOGIC / UNKNOWN → 기존 LLM 분석 경로 ──

        # Use LLM to analyze error and suggest correction
        error_context = f"""
Task Title: {task.title}
Task Description: {task.description}

Error: {task.error}

Previous Attempts: {task.retry_count}
Error History: {task.error_history}
"""

        llm, resolved_model, runtime_resolution = self._resolved_llm_for_state(state)
        runtime_metadata = runtime_resolution.usage_metadata() if runtime_resolution else {}

        try:
            usage_response = None
            if hasattr(llm, "with_structured_output"):
                # Use structured output if available
                from pydantic import BaseModel

                class CorrectionResult(BaseModel):
                    error_analysis: str
                    root_cause: str
                    correction_strategy: str
                    updated_description: str
                    should_retry: bool
                    confidence: str

                structured_llm = llm.with_structured_output(CorrectionResult)
                response = await structured_llm.ainvoke(
                    [
                        SystemMessage(content=self.SYSTEM_PROMPT),
                        HumanMessage(content=error_context),
                    ]
                )
                if hasattr(response, "usage_metadata") or hasattr(response, "response_metadata"):
                    usage_response = response

                correction = {
                    "error_analysis": response.error_analysis,
                    "root_cause": response.root_cause,
                    "correction_strategy": response.correction_strategy,
                    "updated_description": response.updated_description,
                    "should_retry": response.should_retry,
                    "confidence": response.confidence,
                }
            else:
                # Fallback: Parse JSON from response
                llm_response = await llm.ainvoke(
                    [
                        SystemMessage(
                            content=self.SYSTEM_PROMPT + "\n\nRespond with valid JSON only."
                        ),
                        HumanMessage(content=error_context),
                    ]
                )

                content = llm_response.content
                if isinstance(content, str):
                    json_start = content.find("{")
                    json_end = content.rfind("}") + 1
                    if json_start >= 0 and json_end > json_start:
                        json_str = content[json_start:json_end]
                        correction = json.loads(json_str)
                    else:
                        raise ValueError("No valid JSON found in response")
                else:
                    raise ValueError(f"Unexpected response type: {type(content)}")
                usage_response = llm_response

            # Extract token usage
            token_updates = (
                self._extract_and_update_tokens(
                    usage_response,
                    state,
                    "SelfCorrection",
                    model=resolved_model,
                    metadata=runtime_metadata,
                )
                if usage_response is not None
                else {}
            )

        except Exception as e:
            # Fallback correction strategy
            correction = {
                "error_analysis": f"LLM analysis failed: {str(e)}",
                "root_cause": "Unable to determine",
                "correction_strategy": "Retry with original approach",
                "updated_description": task.description,
                "should_retry": task.retry_count < task.max_retries - 1,  # Leave one retry
                "confidence": "low",
            }
            token_updates = {}

        if token_updates:
            await self._record_token_update_usage(
                token_updates,
                state,
                task_id=current_task_id,
            )

        # Update task based on correction
        if correction.get("should_retry", False):
            # Confidence-based retry budget
            confidence = correction.get("confidence", "low")
            if isinstance(confidence, str):
                confidence_map = {"high": 0.9, "medium": 0.6, "low": 0.3}
                confidence_score = confidence_map.get(confidence.lower(), 0.3)
            else:
                confidence_score = float(confidence)

            max_retries_by_confidence = (
                3 if confidence_score >= 0.8 else 2 if confidence_score >= 0.5 else 1
            )
            if task.retry_count >= max_retries_by_confidence:
                task.error = (
                    f"Max retries ({max_retries_by_confidence}) reached based on "
                    f"confidence ({confidence}). "
                    f"Analysis: {correction.get('error_analysis', 'N/A')}"
                )
                task.updated_at = utcnow()
                result = {
                    "tasks": {current_task_id: task},
                    "messages": [
                        self._create_message(
                            "system",
                            f"Self-correction: Confidence-based retry budget exhausted "
                            f"for '{task.title}' (confidence={confidence}, "
                            f"max_retries={max_retries_by_confidence}).",
                        )
                    ],
                }
                if token_updates:
                    result.update(token_updates)
                return result

            # Add current error to history
            task.error_history = task.error_history + [task.error or "Unknown error"]
            task.retry_count += 1
            task.status = TaskStatus.PENDING  # Reset for retry
            task.error = None

            # Update description with correction strategy
            original_desc = task.description.split("\n[Correction:")[
                0
            ]  # Remove previous corrections
            task.description = (
                f"{original_desc}\n\n"
                f"[Correction: Retry #{task.retry_count}]\n"
                f"Strategy: {correction.get('correction_strategy', 'No strategy provided')}\n"
                f"Root cause: {correction.get('root_cause', 'Unknown')}"
            )

            if (
                correction.get("updated_description")
                and correction["updated_description"] != original_desc
            ):
                task.description = correction["updated_description"]

            task.updated_at = utcnow()

            result = {
                "tasks": {current_task_id: task},
                "messages": [
                    self._create_message(
                        "system",
                        f"Self-correction: Retry #{task.retry_count} for '{task.title}'. "
                        f"Analysis: {correction.get('error_analysis', 'N/A')}",
                    )
                ],
                "next_action": "execute",  # Signal to execute again
            }
        else:
            # Don't retry - keep task as failed
            final_error = (
                f"Task failed after {task.retry_count} retries. "
                f"Final analysis: {correction.get('error_analysis', task.error)}"
            )
            task.error = final_error
            task.updated_at = utcnow()

            result = {
                "tasks": {current_task_id: task},
                "messages": [
                    self._create_message(
                        "system",
                        f"Self-correction determined task cannot be retried: {correction.get('error_analysis', 'N/A')}",
                    )
                ],
            }

        # Include token updates if any
        if token_updates:
            result.update(token_updates)

        return result
