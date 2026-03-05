"""OAuth and email/password authentication API routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db_session
from config import get_settings
from db.models import UserModel
from services.audit_service import AuditAction, audit_user_auth
from services.auth_service import AuthService, TokenPair

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _get_user_role(user: UserModel) -> str:
    """Get user role with fallback from is_admin flag."""
    role = getattr(user, "role", None)
    if role:
        return role
    return "admin" if user.is_admin else "user"


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
    role: str = "user"
    is_org_admin: bool = False
    admin_org_ids: list[str] = []

    model_config = ConfigDict(from_attributes=True)


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
    email_enabled: bool


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
        email_enabled=True,  # Email/password auth is always available
    )


# ─────────────────────────────────────────────────────────────
# Google OAuth Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/google")
async def google_auth_redirect():
    """Redirect to Google OAuth authorization page."""
    settings = get_settings()

    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )

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

        audit_user_auth(
            AuditAction.USER_LOGIN,
            user_id=user.id,
            metadata={"provider": "google", "email": user.email},
        )

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
                role=_get_user_role(user),
            ),
        )
    except Exception as e:
        import logging

        logging.getLogger(__name__).error(
            "Google OAuth callback error: %s, redirect_uri=%s", str(e), redirect_uri
        )
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

    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
        )

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

        audit_user_auth(
            AuditAction.USER_LOGIN,
            user_id=user.id,
            metadata={"provider": "github", "email": user.email},
        )

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
                role=_get_user_role(user),
            ),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to authenticate with GitHub: {str(e)}",
        )


# ─────────────────────────────────────────────────────────────
# Email/Password Authentication Endpoints
# ─────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    """Email/password registration request."""

    email: str
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    """Email/password login request."""

    email: str
    password: str


@router.post("/register", response_model=AuthResponse)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Register a new user with email and password."""
    if len(request.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="비밀번호는 6자 이상이어야 합니다",
        )

    auth_service = AuthService(db)

    try:
        user = await auth_service.register_user(
            email=request.email,
            password=request.password,
            name=request.name,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    tokens = auth_service.create_token_pair(user.id)

    audit_user_auth(
        AuditAction.USER_REGISTERED,
        user_id=user.id,
        metadata={"provider": "email", "email": request.email},
    )

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
            oauth_provider=user.oauth_provider or "email",
            is_admin=user.is_admin,
            role=_get_user_role(user),
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Login with email and password."""
    auth_service = AuthService(db)

    try:
        user = await auth_service.login_user(
            email=request.email,
            password=request.password,
        )
    except ValueError as e:
        audit_user_auth(
            AuditAction.LOGIN_FAILED,
            metadata={"email": request.email, "reason": str(e)},
            status="failed",
            error_message=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )

    tokens = auth_service.create_token_pair(user.id)

    audit_user_auth(
        AuditAction.USER_LOGIN,
        user_id=user.id,
        metadata={"provider": "email", "email": user.email},
    )

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
            oauth_provider=user.oauth_provider or "email",
            is_admin=user.is_admin,
            role=_get_user_role(user),
        ),
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
    tokens = auth_service.create_token_pair(user_id)

    audit_user_auth(
        AuditAction.TOKEN_REFRESHED,
        user_id=user_id,
    )

    return tokens


# ─────────────────────────────────────────────────────────────
# User Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: UserModel = Depends(get_current_user),
):
    """Get current authenticated user info."""
    # 조직 admin 여부 계산 (circular import 방지를 위해 인라인 구현)
    import os

    admin_org_ids: list[str] = []

    if os.getenv("USE_DATABASE", "false").lower() == "true":
        # DB와 JSON 모두 확인 (projects.py의 _get_admin_org_ids와 동일한 패턴)
        # circular import 방지를 위해 인라인으로 구현
        # DB에서 조직 admin 역할 조회
        try:
            from sqlalchemy import and_, select

            from db.database import async_session_factory
            from db.models import OrganizationMemberModel

            admin_roles = {"owner", "admin"}
            async with async_session_factory() as session:
                result = await session.execute(
                    select(OrganizationMemberModel.organization_id).where(
                        and_(
                            OrganizationMemberModel.user_id == current_user.id,
                            OrganizationMemberModel.role.in_(admin_roles),
                            OrganizationMemberModel.is_active == True,  # noqa: E712
                        )
                    )
                )
                db_org_ids = [row[0] for row in result.all()]

            # JSON fallback
            from services.organization_service import OrganizationService

            all_orgs = OrganizationService.list_organizations()
            for org in all_orgs:
                mem = OrganizationService.get_member_by_user(org.id, current_user.id)
                if mem:
                    role_val = mem.role.value if hasattr(mem.role, "value") else mem.role
                    if role_val in admin_roles and org.id not in db_org_ids:
                        db_org_ids.append(org.id)

            admin_org_ids = db_org_ids
        except Exception as e:
            import logging

            logging.getLogger(__name__).warning(
                "Failed to fetch org admin info for user %s: %s", current_user.id, e
            )
            admin_org_ids = []

    is_org_admin = len(admin_org_ids) > 0

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        avatar_url=current_user.avatar_url,
        oauth_provider=current_user.oauth_provider,
        is_admin=current_user.is_admin,
        role=_get_user_role(current_user),
        is_org_admin=is_org_admin,
        admin_org_ids=admin_org_ids,
    )


@router.post("/logout")
async def logout(
    current_user: UserModel = Depends(get_current_user),
):
    """Logout user.

    Note: Since we use stateless JWT tokens, logout is handled client-side
    by deleting the tokens. This endpoint exists for future token blacklisting
    if needed.
    """
    audit_user_auth(
        AuditAction.USER_LOGOUT,
        user_id=current_user.id,
    )
    return {"message": "Logged out successfully"}
