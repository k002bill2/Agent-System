"""Health check service for monitoring system status."""

import asyncio
import os
import time
from datetime import datetime

from utils.time import utcnow
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class HealthStatus(str, Enum):
    """Health check status levels."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class ComponentHealth(BaseModel):
    """Health status of a single component."""

    name: str
    status: HealthStatus
    latency_ms: float | None = None
    message: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    last_check: datetime = Field(default_factory=utcnow)


class SystemHealth(BaseModel):
    """Overall system health status."""

    status: HealthStatus
    version: str = "0.1.0"
    uptime_seconds: float = 0
    timestamp: datetime = Field(default_factory=utcnow)

    # Component statuses
    components: dict[str, ComponentHealth] = Field(default_factory=dict)

    # Summary
    healthy_components: int = 0
    total_components: int = 0


class HealthService:
    """
    Service for performing health checks.

    Checks:
    - Database connectivity and replication status
    - Redis connectivity
    - LLM provider availability
    - External service dependencies
    """

    def __init__(self):
        self._start_time = time.time()
        self._checks: dict[str, callable] = {}

        # Register default checks
        self.register_check("database", self._check_database)
        self.register_check("redis", self._check_redis)
        self.register_check("llm", self._check_llm)

    def register_check(self, name: str, check_func: callable) -> None:
        """Register a health check function."""
        self._checks[name] = check_func

    def unregister_check(self, name: str) -> None:
        """Unregister a health check function."""
        self._checks.pop(name, None)

    # ─────────────────────────────────────────────────────────────
    # Health Check Methods
    # ─────────────────────────────────────────────────────────────

    async def check_health(self, include_details: bool = False) -> SystemHealth:
        """
        Perform full system health check.

        Args:
            include_details: Include detailed component info

        Returns:
            SystemHealth with overall and component status
        """
        components: dict[str, ComponentHealth] = {}
        healthy_count = 0

        # Run all checks concurrently
        check_tasks = {
            name: asyncio.create_task(self._run_check(name, check_func))
            for name, check_func in self._checks.items()
        }

        for name, task in check_tasks.items():
            try:
                result = await asyncio.wait_for(task, timeout=5.0)
                components[name] = result
                if result.status == HealthStatus.HEALTHY:
                    healthy_count += 1
            except TimeoutError:
                components[name] = ComponentHealth(
                    name=name,
                    status=HealthStatus.UNHEALTHY,
                    message="Health check timed out",
                )
            except Exception as e:
                components[name] = ComponentHealth(
                    name=name,
                    status=HealthStatus.UNHEALTHY,
                    message=str(e),
                )

        # Determine overall status
        total = len(components)
        if healthy_count == total:
            overall_status = HealthStatus.HEALTHY
        elif healthy_count >= total / 2:
            overall_status = HealthStatus.DEGRADED
        else:
            overall_status = HealthStatus.UNHEALTHY

        return SystemHealth(
            status=overall_status,
            uptime_seconds=time.time() - self._start_time,
            components=components if include_details else {},
            healthy_components=healthy_count,
            total_components=total,
        )

    async def _run_check(self, name: str, check_func: callable) -> ComponentHealth:
        """Run a single health check with timing."""
        start = time.time()
        try:
            result = await check_func()
            latency = (time.time() - start) * 1000

            if isinstance(result, ComponentHealth):
                result.latency_ms = latency
                return result

            # Simple boolean result
            return ComponentHealth(
                name=name,
                status=HealthStatus.HEALTHY if result else HealthStatus.UNHEALTHY,
                latency_ms=latency,
            )
        except Exception as e:
            return ComponentHealth(
                name=name,
                status=HealthStatus.UNHEALTHY,
                latency_ms=(time.time() - start) * 1000,
                message=str(e),
            )

    # ─────────────────────────────────────────────────────────────
    # Default Health Checks
    # ─────────────────────────────────────────────────────────────

    async def _check_database(self) -> ComponentHealth:
        """Check database connectivity and replication status."""
        use_db = os.getenv("USE_DATABASE", "false").lower() == "true"

        if not use_db:
            return ComponentHealth(
                name="database",
                status=HealthStatus.HEALTHY,
                message="Running in memory mode",
                details={"mode": "memory"},
            )

        try:
            from sqlalchemy import text

            from db.database import async_session_factory

            async with async_session_factory() as session:
                # Test connectivity
                result = await session.execute(text("SELECT 1"))
                result.scalar()

                # Check replication status (PostgreSQL)
                try:
                    rep_result = await session.execute(text("SELECT pg_is_in_recovery()"))
                    is_replica = rep_result.scalar()

                    if is_replica:
                        # Check replication lag
                        lag_result = await session.execute(
                            text("""
                                SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
                            """)
                        )
                        lag_seconds = lag_result.scalar() or 0

                        status = HealthStatus.HEALTHY if lag_seconds < 10 else HealthStatus.DEGRADED
                        return ComponentHealth(
                            name="database",
                            status=status,
                            message="Replica node",
                            details={
                                "role": "replica",
                                "replication_lag_seconds": lag_seconds,
                            },
                        )
                    else:
                        return ComponentHealth(
                            name="database",
                            status=HealthStatus.HEALTHY,
                            message="Primary node",
                            details={"role": "primary"},
                        )
                except Exception:
                    # Not PostgreSQL or no replication
                    return ComponentHealth(
                        name="database",
                        status=HealthStatus.HEALTHY,
                        message="Connected",
                    )

        except ImportError:
            return ComponentHealth(
                name="database",
                status=HealthStatus.HEALTHY,
                message="Database module not available",
            )
        except Exception as e:
            return ComponentHealth(
                name="database",
                status=HealthStatus.UNHEALTHY,
                message=f"Connection failed: {str(e)}",
            )

    async def _check_redis(self) -> ComponentHealth:
        """Check Redis connectivity and Sentinel status."""
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

        try:
            import redis.asyncio as aioredis

            client = aioredis.from_url(redis_url)
            await client.ping()

            # Check if Sentinel is configured
            sentinel_url = os.getenv("REDIS_SENTINEL_URL")
            if sentinel_url:
                # Would check Sentinel master/slave status here
                return ComponentHealth(
                    name="redis",
                    status=HealthStatus.HEALTHY,
                    message="Connected via Sentinel",
                    details={"mode": "sentinel"},
                )

            # Get memory info
            info = await client.info("memory")
            used_memory = info.get("used_memory_human", "unknown")

            await client.close()

            return ComponentHealth(
                name="redis",
                status=HealthStatus.HEALTHY,
                message="Connected",
                details={
                    "mode": "standalone",
                    "used_memory": used_memory,
                },
            )

        except ImportError:
            return ComponentHealth(
                name="redis",
                status=HealthStatus.HEALTHY,
                message="Redis module not available (using memory)",
            )
        except Exception as e:
            return ComponentHealth(
                name="redis",
                status=HealthStatus.DEGRADED,
                message=f"Connection failed: {str(e)} (using memory fallback)",
            )

    async def _check_llm(self) -> ComponentHealth:
        """Check LLM provider availability."""
        from config import get_settings

        settings = get_settings()
        provider = settings.llm_provider

        details = {"provider": provider}

        if provider == "google":
            if settings.google_api_key:
                return ComponentHealth(
                    name="llm",
                    status=HealthStatus.HEALTHY,
                    message="Google API key configured",
                    details=details,
                )
            else:
                return ComponentHealth(
                    name="llm",
                    status=HealthStatus.DEGRADED,
                    message="Google API key not configured",
                    details=details,
                )

        elif provider == "anthropic":
            if settings.anthropic_api_key:
                return ComponentHealth(
                    name="llm",
                    status=HealthStatus.HEALTHY,
                    message="Anthropic API key configured",
                    details=details,
                )
            else:
                return ComponentHealth(
                    name="llm",
                    status=HealthStatus.DEGRADED,
                    message="Anthropic API key not configured",
                    details=details,
                )

        elif provider == "ollama":
            # Try to ping Ollama
            try:
                import httpx

                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"{settings.ollama_base_url}/api/tags",
                        timeout=2.0,
                    )
                    if response.status_code == 200:
                        models = response.json().get("models", [])
                        return ComponentHealth(
                            name="llm",
                            status=HealthStatus.HEALTHY,
                            message="Ollama connected",
                            details={**details, "available_models": len(models)},
                        )
            except Exception as e:
                return ComponentHealth(
                    name="llm",
                    status=HealthStatus.UNHEALTHY,
                    message=f"Ollama not reachable: {str(e)}",
                    details=details,
                )

        return ComponentHealth(
            name="llm",
            status=HealthStatus.DEGRADED,
            message=f"Unknown provider: {provider}",
            details=details,
        )

    # ─────────────────────────────────────────────────────────────
    # Kubernetes Probes
    # ─────────────────────────────────────────────────────────────

    async def liveness_probe(self) -> bool:
        """
        Kubernetes liveness probe.

        Returns True if the application is running (not deadlocked).
        Does NOT check external dependencies.
        """
        return True

    async def readiness_probe(self) -> bool:
        """
        Kubernetes readiness probe.

        Returns True if the application can handle requests.
        Checks critical dependencies.
        """
        health = await self.check_health()
        return health.status in (HealthStatus.HEALTHY, HealthStatus.DEGRADED)


# Global singleton
_health_service: HealthService | None = None


def get_health_service() -> HealthService:
    """Get or create the health service singleton."""
    global _health_service
    if _health_service is None:
        _health_service = HealthService()
    return _health_service
