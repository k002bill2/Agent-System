"""Health check API routes for monitoring and Kubernetes probes."""

import os
import platform
import re
import socket
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.health_service import (
    HealthService,
    HealthStatus,
    SystemHealth,
    get_health_service,
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


# ─────────────────────────────────────────────────────────────
# Infrastructure Service Status
# ─────────────────────────────────────────────────────────────

# AOS service definitions: (name, env_var_for_port, default_port, url_prefix)
_AOS_SERVICES: list[tuple[str, str, int, str | None]] = [
    ("PostgreSQL", "PG_PORT", 5432, None),
    ("Redis", "REDIS_PORT", 6379, None),
    ("Qdrant", "QDRANT_PORT", 6333, "http"),
    ("Backend API", "BACKEND_PORT", 8000, "http"),
    ("Dashboard", "DASHBOARD_PORT", 5173, "http"),
]


class ServiceStatus(BaseModel):
    name: str
    port: int
    url: str
    status: str  # "running" | "stopped" | "conflict"
    pid: int | None = None
    process_name: str | None = None


class InfraStatusResponse(BaseModel):
    services: list[ServiceStatus]
    has_conflicts: bool
    timestamp: str


def _check_port(port: int) -> bool:
    """Check if a port is in use using socket.connect_ex (portable)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _get_process_on_port(port: int) -> tuple[int | None, str | None]:
    """Try to get PID and process name using lsof (macOS/Linux). Graceful fallback."""
    if platform.system() not in ("Darwin", "Linux"):
        return None, None
    try:
        result = subprocess.run(
            ["lsof", "-i", f":{port}", "-t", "-sTCP:LISTEN"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None, None
        pid = int(result.stdout.strip().split("\n")[0])
        # Get process name
        ps_result = subprocess.run(
            ["ps", "-p", str(pid), "-o", "comm="],
            capture_output=True,
            text=True,
            timeout=3,
        )
        proc_name = ps_result.stdout.strip() if ps_result.returncode == 0 else None
        return pid, proc_name
    except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
        return None, None


def _build_url(port: int, prefix: str | None) -> str:
    """Build display URL for a service."""
    if prefix:
        return f"{prefix}://localhost:{port}"
    return f"localhost:{port}"


# Well-known images → (display_name, url_prefix)
_IMAGE_HINTS: dict[str, tuple[str, str | None]] = {
    "postgres": ("PostgreSQL", None),
    "redis": ("Redis", None),
    "qdrant": ("Qdrant", "http"),
    "mysql": ("MySQL", None),
    "mongo": ("MongoDB", None),
    "rabbitmq": ("RabbitMQ", "http"),
    "elasticsearch": ("Elasticsearch", "http"),
    "nginx": ("Nginx", "http"),
    "node": ("Node.js", "http"),
    "python": ("Python", "http"),
}

# Regex to extract host port from docker-compose ports like "8080:80", "${VAR:-8080}:80"
_PORT_RE = re.compile(
    r"""
    (?:\$\{[^:}]+-)?    # optional ${VAR:-  prefix
    (\d+)               # host port
    (?:\})?             # optional } closing
    :(\d+)              # container port
    """,
    re.VERBOSE,
)


def _parse_compose_services(project_path: str) -> list[tuple[str, int, str | None]] | None:
    """Parse docker-compose files to extract service name and host port.

    Returns list of (service_display_name, host_port, url_prefix) or None if no compose found.
    Uses simple regex parsing to avoid PyYAML dependency.
    """
    path = Path(project_path)
    compose_files = [
        path / "docker-compose.yml",
        path / "docker-compose.yaml",
        path / "compose.yml",
        path / "compose.yaml",
        path / "docker-compose.dev.yml",
        path / "infra" / "docker" / "docker-compose.yml",
    ]

    compose_file = None
    for f in compose_files:
        if f.is_file():
            compose_file = f
            break

    if not compose_file:
        return None

    try:
        content = compose_file.read_text(encoding="utf-8")
    except OSError:
        return None

    results: list[tuple[str, int, str | None]] = []
    current_service: str | None = None
    current_image: str | None = None
    in_services = False
    in_ports = False

    for line in content.splitlines():
        stripped = line.strip()

        # Detect services: top-level key
        if stripped == "services:" and not line.startswith(" "):
            in_services = True
            continue

        # Detect other top-level keys (exit services block)
        if in_services and not line.startswith(" ") and stripped and not stripped.startswith("#"):
            in_services = False
            continue

        if not in_services:
            continue

        # Detect service name (2-space indented, ends with :)
        if (
            line.startswith("  ")
            and not line.startswith("    ")
            and stripped.endswith(":")
            and not stripped.startswith("#")
        ):
            # Save previous service if it had ports
            current_service = stripped[:-1].strip()
            current_image = None
            in_ports = False
            continue

        if not current_service:
            continue

        # Detect image
        if stripped.startswith("image:"):
            current_image = stripped.split(":", 1)[1].strip()

        # Detect ports section
        if stripped == "ports:":
            in_ports = True
            continue

        # Parse port mapping
        if in_ports and stripped.startswith("- "):
            port_str = stripped[2:].strip().strip('"').strip("'")
            match = _PORT_RE.search(port_str)
            if match:
                host_port = int(match.group(1))
                # Determine display name and prefix from image
                display_name = current_service.replace("-", " ").replace("_", " ").title()
                url_prefix: str | None = "http"

                if current_image:
                    for img_key, (hint_name, hint_prefix) in _IMAGE_HINTS.items():
                        if img_key in current_image.lower():
                            display_name = hint_name
                            url_prefix = hint_prefix
                            break

                results.append((display_name, host_port, url_prefix))
            continue

        # Exit ports section on non-list item
        if in_ports and not stripped.startswith("- ") and stripped and not stripped.startswith("#"):
            in_ports = False

    return results if results else None


def _check_services(
    service_defs: list[tuple[str, int, str | None]],
) -> list[ServiceStatus]:
    """Check port status for a list of service definitions."""
    services: list[ServiceStatus] = []
    for name, port, url_prefix in service_defs:
        is_up = _check_port(port)
        pid, proc_name = (None, None)
        if is_up:
            pid, proc_name = _get_process_on_port(port)
        status = "running" if is_up else "stopped"
        services.append(
            ServiceStatus(
                name=name,
                port=port,
                url=_build_url(port, url_prefix),
                status=status,
                pid=pid,
                process_name=proc_name,
            )
        )
    return services


class PortConflict(BaseModel):
    port: int
    projects: list[dict[str, str]]  # [{"project": "name", "service": "svc"}]


class PortConflictsResponse(BaseModel):
    conflicts: list[PortConflict]
    total_projects_scanned: int
    timestamp: str


@router.get("/health/services", response_model=InfraStatusResponse)
async def infra_services_status(
    project_path: str | None = Query(None, description="Project path to scan for docker-compose"),
):
    """
    Check infrastructure service port status.

    If project_path is provided, scans for docker-compose files in that path
    and returns project-specific services. Otherwise returns default AOS services.
    """
    if project_path:
        parsed = _parse_compose_services(project_path)
        if parsed:
            services = _check_services(parsed)
            return InfraStatusResponse(
                services=services,
                has_conflicts=any(s.status == "conflict" for s in services),
                timestamp=datetime.now(UTC).isoformat(),
            )

    # Fallback: default AOS services
    default_defs = [
        (name, int(os.environ.get(env_var, str(default_port))), url_prefix)
        for name, env_var, default_port, url_prefix in _AOS_SERVICES
    ]
    services = _check_services(default_defs)

    return InfraStatusResponse(
        services=services,
        has_conflicts=any(s.status == "conflict" for s in services),
        timestamp=datetime.now(UTC).isoformat(),
    )


@router.get("/health/services/conflicts", response_model=PortConflictsResponse)
async def port_conflicts():
    """
    Scan all registered projects for cross-project port conflicts.

    Reads docker-compose files from all active projects in the DB
    and identifies ports claimed by multiple projects.
    """
    # Fetch active project paths from DB
    project_paths: list[tuple[str, str]] = []  # (name, path)
    try:
        use_db = os.environ.get("USE_DATABASE", "false").lower() == "true"
        if use_db:
            from sqlalchemy import select as sa_select

            from db.database import async_session_factory
            from db.models import ProjectModel

            async with async_session_factory() as session:
                result = await session.execute(
                    sa_select(ProjectModel.name, ProjectModel.path).where(
                        ProjectModel.is_active.is_(True),
                        ProjectModel.path.isnot(None),
                    )
                )
                project_paths = [(row[0], row[1]) for row in result.all()]
    except Exception:
        # DB not available — return empty
        pass

    # Build port → [(project, service)] map
    port_map: dict[int, list[dict[str, str]]] = {}
    for proj_name, proj_path in project_paths:
        parsed = _parse_compose_services(proj_path)
        if not parsed:
            continue
        for svc_name, port, _prefix in parsed:
            port_map.setdefault(port, []).append({"project": proj_name, "service": svc_name})

    # Filter to conflicts only (2+ projects on same port)
    conflicts = [
        PortConflict(port=port, projects=users)
        for port, users in sorted(port_map.items())
        if len(users) > 1
    ]

    return PortConflictsResponse(
        conflicts=conflicts,
        total_projects_scanned=len(project_paths),
        timestamp=datetime.now(UTC).isoformat(),
    )
