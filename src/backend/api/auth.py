"""OAuth authentication API routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session, get_current_user, get_auth_service
from config import get_settings
from db.models import UserModel
from services.auth_service import AuthService, TokenPair

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ─────────────────────────────────────────────────────────────
# Request/Response Models
# ─────────────────────────────────────────────────────────────


class OAuthCallbackRequest(BaseModel):
    """OAuth callback request with authorization code."""

    code: str
    redirect_uri: str | None = None  # Frontend can specify redirect URI


class RefreshTokenRequest(BaseModel):
    """Token refresh request."""

    refresh_token: str


class UserResponse(BaseModel):
    """User info response."""

    id: str
    email: str
    name: str | None
    avatar_url: str | None
    oauth_provider: str
    is_admin: bool

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    """Authentication response with tokens and user info."""

    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: UserResponse


# ─────────────────────────────────────────────────────────────
# Auth Status (for checking if OAuth is configured)
# ─────────────────────────────────────────────────────────────


class AuthStatusResponse(BaseModel):
    """Auth configuration status."""

    oauth_enabled: bool
    google_enabled: bool
    github_enabled: bool


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status():
    """Check if OAuth is configured. Used by frontend to skip login if not configured."""
    settings = get_settings()

    google_enabled = bool(settings.google_client_id and settings.google_client_secret)
    github_enabled = bool(settings.github_client_id and settings.github_client_secret)

    return AuthStatusResponse(
        oauth_enabled=google_enabled or github_enabled,
        google_enabled=google_enabled,
        github_enabled=github_enabled,
    )


# ─────────────────────────────────────────────────────────────
# Google OAuth Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/google")
async def google_auth_redirect():
    """Redirect to Google OAuth authorization page."""
    settings = get_settings()
    auth_service = AuthService()

    redirect_uri = f"{settings.frontend_url}/auth/callback/google"
    auth_url = auth_service.get_google_auth_url(redirect_uri)

    return RedirectResponse(url=auth_url)


@router.post("/google/callback", response_model=AuthResponse)
async def google_callback(
    request: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Handle Google OAuth callback and exchange code for tokens."""
    settings = get_settings()
    auth_service = AuthService(db)

    # Use provided redirect_uri or default
    redirect_uri = request.redirect_uri or f"{settings.frontend_url}/auth/callback/google"

    try:
        # Exchange code for user info
        user_info = await auth_service.exchange_google_code(request.code, redirect_uri)

        # Get or create user
        user = await auth_service.get_or_create_user(user_info)

        # Create token pair
        tokens = auth_service.create_token_pair(user.id)

        return AuthResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            token_type=tokens.token_type,
            expires_in=tokens.expires_in,
            user=UserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                avatar_url=user.avatar_url,
                oauth_provider=user.oauth_provider,
                is_admin=user.is_admin,
            ),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to authenticate with Google: {str(e)}",
        )


# ─────────────────────────────────────────────────────────────
# GitHub OAuth Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/github")
async def github_auth_redirect():
    """Redirect to GitHub OAuth authorization page."""
    settings = get_settings()
    auth_service = AuthService()

    redirect_uri = f"{settings.frontend_url}/auth/callback/github"
    auth_url = auth_service.get_github_auth_url(redirect_uri)

    return RedirectResponse(url=auth_url)


@router.post("/github/callback", response_model=AuthResponse)
async def github_callback(
    request: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Handle GitHub OAuth callback and exchange code for tokens."""
    settings = get_settings()
    auth_service = AuthService(db)

    # Use provided redirect_uri or default
    redirect_uri = request.redirect_uri or f"{settings.frontend_url}/auth/callback/github"

    try:
        # Exchange code for user info
        user_info = await auth_service.exchange_github_code(request.code, redirect_uri)

        # Get or create user
        user = await auth_service.get_or_create_user(user_info)

        # Create token pair
        tokens = auth_service.create_token_pair(user.id)

        return AuthResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            token_type=tokens.token_type,
            expires_in=tokens.expires_in,
            user=UserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                avatar_url=user.avatar_url,
                oauth_provider=user.oauth_provider,
                is_admin=user.is_admin,
            ),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to authenticate with GitHub: {str(e)}",
        )


# ─────────────────────────────────────────────────────────────
# Token Management Endpoints
# ─────────────────────────────────────────────────────────────


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Refresh access token using refresh token."""
    auth_service = AuthService(db)

    # Verify refresh token
    payload = auth_service.verify_token(request.refresh_token, token_type="refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Verify user still exists and is active
    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )

    # Create new token pair
    return auth_service.create_token_pair(user_id)


# ─────────────────────────────────────────────────────────────
# User Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: UserModel = Depends(get_current_user),
):
    """Get current authenticated user info."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        avatar_url=current_user.avatar_url,
        oauth_provider=current_user.oauth_provider,
        is_admin=current_user.is_admin,
    )


@router.post("/logout")
async def logout():
    """Logout user.

    Note: Since we use stateless JWT tokens, logout is handled client-side
    by deleting the tokens. This endpoint exists for future token blacklisting
    if needed.
    """
    return {"message": "Logged out successfully"}
