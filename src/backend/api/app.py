"""FastAPI application factory."""

import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# Load .env file from backend directory
load_dotenv(Path(__file__).parent.parent / ".env")

# Initialize structured logging (optional - graceful fallback)
try:
    from services.logging_service import get_logger, request_id_var, setup_logging

    setup_logging()
    logger = get_logger("aos.app")
    LOGGING_ENABLED = True
except ImportError:
    logger = None
    LOGGING_ENABLED = False

# Initialize alerting service (optional)
try:
    from services.alerting_service import get_alerting_service

    ALERTING_ENABLED = True
except ImportError:
    ALERTING_ENABLED = False

# Check deployment mode - Railway has limited dependencies
RAILWAY_MODE = os.getenv("RAILWAY", "false").lower() == "true"


def _api_docs_enabled(debug: bool = False) -> bool:
    """Enable API docs only in debug mode or with explicit configuration."""
    env_debug = os.getenv("DEBUG", "false").lower() == "true"
    explicit_enable = os.getenv("ENABLE_API_DOCS", "false").lower() == "true"
    return debug or env_debug or explicit_enable


# ─────────────────────────────────────────────────────────────
# Railway Mode: Minimal app (no LLM dependencies)
# ─────────────────────────────────────────────────────────────
if RAILWAY_MODE:
    railway_debug = os.getenv("DEBUG", "false").lower() == "true"
    railway_docs_enabled = _api_docs_enabled(railway_debug)
    app = FastAPI(
        title="Agent Orchestration Service (Railway)",
        docs_url="/docs" if railway_docs_enabled else None,
        redoc_url="/redoc" if railway_docs_enabled else None,
        openapi_url="/openapi.json" if railway_docs_enabled else None,
    )

    @app.exception_handler(Exception)
    async def railway_exception_handler(request: Request, exc: Exception):
        """Return a generic JSON error without exposing traceback details."""
        import logging

        from fastapi.responses import JSONResponse

        request_id = uuid.uuid4().hex
        logging.getLogger("aos.railway").error(
            "Unhandled exception",
            exc_info=exc,
            extra={"request_id": request_id, "path": request.url.path},
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "railway_mode": True}

    @app.get("/")
    async def root():
        return {
            "service": "Agent Orchestration Service",
            "status": "running",
            "railway_mode": True,
            "docs": "/docs" if railway_docs_enabled else None,
        }

    def create_app(
        title: str = "Agent Orchestration Service",
        debug: bool = False,
    ) -> FastAPI:
        """Return the minimal Railway app for package-level compatibility."""
        return app

# ─────────────────────────────────────────────────────────────
# Full Mode: Complete app with all features
# ─────────────────────────────────────────────────────────────
else:
    from contextlib import asynccontextmanager

    # Optional imports - gracefully handle missing dependencies
    def safe_import(module_path: str, router_name: str = "router"):
        """Safely import a router, returning None if dependencies are missing."""
        try:
            module = __import__(module_path, fromlist=[router_name])
            return getattr(module, router_name)
        except (ImportError, ModuleNotFoundError) as e:
            print(f"⚠️  {module_path} disabled: {e}")
            return None
        except Exception as e:
            print(f"⚠️  {module_path} failed: {e}")
            return None

    # Core router - also use safe_import for Railway compatibility
    router = safe_import("api.routes", "router")

    # Import optional routers with fallback
    websocket_router = safe_import("api.websocket", "websocket_router")
    mcp_router = safe_import("api.mcp", "router")
    usage_router = safe_import("api.usage", "router")
    claude_sessions_router = safe_import("api.claude_sessions", "router")
    agents_router = safe_import("api.agents", "router")
    feedback_router = safe_import("api.feedback", "router")
    auth_router = safe_import("api.auth", "router")
    project_configs_router = safe_import("api.project_configs", "router")
    rag_router = safe_import("api.rag", "router")
    audit_router = safe_import("api.audit", "router")
    notifications_router = safe_import("api.notifications", "router")
    analytics_router = safe_import("api.analytics", "router")
    playground_router = safe_import("api.playground", "router")
    llm_router = safe_import("api.llm_router", "router")
    config_versions_router = safe_import("api.config_versions", "router")
    organizations_router = safe_import("api.organizations", "router")
    rate_limits_router = safe_import("api.rate_limits", "router")
    cost_allocation_router = safe_import("api.cost_allocation", "router")
    health_router = safe_import("api.health", "router")
    git_router = safe_import("api.git", "router")
    llm_models_router = safe_import("api.llm", "router")
    admin_router = safe_import("api.admin", "router")
    project_access_router = safe_import("api.project_access", "router")
    invitation_router = safe_import("api.project_access", "invitation_router")
    public_invitation_router = safe_import("api.project_access", "public_invitation_router")
    workflows_router = safe_import("api.workflows", "router")
    secrets_router = safe_import("api.secrets", "router")
    webhooks_router = safe_import("api.webhooks", "router")
    workflow_webhook_router = safe_import("api.webhooks", "workflow_webhook_router")
    artifacts_router = safe_import("api.artifacts", "router")
    templates_router = safe_import("api.templates", "router")
    projects_router = safe_import("api.projects", "router")
    external_usage_router = safe_import("api.external_usage", "router")
    llm_credentials_router = safe_import("api.llm_credentials", "router")
    llm_proxy_router = safe_import("api.llm_proxy", "router")
    llm_usage_router = safe_import("api.llm_usage", "router")
    llm_access_router = safe_import("api.llm_access", "router")

    # Optional orchestrator
    try:
        from api.deps import clear_engine, set_engine
        from orchestrator import OrchestrationEngine

        ORCHESTRATOR_ENABLED = True
    except ImportError as e:
        print(f"⚠️  Orchestrator disabled: {e}")
        ORCHESTRATOR_ENABLED = False

    # Optional project init
    try:
        from models.project import init_projects

        PROJECTS_ENABLED = True
    except ImportError as e:
        print(f"⚠️  Projects disabled: {e}")
        PROJECTS_ENABLED = False

    # Check if database mode is enabled
    USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Application lifespan manager."""
        # Startup
        if LOGGING_ENABLED and logger:
            logger.info("application_starting", env=os.getenv("ENV", "development"))

        # Fail fast on a missing/default JWT secret outside debug mode: signing
        # JWTs with a publicly-known key allows token forgery. setup.sh generates
        # a strong value; see docs/self-host-quickstart.md.
        _session_secret = os.getenv("SESSION_SECRET_KEY", "")
        if not _session_secret or _session_secret == "aos-secret-key-change-in-production":
            _secret_msg = (
                "SESSION_SECRET_KEY is empty or the insecure default — set a strong "
                "value (run ./setup.sh) before deploying to production."
            )
            if getattr(app.state, "debug_requested", False):
                if logger:
                    logger.warning("insecure_session_secret_key", detail=_secret_msg)
                else:
                    print(f"⚠️  {_secret_msg}")
            else:
                raise RuntimeError(_secret_msg)

        if USE_DATABASE:
            try:
                from db.database import async_session_factory, init_db

                await init_db()
                if logger:
                    logger.info("database_initialized", type="postgresql")
                else:
                    print("✅ Database initialized (PostgreSQL)")

                # Load LLM model configs from DB into registry cache, then sync code→DB
                try:
                    from models.llm_models import LLMModelRegistry

                    async with async_session_factory() as session:
                        await LLMModelRegistry.load_from_db(session)

                    # Sync code-defined models to DB (upsert metadata, preserve admin settings)
                    async with async_session_factory() as session:
                        sync_result = await LLMModelRegistry.sync_to_db(session)
                    if logger:
                        logger.info("llm_model_sync_completed", **sync_result)
                    else:
                        print(f"✅ LLM model sync: {sync_result}")
                except Exception as e:
                    if logger:
                        logger.warning("llm_model_registry_load_failed", error=str(e))
                    else:
                        print(f"⚠️  LLM model registry load failed: {e}")

                # Seed built-in workflows into DB
                try:
                    from services.workflow_service import WorkflowService

                    async with async_session_factory() as session:
                        await WorkflowService.seed_workflows_async(session)
                    if logger:
                        logger.info("workflow_seeds_initialized")
                    else:
                        print("✅ Workflow seeds initialized")
                except Exception as e:
                    if logger:
                        logger.warning("workflow_seed_failed", error=str(e))
                    else:
                        print(f"⚠️  Workflow seed failed: {e}")

            except ImportError:
                if logger:
                    logger.warning("database_module_not_available")
                else:
                    print("⚠️  Database module not available")
        else:
            if logger:
                logger.info("running_in_memory_mode")
            else:
                print("📝 Running in memory mode (USE_DATABASE=false)")

        # Filesystem discovery is only used in memory mode. In database mode
        # the explicit ProjectModel registry is the sole project authority.
        if PROJECTS_ENABLED and not USE_DATABASE:
            backend_dir = Path(__file__).parent.parent
            project_root = backend_dir.parent.parent
            init_projects(str(project_root))

            try:
                from models.git import sync_git_repositories_from_projects

                git_synced = sync_git_repositories_from_projects()
                if logger:
                    logger.info("startup_git_registry_sync_done", count=git_synced)
            except Exception as e:
                if logger:
                    logger.warning("startup_git_registry_sync_failed", error=str(e))

        if ORCHESTRATOR_ENABLED:
            set_engine(OrchestrationEngine())

        # Send startup notification
        if ALERTING_ENABLED:
            try:
                alerting = get_alerting_service()
                await alerting.on_startup()
            except Exception as e:
                if logger:
                    logger.warning("startup_notification_failed", error=str(e))

        # Start upload cleanup background task
        import asyncio

        from services.upload_cleanup_service import schedule_upload_cleanup

        cleanup_task = asyncio.create_task(schedule_upload_cleanup())

        # Start periodic LLM model sync background task
        model_sync_task = None
        if USE_DATABASE:
            sync_interval_hours = int(os.getenv("LLM_MODEL_SYNC_INTERVAL_HOURS", "12"))

            async def _periodic_model_sync() -> None:
                """Periodically sync code-defined models to DB."""
                interval = sync_interval_hours * 3600
                while True:
                    await asyncio.sleep(interval)
                    try:
                        from db.database import async_session_factory
                        from models.llm_models import LLMModelRegistry

                        async with async_session_factory() as session:
                            result = await LLMModelRegistry.sync_to_db(session)
                        if logger:
                            logger.info("periodic_llm_model_sync", **result)
                        else:
                            print(f"🔄 Periodic LLM model sync: {result}")
                    except Exception as e:
                        if logger:
                            logger.warning("periodic_llm_model_sync_failed", error=str(e))
                        else:
                            print(f"⚠️  Periodic LLM model sync failed: {e}")

            model_sync_task = asyncio.create_task(_periodic_model_sync())

        # Start periodic LLM model update check (external provider API check)
        model_update_task = None
        if USE_DATABASE:
            update_interval_hours = int(os.getenv("LLM_UPDATE_CHECK_INTERVAL_HOURS", "24"))

            async def _periodic_model_update_check() -> None:
                """Periodically check provider APIs for new/updated models."""
                interval = update_interval_hours * 3600
                while True:
                    await asyncio.sleep(interval)
                    try:
                        from services.model_update_service import ModelUpdateService

                        results = await ModelUpdateService.check_all_providers(
                            apply_updates=True,
                            is_manual=False,
                            triggered_by="scheduler",
                        )
                        total_new = sum(len(r.new_models) for r in results)
                        total_updates = sum(len(r.updates) for r in results)
                        if logger:
                            logger.info(
                                "periodic_model_update_check",
                                providers_checked=len(results),
                                new_models=total_new,
                                updates=total_updates,
                            )
                        else:
                            print(
                                f"🔄 Model update check: {len(results)} providers, "
                                f"{total_new} new, {total_updates} updates"
                            )
                    except Exception as e:
                        if logger:
                            logger.warning("periodic_model_update_check_failed", error=str(e))
                        else:
                            print(f"⚠️  Model update check failed: {e}")

            model_update_task = asyncio.create_task(_periodic_model_update_check())

        if logger:
            logger.info("application_started")

        yield

        # Cancel background tasks on shutdown
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass

        if model_sync_task is not None:
            model_sync_task.cancel()
            try:
                await model_sync_task
            except asyncio.CancelledError:
                pass

        if model_update_task is not None:
            model_update_task.cancel()
            try:
                await model_update_task
            except asyncio.CancelledError:
                pass

        # Shutdown
        if logger:
            logger.info("application_shutting_down")

        # Send shutdown notification
        if ALERTING_ENABLED:
            try:
                alerting = get_alerting_service()
                await alerting.on_shutdown()
            except Exception:
                pass

        if ORCHESTRATOR_ENABLED:
            clear_engine()
        if USE_DATABASE:
            try:
                from db.database import close_db

                await close_db()
                if logger:
                    logger.info("database_connection_closed")
                else:
                    print("Database connection closed")
            except ImportError:
                pass

    def create_app(
        title: str = "Agent Orchestration Service",
        debug: bool = False,
    ) -> FastAPI:
        """Create and configure the FastAPI application."""
        api_docs_enabled = _api_docs_enabled(debug)
        docs_path = "/docs" if api_docs_enabled else None
        redoc_path = "/redoc" if api_docs_enabled else None
        openapi_path = "/openapi.json" if api_docs_enabled else None
        app = FastAPI(
            title=title,
            description="Multi-agent orchestration system powered by LangGraph",
            version="0.1.0",
            # Keep Starlette traceback responses disabled even when debug is
            # requested for local diagnostics; docs exposure is configured
            # independently above.
            debug=False,
            lifespan=lifespan,
            docs_url=docs_path,
            redoc_url=redoc_path,
            openapi_url=openapi_path,
        )
        app.state.debug_requested = debug

        # Configure CORS - use Settings for robust parsing (JSON array, comma-separated)
        from config import get_settings

        settings = get_settings()
        cors_origins = list(settings.cors_origins)

        # Ensure common dev origins are included
        dev_origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ]
        for origin in dev_origins:
            if origin not in cors_origins:
                cors_origins.append(origin)

        # Add frontend URL from environment (for production)
        frontend_url = os.getenv("FRONTEND_URL")
        if frontend_url and frontend_url not in cors_origins:
            cors_origins.append(frontend_url)

        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Request logging middleware
        if LOGGING_ENABLED:

            class RequestLoggingMiddleware(BaseHTTPMiddleware):
                """Middleware to log all HTTP requests with timing."""

                async def dispatch(self, request: Request, call_next):
                    import time

                    # Generate request ID
                    req_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
                    request_id_var.set(req_id)

                    start_time = time.perf_counter()

                    # Skip logging for health checks to reduce noise
                    is_health_check = request.url.path.startswith("/health")

                    if not is_health_check and logger:
                        logger.info(
                            "request_started",
                            method=request.method,
                            path=request.url.path,
                            client=request.client.host if request.client else "unknown",
                        )

                    response = await call_next(request)

                    duration_ms = (time.perf_counter() - start_time) * 1000

                    if not is_health_check and logger:
                        logger.info(
                            "request_completed",
                            method=request.method,
                            path=request.url.path,
                            status_code=response.status_code,
                            duration_ms=round(duration_ms, 2),
                        )

                    # Add request ID to response headers
                    response.headers["X-Request-ID"] = req_id

                    return response

            app.add_middleware(RequestLoggingMiddleware)

        # NOTE(2026-07): the always-200 /health stub that used to live here was
        # removed after a probe-dependency audit. GET /health now resolves to
        # api/health.py's rich handler (status/version/uptime, 200/503) via the
        # bare router mount below. Probes were migrated off it first:
        # k8s liveness -> /health/live, readiness/Docker HEALTHCHECK -> /health/ready.

        # Root endpoint
        @app.get("/")
        async def root():
            return {
                "service": "Agent Orchestration Service",
                "status": "running",
                "railway_mode": False,
                "docs": "/docs" if api_docs_enabled else None,
            }

        # 세션 쓰기 경합은 장애가 아니다 — 다른 쓰기가 먼저 반영됐을 뿐이고
        # 클라이언트가 다시 시도하면 된다. 아래 전역 핸들러에 맡기면 500 이 나가
        # 재시도 가능한 조건이 서버 오류처럼 보인다 (issue #292).
        from services.session_service import SessionVersionConflictError

        @app.exception_handler(SessionVersionConflictError)
        async def session_conflict_handler(request: Request, exc: SessionVersionConflictError):
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=409,
                content={"detail": "Session was modified concurrently; retry the request"},
            )

        # Global exception handler - always return JSON
        @app.exception_handler(Exception)
        async def global_exception_handler(request: Request, exc: Exception):
            import logging

            from fastapi.responses import JSONResponse

            request_id = uuid.uuid4().hex
            logging.getLogger("aos.app").error(
                "Unhandled exception",
                exc_info=exc,
                extra={"request_id": request_id, "path": request.url.path},
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
            )

        # Include core router (if available)
        if router:
            app.include_router(router, prefix="/api")

        # Include optional routers
        if websocket_router:
            app.include_router(websocket_router)
        if mcp_router:
            app.include_router(mcp_router)
        if usage_router:
            app.include_router(usage_router, prefix="/api")
        if claude_sessions_router:
            app.include_router(claude_sessions_router, prefix="/api")
        if agents_router:
            app.include_router(agents_router, prefix="/api")
        if feedback_router:
            app.include_router(feedback_router, prefix="/api")
        if auth_router:
            app.include_router(auth_router, prefix="/api")
        if project_configs_router:
            app.include_router(project_configs_router, prefix="/api")
        if rag_router:
            app.include_router(rag_router, prefix="/api")
        if audit_router:
            app.include_router(audit_router, prefix="/api")
        if notifications_router:
            app.include_router(notifications_router, prefix="/api")
        if analytics_router:
            app.include_router(analytics_router, prefix="/api")
        if playground_router:
            app.include_router(playground_router, prefix="/api")
        if llm_router:
            app.include_router(llm_router, prefix="/api")
        if config_versions_router:
            app.include_router(config_versions_router, prefix="/api")
        if organizations_router:
            app.include_router(organizations_router, prefix="/api")
        if rate_limits_router:
            app.include_router(rate_limits_router, prefix="/api")
        if cost_allocation_router:
            app.include_router(cost_allocation_router, prefix="/api")
        if health_router:
            # Bare mount serves /health and its sub-routes (/health/live,
            # /health/ready, /health/detailed, ...) for external probes; the
            # /api mount serves the same routes for the dashboard (vite proxy
            # covers /api only). Keep both.
            app.include_router(health_router)
            app.include_router(health_router, prefix="/api")
        if git_router:
            app.include_router(git_router, prefix="/api")
        if llm_models_router:
            app.include_router(llm_models_router, prefix="/api")
        if admin_router:
            app.include_router(admin_router, prefix="/api")
        if project_access_router:
            app.include_router(project_access_router, prefix="/api")
        if invitation_router:
            app.include_router(invitation_router, prefix="/api/v1")
        if public_invitation_router:
            app.include_router(public_invitation_router, prefix="/api/v1")
        if templates_router:
            app.include_router(templates_router, prefix="/api")
        if workflows_router:
            app.include_router(workflows_router, prefix="/api")
        if secrets_router:
            app.include_router(secrets_router, prefix="/api")
        if webhooks_router:
            app.include_router(webhooks_router, prefix="/api")
        if workflow_webhook_router:
            app.include_router(workflow_webhook_router, prefix="/api")
        if artifacts_router:
            app.include_router(artifacts_router, prefix="/api")
        if projects_router:
            app.include_router(projects_router, prefix="/api")
        if external_usage_router:
            app.include_router(external_usage_router, prefix="/api")
        if llm_credentials_router:
            app.include_router(llm_credentials_router, prefix="/api")
        if llm_proxy_router:
            app.include_router(llm_proxy_router, prefix="/api")
        if llm_usage_router:
            app.include_router(llm_usage_router, prefix="/api")
        if llm_access_router:
            app.include_router(llm_access_router, prefix="/api")

        # Add Rate Limiting Middleware
        rate_limit_enabled = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
        if rate_limit_enabled:
            try:
                from middleware.rate_limit import RateLimitMiddleware
                from services.rate_limit_service import get_rate_limit_service

                rate_limit_service = get_rate_limit_service()
                app.add_middleware(
                    RateLimitMiddleware,
                    rate_limit_service=rate_limit_service,
                    default_tier=os.getenv("RATE_LIMIT_DEFAULT_TIER", "free"),
                    enabled=True,
                )
                print("✅ Rate limiting middleware enabled")
            except ImportError as e:
                print(f"⚠️  Rate limiting disabled: {e}")

        return app

    # Create full app instance
    app = create_app()
