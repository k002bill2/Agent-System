"""Railway FastAPI app with OAuth support (no LLM/DB dependencies)."""

import hashlib
import os
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://agent-orchestrator-lac.vercel.app")
SECRET_KEY = os.getenv("SESSION_SECRET_KEY", secrets.token_hex(32))

# Google OAuth
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

# GitHub OAuth
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")

# JWT Settings
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# In-memory user store (Railway mode - no DB)
users_store: dict[str, dict] = {}

# ─────────────────────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Agent Orchestration Service",
    description="Railway deployment with OAuth",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────
# Password Hashing (using hashlib since bcrypt may not be available)
# ─────────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt."""
    salt = secrets.token_hex(16)
    password_hash = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{password_hash}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash."""
    try:
        salt, password_hash = hashed.split(":")
        return hashlib.sha256((password + salt).encode()).hexdigest() == password_hash
    except ValueError:
        return False


# ─────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────


def create_access_token(user_id: str, email: str) -> str:
    """Create JWT access token."""
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Verify JWT token and return payload."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_current_user_from_token(request: Request) -> dict | None:
    """Extract user from Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ")[1]
    payload = verify_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    return users_store.get(user_id)


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
        "oauth_enabled": bool(GOOGLE_CLIENT_ID or GITHUB_CLIENT_ID),
        "docs": "/docs",
    }


@app.get("/api/health")
async def api_health():
    return {"status": "healthy", "mode": "railway"}


# ─────────────────────────────────────────────────────────────
# Auth Status
# ─────────────────────────────────────────────────────────────


@app.get("/api/auth/status")
async def get_auth_status():
    """Check auth configuration status."""
    google_enabled = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
    github_enabled = bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)
    return {
        "oauth_enabled": google_enabled or github_enabled,
        "google_enabled": google_enabled,
        "github_enabled": github_enabled,
        "email_enabled": True,
    }


# ─────────────────────────────────────────────────────────────
# Google OAuth
# ─────────────────────────────────────────────────────────────


@app.get("/api/auth/google")
async def google_auth():
    """Redirect to Google OAuth."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")

    redirect_uri = f"{FRONTEND_URL}/auth/callback/google"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


class OAuthCallbackRequest(BaseModel):
    code: str
    redirect_uri: str | None = None


@app.post("/api/auth/google/callback")
async def google_callback(request: OAuthCallbackRequest):
    """Handle Google OAuth callback."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")

    redirect_uri = request.redirect_uri or f"{FRONTEND_URL}/auth/callback/google"

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": request.code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )

        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange code for token")

        tokens = token_response.json()
        access_token = tokens.get("access_token")

        # Get user info
        user_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        if user_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")

        user_info = user_response.json()

    # Create/update user in memory store
    user_id = f"google_{user_info['id']}"
    user = {
        "id": user_id,
        "email": user_info.get("email", ""),
        "name": user_info.get("name", ""),
        "avatar_url": user_info.get("picture", ""),
        "oauth_provider": "google",
        "is_admin": False,
    }
    users_store[user_id] = user

    # Create JWT token
    jwt_token = create_access_token(user_id, user["email"])

    return {
        "access_token": jwt_token,
        "refresh_token": jwt_token,  # Same token for simplicity
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": user,
    }


# ─────────────────────────────────────────────────────────────
# GitHub OAuth
# ─────────────────────────────────────────────────────────────


@app.get("/api/auth/github")
async def github_auth():
    """Redirect to GitHub OAuth."""
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=503, detail="GitHub OAuth not configured")

    redirect_uri = f"{FRONTEND_URL}/auth/callback/github"
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": "user:email",
    }
    auth_url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


@app.post("/api/auth/github/callback")
async def github_callback(request: OAuthCallbackRequest):
    """Handle GitHub OAuth callback."""
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="GitHub OAuth not configured")

    redirect_uri = request.redirect_uri or f"{FRONTEND_URL}/auth/callback/github"

    async with httpx.AsyncClient() as client:
        # Exchange code for token
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": request.code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )

        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange code for token")

        tokens = token_response.json()
        access_token = tokens.get("access_token")

        if not access_token:
            raise HTTPException(
                status_code=400,
                detail=f"OAuth error: {tokens.get('error_description', 'Unknown error')}",
            )

        # Get user info
        user_response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
        )

        if user_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")

        user_info = user_response.json()

        # Get email if not public
        email = user_info.get("email")
        if not email:
            email_response = await client.get(
                "https://api.github.com/user/emails",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            if email_response.status_code == 200:
                emails = email_response.json()
                primary_email = next((e for e in emails if e.get("primary")), None)
                email = (
                    primary_email["email"]
                    if primary_email
                    else emails[0]["email"]
                    if emails
                    else ""
                )

    # Create/update user
    user_id = f"github_{user_info['id']}"
    user = {
        "id": user_id,
        "email": email or "",
        "name": user_info.get("name") or user_info.get("login", ""),
        "avatar_url": user_info.get("avatar_url", ""),
        "oauth_provider": "github",
        "is_admin": False,
    }
    users_store[user_id] = user

    # Create JWT token
    jwt_token = create_access_token(user_id, user["email"])

    return {
        "access_token": jwt_token,
        "refresh_token": jwt_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": user,
    }


# ─────────────────────────────────────────────────────────────
# Auth Endpoints
# ─────────────────────────────────────────────────────────────


@app.get("/api/auth/me")
async def get_current_user(request: Request):
    """Get current user from token."""
    user = get_current_user_from_token(request)
    if user:
        return user

    # Return stub user if no auth (for demo)
    return {
        "id": "guest",
        "email": "guest@railway.app",
        "name": "Guest User",
        "avatar_url": "",
        "oauth_provider": "none",
        "is_admin": False,
    }


@app.post("/api/auth/refresh")
async def refresh_token(request: Request):
    """Refresh token (just return the same token for simplicity)."""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        payload = verify_token(token)
        if payload:
            new_token = create_access_token(payload["sub"], payload["email"])
            return {
                "access_token": new_token,
                "refresh_token": new_token,
                "token_type": "bearer",
                "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            }

    raise HTTPException(status_code=401, detail="Invalid token")


@app.post("/api/auth/logout")
async def logout():
    return {"message": "Logged out"}


# ─────────────────────────────────────────────────────────────
# Email/Password Authentication
# ─────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@app.post("/api/auth/register")
async def register(request: RegisterRequest):
    """Register a new user with email/password."""
    # Check if email already exists
    for user in users_store.values():
        if user.get("email") == request.email and user.get("oauth_provider") == "email":
            raise HTTPException(status_code=400, detail="이미 등록된 이메일입니다")

    # Create user
    user_id = f"email_{secrets.token_hex(8)}"
    password_hash = hash_password(request.password)

    user = {
        "id": user_id,
        "email": request.email,
        "name": request.name or request.email.split("@")[0],
        "avatar_url": "",
        "oauth_provider": "email",
        "is_admin": False,
        "password_hash": password_hash,
    }
    users_store[user_id] = user

    # Create JWT token
    jwt_token = create_access_token(user_id, user["email"])

    # Return user without password_hash
    user_response = {k: v for k, v in user.items() if k != "password_hash"}

    return {
        "access_token": jwt_token,
        "refresh_token": jwt_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": user_response,
    }


@app.post("/api/auth/login")
async def login(request: LoginRequest):
    """Login with email/password."""
    # Find user by email
    user = None
    for u in users_store.values():
        if u.get("email") == request.email and u.get("oauth_provider") == "email":
            user = u
            break

    if not user:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")

    # Verify password
    if not verify_password(request.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")

    # Create JWT token
    jwt_token = create_access_token(user["id"], user["email"])

    # Return user without password_hash
    user_response = {k: v for k, v in user.items() if k != "password_hash"}

    return {
        "access_token": jwt_token,
        "refresh_token": jwt_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": user_response,
    }


# ─────────────────────────────────────────────────────────────
# Stub APIs for Frontend Compatibility
# ─────────────────────────────────────────────────────────────


class SessionCreate(BaseModel):
    project_id: str | None = None


@app.post("/api/sessions")
async def create_session(request: SessionCreate = None):
    return {
        "session_id": "railway-session",
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


@app.get("/api/projects")
async def get_projects():
    return []


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    raise HTTPException(status_code=404, detail="Projects not available in Railway mode")


@app.get("/api/claude-sessions")
async def get_claude_sessions():
    return []


@app.get("/api/agents")
async def get_agents():
    return []


@app.get("/api/agents/stats")
async def get_agent_stats():
    return {"total_agents": 0, "by_category": {}, "by_status": {}}
