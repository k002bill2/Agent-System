"""Health check API routes for monitoring and Kubernetes probes."""

from fastapi import APIRouter, Response, Depends
from fastapi.responses import JSONResponse

from services.health_service import (
    get_health_service,
    HealthService,
    HealthStatus,
    SystemHealth,
)


router = APIRouter(tags=["health"])


def get_service() -> HealthService:
    """Get health service dependency."""
    return get_health_service()


# ─────────────────────────────────────────────────────────────
# Health Check Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/health")
async def health_check(
    service: HealthService = Depends(get_service),
):
    """
    Simple health check endpoint.

    Returns 200 if the service is running.
    Used for basic monitoring and load balancer health checks.
    """
    health = await service.check_health(include_details=False)

    status_code = 200 if health.status in (HealthStatus.HEALTHY, HealthStatus.DEGRADED) else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": health.status.value,
            "version": health.version,
            "uptime_seconds": round(health.uptime_seconds, 2),
        },
    )


@router.get("/health/detailed", response_model=SystemHealth)
async def detailed_health_check(
    service: HealthService = Depends(get_service),
):
    """
    Detailed health check with component status.

    Returns:
    - Overall status
    - Individual component health
    - Replication lag (if applicable)
    - Memory usage
    """
    health = await service.check_health(include_details=True)

    status_code = 200 if health.status in (HealthStatus.HEALTHY, HealthStatus.DEGRADED) else 503

    return JSONResponse(
        status_code=status_code,
        content=health.model_dump(mode="json"),
    )


# ─────────────────────────────────────────────────────────────
# Kubernetes Probes
# ─────────────────────────────────────────────────────────────


@router.get("/health/live")
async def liveness_probe(
    service: HealthService = Depends(get_service),
):
    """
    Kubernetes liveness probe.

    Returns 200 if the application is running (not deadlocked).
    Kubernetes will restart the pod if this fails.

    Does NOT check external dependencies - only confirms the
    process is alive and can respond.
    """
    alive = await service.liveness_probe()

    if alive:
        return Response(status_code=200, content="OK")
    else:
        return Response(status_code=503, content="Not OK")


@router.get("/health/ready")
async def readiness_probe(
    service: HealthService = Depends(get_service),
):
    """
    Kubernetes readiness probe.

    Returns 200 if the application can handle requests.
    Kubernetes will stop sending traffic if this fails.

    Checks critical dependencies (database, etc.) to ensure
    the service can actually process requests.
    """
    ready = await service.readiness_probe()

    if ready:
        return Response(status_code=200, content="Ready")
    else:
        return Response(status_code=503, content="Not Ready")


# ─────────────────────────────────────────────────────────────
# Component-Specific Health
# ─────────────────────────────────────────────────────────────


@router.get("/health/database")
async def database_health(
    service: HealthService = Depends(get_service),
):
    """Check database health specifically."""
    health = await service.check_health(include_details=True)
    component = health.components.get("database")

    if not component:
        return JSONResponse(
            status_code=404,
            content={"error": "Database health check not registered"},
        )

    status_code = 200 if component.status == HealthStatus.HEALTHY else 503

    return JSONResponse(
        status_code=status_code,
        content=component.model_dump(mode="json"),
    )


@router.get("/health/redis")
async def redis_health(
    service: HealthService = Depends(get_service),
):
    """Check Redis health specifically."""
    health = await service.check_health(include_details=True)
    component = health.components.get("redis")

    if not component:
        return JSONResponse(
            status_code=404,
            content={"error": "Redis health check not registered"},
        )

    status_code = 200 if component.status in (HealthStatus.HEALTHY, HealthStatus.DEGRADED) else 503

    return JSONResponse(
        status_code=status_code,
        content=component.model_dump(mode="json"),
    )


@router.get("/health/llm")
async def llm_health(
    service: HealthService = Depends(get_service),
):
    """Check LLM provider health specifically."""
    health = await service.check_health(include_details=True)
    component = health.components.get("llm")

    if not component:
        return JSONResponse(
            status_code=404,
            content={"error": "LLM health check not registered"},
        )

    status_code = 200 if component.status in (HealthStatus.HEALTHY, HealthStatus.DEGRADED) else 503

    return JSONResponse(
        status_code=status_code,
        content=component.model_dump(mode="json"),
    )
