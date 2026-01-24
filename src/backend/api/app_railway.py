"""Minimal FastAPI app for Railway deployment (no LLM dependencies)."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os

app = FastAPI(
    title="Agent Orchestration Service",
    description="Railway deployment - minimal mode",
    version="0.1.0",
)

# Get frontend URL from environment
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        FRONTEND_URL,
        "https://agent-orchestrator-lac.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────
# Health & Root
# ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy", "mode": "railway"}


@app.get("/")
async def root():
    return {
        "service": "Agent Orchestration Service",
        "status": "running",
        "mode": "railway",
        "docs": "/docs",
    }


@app.get("/api/health")
async def api_health():
    return {"status": "healthy", "mode": "railway"}


# ─────────────────────────────────────────────────────────────
# Sessions API (stub)
# ─────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    project_id: str | None = None


@app.post("/api/sessions")
async def create_session(request: SessionCreate = None):
    return {
        "session_id": "railway-stub-session",
        "project_id": request.project_id if request else None,
        "message": "Railway mode - limited functionality",
    }


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    return {
        "session_id": session_id,
        "tasks": {},
        "agents": {},
        "current_task_id": None,
        "iteration_count": 0,
    }


# ─────────────────────────────────────────────────────────────
# Projects API (stub)
# ─────────────────────────────────────────────────────────────

@app.get("/api/projects")
async def get_projects():
    return []


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    raise HTTPException(status_code=404, detail="Projects not available in Railway mode")


# ─────────────────────────────────────────────────────────────
# Claude Sessions API (stub)
# ─────────────────────────────────────────────────────────────

@app.get("/api/claude-sessions")
async def get_claude_sessions():
    return []


# ─────────────────────────────────────────────────────────────
# Agents API (stub)
# ─────────────────────────────────────────────────────────────

@app.get("/api/agents")
async def get_agents():
    return []


@app.get("/api/agents/stats")
async def get_agent_stats():
    return {
        "total_agents": 0,
        "by_category": {},
        "by_status": {},
    }


# ─────────────────────────────────────────────────────────────
# Auth API (stub)
# ─────────────────────────────────────────────────────────────

@app.get("/api/auth/me")
async def get_current_user():
    return {
        "id": "railway-user",
        "email": "user@railway.app",
        "name": "Railway User",
        "provider": "railway",
    }


@app.post("/api/auth/logout")
async def logout():
    return {"message": "Logged out"}


@app.get("/api/auth/google")
async def google_auth():
    """Google OAuth - not available in Railway mode."""
    raise HTTPException(status_code=503, detail="OAuth not available in Railway minimal mode")


@app.post("/api/auth/google/callback")
async def google_callback():
    """Google OAuth callback - stub."""
    return {
        "access_token": "railway-stub-token",
        "token_type": "bearer",
        "user": {
            "id": "railway-user",
            "email": "user@railway.app",
            "name": "Railway User",
        }
    }


@app.get("/api/auth/github")
async def github_auth():
    """GitHub OAuth - not available in Railway mode."""
    raise HTTPException(status_code=503, detail="OAuth not available in Railway minimal mode")


@app.post("/api/auth/github/callback")
async def github_callback():
    """GitHub OAuth callback - stub."""
    return {
        "access_token": "railway-stub-token",
        "token_type": "bearer",
        "user": {
            "id": "railway-user",
            "email": "user@railway.app",
            "name": "Railway User",
        }
    }
