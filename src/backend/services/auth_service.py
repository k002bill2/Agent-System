"""Authentication service for OAuth and JWT token management."""

import uuid
from datetime import datetime, timedelta
from typing import Any

import httpx
import jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from db.models import UserModel


class TokenPair(BaseModel):
    """Token pair response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserInfo(BaseModel):
    """User info from OAuth provider."""

    id: str
    email: str
    name: str | None = None
    avatar_url: str | None = None
    provider: str  # google | github


class AuthService:
    """Service for handling OAuth authentication and JWT tokens."""

    def __init__(self, db: AsyncSession | None = None):
        self.db = db
        self.settings = get_settings()

    # ─────────────────────────────────────────────────────────────
    # JWT Token Management
    # ─────────────────────────────────────────────────────────────

    def create_access_token(self, user_id: str, additional_claims: dict | None = None) -> str:
        """Create a short-lived access token (15 minutes)."""
        expires_delta = timedelta(minutes=self.settings.access_token_expire_minutes)
        expire = datetime.utcnow() + expires_delta

        payload = {
            "sub": user_id,
            "type": "access",
            "exp": expire,
            "iat": datetime.utcnow(),
        }

        if additional_claims:
            payload.update(additional_claims)

        return jwt.encode(
            payload,
            self.settings.session_secret_key,
            algorithm=self.settings.jwt_algorithm,
        )

    def create_refresh_token(self, user_id: str) -> str:
        """Create a long-lived refresh token (7 days)."""
        expires_delta = timedelta(days=self.settings.refresh_token_expire_days)
        expire = datetime.utcnow() + expires_delta

        payload = {
            "sub": user_id,
            "type": "refresh",
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": str(uuid.uuid4()),  # Unique token ID for revocation
        }

        return jwt.encode(
            payload,
            self.settings.session_secret_key,
            algorithm=self.settings.jwt_algorithm,
        )

    def verify_token(self, token: str, token_type: str = "access") -> dict[str, Any] | None:
        """Verify and decode a JWT token.

        Args:
            token: The JWT token to verify
            token_type: Expected token type ("access" or "refresh")

        Returns:
            Decoded payload if valid, None otherwise
        """
        try:
            payload = jwt.decode(
                token,
                self.settings.session_secret_key,
                algorithms=[self.settings.jwt_algorithm],
            )

            # Verify token type
            if payload.get("type") != token_type:
                return None

            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    def create_token_pair(self, user_id: str) -> TokenPair:
        """Create both access and refresh tokens."""
        return TokenPair(
            access_token=self.create_access_token(user_id),
            refresh_token=self.create_refresh_token(user_id),
            expires_in=self.settings.access_token_expire_minutes * 60,
        )

    # ─────────────────────────────────────────────────────────────
    # Google OAuth
    # ─────────────────────────────────────────────────────────────

    def get_google_auth_url(self, redirect_uri: str, state: str | None = None) -> str:
        """Generate Google OAuth authorization URL."""
        params = {
            "client_id": self.settings.google_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "consent",
        }
        if state:
            params["state"] = state

        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    async def exchange_google_code(self, code: str, redirect_uri: str) -> UserInfo:
        """Exchange Google authorization code for user info."""
        async with httpx.AsyncClient() as client:
            # Exchange code for tokens
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                },
            )
            token_response.raise_for_status()
            tokens = token_response.json()

            # Get user info
            userinfo_response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            userinfo_response.raise_for_status()
            user_data = userinfo_response.json()

            return UserInfo(
                id=user_data["id"],
                email=user_data["email"],
                name=user_data.get("name"),
                avatar_url=user_data.get("picture"),
                provider="google",
            )

    # ─────────────────────────────────────────────────────────────
    # GitHub OAuth
    # ─────────────────────────────────────────────────────────────

    def get_github_auth_url(self, redirect_uri: str, state: str | None = None) -> str:
        """Generate GitHub OAuth authorization URL."""
        params = {
            "client_id": self.settings.github_client_id,
            "redirect_uri": redirect_uri,
            "scope": "user:email read:user",
        }
        if state:
            params["state"] = state

        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"https://github.com/login/oauth/authorize?{query}"

    async def exchange_github_code(self, code: str, redirect_uri: str) -> UserInfo:
        """Exchange GitHub authorization code for user info."""
        async with httpx.AsyncClient() as client:
            # Exchange code for access token
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                data={
                    "client_id": self.settings.github_client_id,
                    "client_secret": self.settings.github_client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
                headers={"Accept": "application/json"},
            )
            token_response.raise_for_status()
            tokens = token_response.json()

            if "error" in tokens:
                raise ValueError(f"GitHub OAuth error: {tokens['error_description']}")

            access_token = tokens["access_token"]

            # Get user info
            user_response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            user_response.raise_for_status()
            user_data = user_response.json()

            # Get primary email if not public
            email = user_data.get("email")
            if not email:
                emails_response = await client.get(
                    "https://api.github.com/user/emails",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/vnd.github.v3+json",
                    },
                )
                emails_response.raise_for_status()
                emails = emails_response.json()
                # Find primary email
                for e in emails:
                    if e.get("primary") and e.get("verified"):
                        email = e["email"]
                        break
                if not email and emails:
                    email = emails[0]["email"]

            return UserInfo(
                id=str(user_data["id"]),
                email=email,
                name=user_data.get("name") or user_data.get("login"),
                avatar_url=user_data.get("avatar_url"),
                provider="github",
            )

    # ─────────────────────────────────────────────────────────────
    # User Management
    # ─────────────────────────────────────────────────────────────

    async def get_or_create_user(self, user_info: UserInfo) -> UserModel:
        """Get existing user or create new one from OAuth info."""
        if not self.db:
            raise RuntimeError("Database session required for user management")

        # First, try to find by provider + provider_id
        stmt = select(UserModel).where(
            UserModel.oauth_provider == user_info.provider,
            UserModel.oauth_provider_id == user_info.id,
        )
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            # Update last login and any changed info
            user.last_login_at = datetime.utcnow()
            if user_info.name:
                user.name = user_info.name
            if user_info.avatar_url:
                user.avatar_url = user_info.avatar_url
            await self.db.commit()
            return user

        # Check if email already exists (might have logged in with different provider)
        stmt = select(UserModel).where(UserModel.email == user_info.email)
        result = await self.db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            # Email exists with different provider - update to allow this provider too
            # For now, we'll just update the provider info (could also track multiple providers)
            existing_user.oauth_provider = user_info.provider
            existing_user.oauth_provider_id = user_info.id
            existing_user.last_login_at = datetime.utcnow()
            if user_info.name:
                existing_user.name = user_info.name
            if user_info.avatar_url:
                existing_user.avatar_url = user_info.avatar_url
            await self.db.commit()
            return existing_user

        # Create new user
        new_user = UserModel(
            id=str(uuid.uuid4()),
            email=user_info.email,
            name=user_info.name,
            avatar_url=user_info.avatar_url,
            oauth_provider=user_info.provider,
            oauth_provider_id=user_info.id,
            is_active=True,
            is_admin=False,
            created_at=datetime.utcnow(),
            last_login_at=datetime.utcnow(),
        )
        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)
        return new_user

    async def get_user_by_id(self, user_id: str) -> UserModel | None:
        """Get user by ID."""
        if not self.db:
            raise RuntimeError("Database session required for user management")

        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
