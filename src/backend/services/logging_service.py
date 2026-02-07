"""Structured logging service using structlog.

Provides JSON-formatted logs suitable for production environments
with request tracking, performance metrics, and correlation IDs.
"""

import logging
import os
import sys
import time
import uuid
from collections.abc import Callable
from contextvars import ContextVar
from functools import wraps
from typing import Any

import structlog
from structlog.processors import JSONRenderer, TimeStamper, add_log_level
from structlog.stdlib import BoundLogger, ProcessorFormatter, filter_by_level

# Context variable for request tracking
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")


def get_log_level() -> int:
    """Get log level from environment."""
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    return getattr(logging, level, logging.INFO)


def add_request_context(
    logger: logging.Logger,
    method_name: str,
    event_dict: dict[str, Any],
) -> dict[str, Any]:
    """Add request context to log entries."""
    request_id = request_id_var.get()
    user_id = user_id_var.get()

    if request_id:
        event_dict["request_id"] = request_id
    if user_id:
        event_dict["user_id"] = user_id

    return event_dict


def setup_logging() -> None:
    """Configure structlog for production use."""
    is_production = os.getenv("ENV", "development") == "production"
    log_level = get_log_level()

    # Shared processors
    shared_processors: list[Any] = [
        filter_by_level,
        add_log_level,
        add_request_context,
        TimeStamper(fmt="iso"),
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if is_production:
        # JSON output for production
        shared_processors.append(JSONRenderer())
    else:
        # Human-readable output for development
        shared_processors.append(
            structlog.dev.ConsoleRenderer(colors=True),
        )

    # Configure structlog
    structlog.configure(
        processors=shared_processors,
        wrapper_class=BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure standard logging
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        ProcessorFormatter(
            processor=JSONRenderer() if is_production else structlog.dev.ConsoleRenderer(),
        ),
    )

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> BoundLogger:
    """Get a configured logger instance."""
    return structlog.get_logger(name)


class RequestLogger:
    """Context manager for request logging with timing."""

    def __init__(
        self,
        logger: BoundLogger,
        method: str,
        path: str,
        request_id: str | None = None,
    ) -> None:
        self.logger = logger
        self.method = method
        self.path = path
        self.request_id = request_id or str(uuid.uuid4())[:8]
        self.start_time: float = 0

    def __enter__(self) -> "RequestLogger":
        request_id_var.set(self.request_id)
        self.start_time = time.perf_counter()
        self.logger.info(
            "request_started",
            method=self.method,
            path=self.path,
        )
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: Any,
    ) -> None:
        duration_ms = (time.perf_counter() - self.start_time) * 1000

        if exc_type:
            self.logger.error(
                "request_failed",
                method=self.method,
                path=self.path,
                duration_ms=round(duration_ms, 2),
                error=str(exc_val),
                error_type=exc_type.__name__,
            )
        else:
            self.logger.info(
                "request_completed",
                method=self.method,
                path=self.path,
                duration_ms=round(duration_ms, 2),
            )

        request_id_var.set("")


def log_execution_time(logger: BoundLogger | None = None) -> Callable:
    """Decorator to log function execution time."""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            _logger = logger or get_logger(func.__module__)
            start = time.perf_counter()

            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start) * 1000
                _logger.debug(
                    "function_executed",
                    function=func.__name__,
                    duration_ms=round(duration_ms, 2),
                )
                return result
            except Exception as e:
                duration_ms = (time.perf_counter() - start) * 1000
                _logger.error(
                    "function_failed",
                    function=func.__name__,
                    duration_ms=round(duration_ms, 2),
                    error=str(e),
                )
                raise

        @wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            _logger = logger or get_logger(func.__module__)
            start = time.perf_counter()

            try:
                result = func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start) * 1000
                _logger.debug(
                    "function_executed",
                    function=func.__name__,
                    duration_ms=round(duration_ms, 2),
                )
                return result
            except Exception as e:
                duration_ms = (time.perf_counter() - start) * 1000
                _logger.error(
                    "function_failed",
                    function=func.__name__,
                    duration_ms=round(duration_ms, 2),
                    error=str(e),
                )
                raise

        import asyncio

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# Singleton logger instance
_logger: BoundLogger | None = None


def get_app_logger() -> BoundLogger:
    """Get the application-wide logger (singleton)."""
    global _logger
    if _logger is None:
        setup_logging()
        _logger = get_logger("aos")
    return _logger
