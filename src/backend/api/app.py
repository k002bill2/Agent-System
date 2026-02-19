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

# ─────────────────────────────────────────────────────────────
# Railway Mode: Minimal app (no LLM dependencies)
# ─────────────────────────────────────────────────────────────
if RAILWAY_MODE:
    app = FastAPI(title="Agent Orchestration Service (Railway)")

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
            "docs": "/docs",
        }

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

        if USE_DATABASE:
            try:
                from db.database import async_session_factory, init_db

                await init_db()
                if logger:
                    logger.info("database_initialized", type="postgresql")
                else:
                    print("✅ Database initialized (PostgreSQL)")

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

        # Initialize projects from projects/ directory
        if PROJECTS_ENABLED:
            backend_dir = Path(__file__).parent.parent
            project_root = backend_dir.parent.parent
            init_projects(str(project_root))

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

        if logger:
            logger.info("application_started")

        yield

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
        app = FastAPI(
            title=title,
            description="Multi-agent orchestration system powered by LangGraph",
            version="0.1.0",
            debug=debug,
            lifespan=lifespan,
        )

        # Configure CORS
        cors_origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ]

        # Add frontend URL from environment (for production)
        frontend_url = os.getenv("FRONTEND_URL")
        if frontend_url:
            cors_origins.append(frontend_url)

        # Add extra origins from environment
        extra_origins = os.getenv("CORS_ORIGINS", "")
        if extra_origins:
            cors_origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

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

        # Health check endpoint (always available)
        @app.get("/health")
        async def health_check():
            return {"status": "healthy", "railway_mode": False}

        # Root endpoint
        @app.get("/")
        async def root():
            return {
                "service": "Agent Orchestration Service",
                "status": "running",
                "railway_mode": False,
                "docs": "/docs",
            }

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
            app.include_router(health_router)
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
