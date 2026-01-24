"""FastAPI application factory."""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env file from backend directory
load_dotenv(Path(__file__).parent.parent / ".env")

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

    # Optional orchestrator
    try:
        from api.deps import set_engine, clear_engine
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
        if USE_DATABASE:
            try:
                from db.database import init_db
                await init_db()
                print("✅ Database initialized (PostgreSQL)")
            except ImportError:
                print("⚠️  Database module not available")
        else:
            print("📝 Running in memory mode (USE_DATABASE=false)")

        # Initialize projects from projects/ directory
        if PROJECTS_ENABLED:
            backend_dir = Path(__file__).parent.parent
            project_root = backend_dir.parent.parent
            init_projects(str(project_root))

        if ORCHESTRATOR_ENABLED:
            set_engine(OrchestrationEngine())

        yield

        # Shutdown
        if ORCHESTRATOR_ENABLED:
            clear_engine()
        if USE_DATABASE:
            try:
                from db.database import close_db
                await close_db()
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

        return app

    # Create full app instance
    app = create_app()
