"""Tests for StructuredError model and exception classification."""

import pytest

from models.errors import (
    ErrorCategory,
    ErrorSeverity,
    StructuredError,
    _classify_exception,
)


class TestClassifyException:
    """Tests for _classify_exception function."""

    def test_timeout_error_is_transient(self):
        cat, sev = _classify_exception(TimeoutError("Connection timed out"))
        assert cat == ErrorCategory.TRANSIENT
        assert sev == ErrorSeverity.MEDIUM

    def test_connection_error_is_transient(self):
        cat, sev = _classify_exception(ConnectionError("Connection refused"))
        assert cat == ErrorCategory.TRANSIENT
        assert sev == ErrorSeverity.MEDIUM

    def test_connection_reset_is_transient(self):
        cat, sev = _classify_exception(ConnectionResetError("Reset by peer"))
        assert cat == ErrorCategory.TRANSIENT
        assert sev == ErrorSeverity.MEDIUM

    def test_value_error_is_permanent(self):
        cat, sev = _classify_exception(ValueError("Invalid input"))
        assert cat == ErrorCategory.PERMANENT
        assert sev == ErrorSeverity.HIGH

    def test_type_error_is_permanent(self):
        cat, sev = _classify_exception(TypeError("Wrong type"))
        assert cat == ErrorCategory.PERMANENT
        assert sev == ErrorSeverity.HIGH

    def test_permission_error_is_permanent_critical(self):
        cat, sev = _classify_exception(PermissionError("Access denied"))
        assert cat == ErrorCategory.PERMANENT
        assert sev == ErrorSeverity.CRITICAL

    def test_file_not_found_is_permanent(self):
        cat, sev = _classify_exception(FileNotFoundError("No such file"))
        assert cat == ErrorCategory.PERMANENT
        assert sev == ErrorSeverity.HIGH

    def test_memory_error_is_resource(self):
        cat, sev = _classify_exception(MemoryError())
        assert cat == ErrorCategory.RESOURCE
        assert sev == ErrorSeverity.CRITICAL

    def test_disk_full_os_error_is_resource(self):
        cat, sev = _classify_exception(OSError("No space left on device"))
        assert cat == ErrorCategory.RESOURCE
        assert sev == ErrorSeverity.CRITICAL

    def test_rate_limit_in_message_is_llm_error(self):
        cat, sev = _classify_exception(Exception("Rate limit exceeded"))
        assert cat == ErrorCategory.LLM_ERROR
        assert sev == ErrorSeverity.MEDIUM

    def test_quota_exceeded_is_llm_error(self):
        cat, sev = _classify_exception(Exception("Quota exceeded for API"))
        assert cat == ErrorCategory.LLM_ERROR
        assert sev == ErrorSeverity.MEDIUM

    def test_key_error_is_logic(self):
        cat, sev = _classify_exception(KeyError("missing_key"))
        assert cat == ErrorCategory.LOGIC
        assert sev == ErrorSeverity.HIGH

    def test_assertion_error_is_logic(self):
        cat, sev = _classify_exception(AssertionError("Invariant violated"))
        assert cat == ErrorCategory.LOGIC
        assert sev == ErrorSeverity.HIGH

    def test_runtime_error_is_logic(self):
        cat, sev = _classify_exception(RuntimeError("Unexpected state"))
        assert cat == ErrorCategory.LOGIC
        assert sev == ErrorSeverity.MEDIUM

    def test_unknown_exception(self):
        cat, sev = _classify_exception(Exception("Something unknown"))
        assert cat == ErrorCategory.UNKNOWN
        assert sev == ErrorSeverity.MEDIUM

    def test_httpx_timeout_by_class_name(self):
        """Test classification by exception class name (for httpx/aiohttp)."""
        class TimeoutException(Exception):
            pass
        cat, sev = _classify_exception(TimeoutException("read timeout"))
        assert cat == ErrorCategory.TRANSIENT

    def test_rate_limit_error_by_class_name(self):
        """Test classification by class name for RateLimitError."""
        class RateLimitError(Exception):
            pass
        cat, sev = _classify_exception(RateLimitError("Too many requests"))
        assert cat == ErrorCategory.LLM_ERROR


class TestStructuredError:
    """Tests for StructuredError model."""

    def test_from_exception_creates_valid_model(self):
        exc = ValueError("Invalid parameter: x must be > 0")
        error = StructuredError.from_exception(exc)

        assert error.category == ErrorCategory.PERMANENT
        assert error.severity == ErrorSeverity.HIGH
        assert error.message == "Invalid parameter: x must be > 0"
        assert error.original_type == "ValueError"
        assert error.retry_hint is not None
        assert error.timestamp is not None

    def test_from_exception_with_context(self):
        exc = TimeoutError("Request timed out")
        ctx = {"task_id": "task-123", "agent_name": "executor"}
        error = StructuredError.from_exception(exc, context=ctx)

        assert error.context == ctx
        assert error.category == ErrorCategory.TRANSIENT

    def test_from_exception_without_context(self):
        exc = RuntimeError("Unexpected")
        error = StructuredError.from_exception(exc)
        assert error.context == {}

    def test_is_retryable_property(self):
        permanent = StructuredError.from_exception(ValueError("bad"))
        transient = StructuredError.from_exception(TimeoutError("timeout"))
        logic = StructuredError.from_exception(AssertionError("fail"))

        assert not permanent.is_retryable
        assert transient.is_retryable
        assert logic.is_retryable

    def test_needs_llm_analysis_property(self):
        transient = StructuredError.from_exception(TimeoutError("timeout"))
        logic = StructuredError.from_exception(AssertionError("fail"))
        unknown = StructuredError.from_exception(Exception("???"))

        assert not transient.needs_llm_analysis
        assert logic.needs_llm_analysis
        assert unknown.needs_llm_analysis

    def test_retry_hint_generation(self):
        """Each category generates appropriate retry hints."""
        errors = {
            ErrorCategory.PERMANENT: StructuredError.from_exception(ValueError("x")),
            ErrorCategory.TRANSIENT: StructuredError.from_exception(TimeoutError("x")),
            ErrorCategory.RESOURCE: StructuredError.from_exception(MemoryError()),
            ErrorCategory.LOGIC: StructuredError.from_exception(AssertionError("x")),
        }
        for cat, err in errors.items():
            assert err.retry_hint is not None, f"No retry hint for {cat}"
            assert len(err.retry_hint) > 10, f"Retry hint too short for {cat}"

    def test_traceback_summary_present_with_traceback(self):
        """When exception has traceback, summary should be populated."""
        try:
            raise ValueError("test error with traceback")
        except ValueError as exc:
            error = StructuredError.from_exception(exc)
            assert error.traceback_summary is not None
            assert "test_structured_error" in error.traceback_summary

    def test_traceback_summary_none_without_traceback(self):
        """When exception has no traceback, summary should be None."""
        exc = ValueError("no traceback")
        error = StructuredError.from_exception(exc)
        assert error.traceback_summary is None

    def test_serialization_roundtrip(self):
        """StructuredError should serialize/deserialize cleanly."""
        exc = ConnectionError("Connection refused")
        error = StructuredError.from_exception(exc, context={"key": "val"})
        data = error.model_dump()
        restored = StructuredError.model_validate(data)
        assert restored.category == error.category
        assert restored.message == error.message
        assert restored.context == error.context
