"""FastAPI application factory."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

# Load .env file from backend directory
load_dotenv(Path(__file__).parent.parent / ".env")
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from api.websocket import websocket_router
from api.deps import set_engine, clear_engine
from orchestrator import OrchestrationEngine
from models.project import init_projects

# Optional RAG router - gracefully handle missing chromadb dependencies
try:
    from api.rag import router as rag_router
    RAG_ENABLED = True
except ImportError:
    RAG_ENABLED = False
    rag_router = None

# MCP router for Warp terminal integration
from api.mcp import router as mcp_router

# Usage router for Claude Code stats
from api.usage import router as usage_router

# Claude sessions router for external session monitoring
from api.claude_sessions import router as claude_sessions_router

# Agent registry, orchestrator, and MCP manager router
from api.agents import router as agents_router

# RLHF feedback router
from api.feedback import router as feedback_router

# OAuth authentication router
from api.auth import router as auth_router

# Project configuration monitoring router
from api.project_configs import router as project_configs_router

# Check if database mode is enabled
USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    # Initialize database tables only if database mode is enabled
    if USE_DATABASE:
        from db.database import init_db, close_db
        await init_db()
        print("✅ Database initialized (PostgreSQL)")
    else:
        print("📝 Running in memory mode (USE_DATABASE=false)")

    # Initialize projects from projects/ directory
    backend_dir = Path(__file__).parent.parent
    project_root = backend_dir.parent.parent
    init_projects(str(project_root))

    set_engine(OrchestrationEngine())
    yield

    # Shutdown
    clear_engine()
    if USE_DATABASE:
        from db.database import close_db
        await close_db()
        print("Database connection closed")


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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(router, prefix="/api")
    if RAG_ENABLED and rag_router:
        app.include_router(rag_router, prefix="/api")
    app.include_router(websocket_router)

    # MCP router (no prefix - direct /mcp path)
    app.include_router(mcp_router)

    # Usage router for Claude Code stats
    app.include_router(usage_router, prefix="/api")

    # Claude sessions router for external session monitoring
    app.include_router(claude_sessions_router, prefix="/api")

    # Agent registry, orchestrator, and MCP manager router
    app.include_router(agents_router, prefix="/api")

    # RLHF feedback router
    app.include_router(feedback_router, prefix="/api")

    # OAuth authentication router
    app.include_router(auth_router, prefix="/api")

    # Project configuration monitoring router
    app.include_router(project_configs_router, prefix="/api")

    return app


# Default app instance
app = create_app()
