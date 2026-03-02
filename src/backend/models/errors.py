"""Structured error models for Boris Cherny-style error handling.

Makes invalid error states unrepresentable by categorizing errors at creation time,
enabling type-safe branching in self-correction and retry logic.
"""

from __future__ import annotations

import traceback
from datetime import datetime

from utils.time import utcnow
from enum import StrEnum
from typing import Any, ClassVar

from pydantic import BaseModel, Field


class ErrorCategory(StrEnum):
    """Error categories that determine retry strategy.

    Each category maps to a specific recovery behavior in SelfCorrectionNode:
    - PERMANENT: No retry (auth, permission, validation errors)
    - TRANSIENT: Simple retry without LLM analysis (timeout, connection)
    - RESOURCE: Limited retry after resource release (memory, disk)
    - LLM_ERROR: Retry with backoff (rate limit, API errors)
    - LOGIC: LLM analysis needed (assertion, unexpected state)
    - UNKNOWN: Fall through to LLM analysis
    """

    PERMANENT = "permanent"
    TRANSIENT = "transient"
    RESOURCE = "resource"
    LLM_ERROR = "llm_error"
    LOGIC = "logic"
    UNKNOWN = "unknown"


class ErrorSeverity(StrEnum):
    """Error severity levels for monitoring and alerting."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# Retry hints per category
_RETRY_HINTS: dict[ErrorCategory, str] = {
    ErrorCategory.PERMANENT: "Do not retry. Fix the root cause (auth, permissions, or input validation).",
    ErrorCategory.TRANSIENT: "Retry immediately or with short delay. No LLM analysis needed.",
    ErrorCategory.RESOURCE: "Wait for resource availability, then retry (max 1 attempt).",
    ErrorCategory.LLM_ERROR: "Retry with exponential backoff. Check rate limits and API status.",
    ErrorCategory.LOGIC: "Requires LLM analysis to understand root cause and suggest fix.",
    ErrorCategory.UNKNOWN: "Analyze with LLM to determine appropriate recovery strategy.",
}


def _classify_exception(exc: Exception) -> tuple[ErrorCategory, ErrorSeverity]:
    """Classify an exception into category and severity.

    Uses isinstance chain for precise classification.
    Order matters: more specific exceptions should be checked first.
    """
    exc_str = str(exc).lower()

    # Transient: network and timeout errors
    if isinstance(
        exc,
        (
            TimeoutError,
            ConnectionError,
            ConnectionRefusedError,
            ConnectionResetError,
            ConnectionAbortedError,
        ),
    ):
        return ErrorCategory.TRANSIENT, ErrorSeverity.MEDIUM

    # Check for httpx/aiohttp timeout exceptions by class name
    exc_type_name = type(exc).__name__
    if exc_type_name in (
        "TimeoutException",
        "ReadTimeout",
        "ConnectTimeout",
        "ServerTimeoutError",
        "ClientConnectorError",
    ):
        return ErrorCategory.TRANSIENT, ErrorSeverity.MEDIUM

    # Permanent: validation and permission errors
    if isinstance(exc, (ValueError, TypeError)):
        return ErrorCategory.PERMANENT, ErrorSeverity.HIGH
    if isinstance(exc, (PermissionError,)):
        return ErrorCategory.PERMANENT, ErrorSeverity.CRITICAL
    if isinstance(exc, (FileNotFoundError,)):
        return ErrorCategory.PERMANENT, ErrorSeverity.HIGH
    if isinstance(exc, (KeyError, AttributeError, IndexError)):
        return ErrorCategory.LOGIC, ErrorSeverity.HIGH

    # Resource errors
    if isinstance(exc, (MemoryError,)):
        return ErrorCategory.RESOURCE, ErrorSeverity.CRITICAL
    if isinstance(exc, OSError) and "no space" in exc_str:
        return ErrorCategory.RESOURCE, ErrorSeverity.CRITICAL

    # LLM-specific: rate limit detection by message content
    if "rate limit" in exc_str or "rate_limit" in exc_str:
        return ErrorCategory.LLM_ERROR, ErrorSeverity.MEDIUM
    if "quota" in exc_str or "exceeded" in exc_str:
        return ErrorCategory.LLM_ERROR, ErrorSeverity.MEDIUM
    if exc_type_name in ("RateLimitError", "APIStatusError", "InternalServerError"):
        return ErrorCategory.LLM_ERROR, ErrorSeverity.MEDIUM

    # Assertion errors → logic issues
    if isinstance(exc, AssertionError):
        return ErrorCategory.LOGIC, ErrorSeverity.HIGH

    # Runtime errors need further analysis
    if isinstance(exc, RuntimeError):
        return ErrorCategory.LOGIC, ErrorSeverity.MEDIUM

    return ErrorCategory.UNKNOWN, ErrorSeverity.MEDIUM


class StructuredError(BaseModel):
    """Structured error representation for type-safe error handling.

    Enables pattern matching on error category in SelfCorrectionNode
    instead of parsing error strings.

    Example:
        try:
            result = await agent.execute(task)
        except Exception as e:
            error = StructuredError.from_exception(e, context={"task_id": task.id})
            if error.category == ErrorCategory.PERMANENT:
                # Skip retry
            elif error.category == ErrorCategory.TRANSIENT:
                # Simple retry without LLM
    """

    category: ErrorCategory
    severity: ErrorSeverity
    message: str
    original_type: str = Field(description="Original exception class name")
    traceback_summary: str | None = Field(
        default=None, description="Last 3 frames of traceback for debugging"
    )
    context: dict[str, Any] = Field(
        default_factory=dict, description="Additional context (task_id, agent_name, etc.)"
    )
    timestamp: datetime = Field(default_factory=utcnow)
    retry_hint: str | None = Field(
        default=None, description="Category-specific retry recommendation"
    )

    # Class-level constants
    MAX_TRACEBACK_FRAMES: ClassVar[int] = 3

    @classmethod
    def from_exception(
        cls,
        exc: Exception,
        context: dict[str, Any] | None = None,
    ) -> StructuredError:
        """Create a StructuredError from an exception.

        Args:
            exc: The caught exception
            context: Optional context dict (task_id, agent_name, etc.)

        Returns:
            StructuredError with auto-classified category and severity
        """
        category, severity = _classify_exception(exc)

        # Extract traceback summary (last N frames)
        tb_summary = None
        if exc.__traceback__:
            tb_lines = traceback.format_tb(exc.__traceback__)
            tb_summary = "".join(tb_lines[-cls.MAX_TRACEBACK_FRAMES :]).strip()

        return cls(
            category=category,
            severity=severity,
            message=str(exc),
            original_type=type(exc).__qualname__,
            traceback_summary=tb_summary,
            context=context or {},
            retry_hint=_RETRY_HINTS.get(category),
        )

    @property
    def is_retryable(self) -> bool:
        """Whether this error category supports retry."""
        return self.category not in (ErrorCategory.PERMANENT,)

    @property
    def needs_llm_analysis(self) -> bool:
        """Whether this error needs LLM analysis for recovery."""
        return self.category in (ErrorCategory.LOGIC, ErrorCategory.UNKNOWN)
