"""Authentication service for OAuth, email/password, and JWT token management."""

import hashlib
import uuid
from datetime import datetime, timedelta

from utils.time import utcnow
from typing import Any

import httpx
import jwt
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from db.models import OrganizationMemberModel, UserModel


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
        expire = utcnow() + expires_delta

        payload = {
            "sub": user_id,
            "type": "access",
            "exp": expire,
            "iat": utcnow(),
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
        expire = utcnow() + expires_delta

        payload = {
            "sub": user_id,
            "type": "refresh",
            "exp": expire,
            "iat": utcnow(),
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
        }
        if state:
            params["state"] = state

        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    async def exchange_google_code(self, code: str, redirect_uri: str) -> UserInfo:
        """Exchange Google authorization code for user info."""
        import logging

        logger = logging.getLogger(__name__)
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
            if token_response.status_code != 200:
                error_detail = token_response.json()
                logger.error(
                    "Google OAuth token exchange failed: status=%s, error=%s, redirect_uri=%s",
                    token_response.status_code,
                    error_detail,
                    redirect_uri,
                )
                error_msg = error_detail.get("error", "unknown_error")
                error_desc = error_detail.get("error_description", "")
                raise Exception(f"Google token exchange failed: {error_msg} - {error_desc}")
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
            user.last_login_at = utcnow()
            if user_info.name:
                user.name = user_info.name
            if user_info.avatar_url:
                user.avatar_url = user_info.avatar_url
            await self.db.commit()
            # Sync user role from organization membership
            user = await self.sync_user_role_from_org(user)
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
            existing_user.last_login_at = utcnow()
            if user_info.name:
                existing_user.name = user_info.name
            if user_info.avatar_url:
                existing_user.avatar_url = user_info.avatar_url
            await self.db.commit()
            # Sync user role from organization membership
            existing_user = await self.sync_user_role_from_org(existing_user)
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
            created_at=utcnow(),
            last_login_at=utcnow(),
        )
        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)
        # Sync user role from organization membership
        new_user = await self.sync_user_role_from_org(new_user)
        return new_user

    async def get_user_by_id(self, user_id: str) -> UserModel | None:
        """Get user by ID."""
        if not self.db:
            raise RuntimeError("Database session required for user management")

        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def sync_user_role_from_org(self, user: UserModel) -> UserModel:
        """Organization 멤버 역할 기반으로 user role 동기화.

        매핑 규칙:
        - super_admin_emails에 포함 → 항상 admin
        - owner/admin → role='admin', is_admin=True
        - member/viewer (또는 미소속) → role='user', is_admin=False

        여러 org에 소속된 경우, 가장 높은 역할 기준.
        """
        if not self.db:
            raise RuntimeError("Database session required for role sync")

        # Super admin 이메일은 항상 admin 유지
        super_emails_str = self.settings.super_admin_emails
        if super_emails_str:
            super_emails = [e.strip().lower() for e in super_emails_str.split(",") if e.strip()]
            if user.email and user.email.lower() in super_emails:
                user.role = "admin"
                user.is_admin = True
                await self.db.commit()
                return user

        result = await self.db.execute(
            select(OrganizationMemberModel.role).where(
                and_(
                    OrganizationMemberModel.user_id == user.id,
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        roles = [row[0] for row in result.fetchall()]

        if any(r in ("owner", "admin") for r in roles):
            user.role = "admin"
            user.is_admin = True
        else:
            user.role = "user"
            user.is_admin = False

        await self.db.commit()
        return user

    # ─────────────────────────────────────────────────────────────
    # Password Hashing (bcrypt with SHA-256 legacy support)
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password using bcrypt."""
        import bcrypt

        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")

    @staticmethod
    def _is_legacy_sha256(hashed: str) -> bool:
        """Detect legacy SHA-256 format: ``{salt_hex32}:{hash_hex64}`` (total 97 chars)."""
        if len(hashed) != 97:
            return False
        parts = hashed.split(":")
        return len(parts) == 2 and len(parts[0]) == 32 and len(parts[1]) == 64

    @staticmethod
    def _verify_sha256(password: str, hashed: str) -> bool:
        """Verify against legacy SHA-256 hash."""
        try:
            salt, password_hash = hashed.split(":")
            return hashlib.sha256((password + salt).encode()).hexdigest() == password_hash
        except ValueError:
            return False

    @staticmethod
    def _verify_bcrypt(password: str, hashed: str) -> bool:
        """Verify against bcrypt hash."""
        import bcrypt

        try:
            return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("ascii"))
        except Exception:
            return False

    @classmethod
    def verify_password(cls, password: str, hashed: str) -> bool:
        """Verify password against stored hash (bcrypt or legacy SHA-256)."""
        if cls._is_legacy_sha256(hashed):
            return cls._verify_sha256(password, hashed)
        return cls._verify_bcrypt(password, hashed)

    @classmethod
    def verify_and_upgrade_password(cls, password: str, hashed: str) -> tuple[bool, str | None]:
        """Verify password and return upgraded hash if legacy format detected.

        Returns:
            Tuple of (is_valid, new_hash_or_none).
            new_hash is non-None only when a legacy SHA-256 hash was successfully verified.
        """
        if cls._is_legacy_sha256(hashed):
            if cls._verify_sha256(password, hashed):
                return True, cls.hash_password(password)
            return False, None
        return cls._verify_bcrypt(password, hashed), None

    # ─────────────────────────────────────────────────────────────
    # Email/Password Authentication
    # ─────────────────────────────────────────────────────────────

    async def register_user(self, email: str, password: str, name: str | None = None) -> UserModel:
        """Register a new user with email and password."""
        if not self.db:
            raise RuntimeError("Database session required for user management")

        # Check if email already exists
        stmt = select(UserModel).where(UserModel.email == email)
        result = await self.db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            raise ValueError("이미 등록된 이메일입니다")

        # Create new user
        new_user = UserModel(
            id=str(uuid.uuid4()),
            email=email,
            name=name or email.split("@")[0],
            password_hash=self.hash_password(password),
            oauth_provider="email",
            oauth_provider_id=f"email_{email}",
            is_active=True,
            is_admin=False,
            created_at=utcnow(),
            last_login_at=utcnow(),
        )
        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)
        return new_user

    async def login_user(self, email: str, password: str) -> UserModel:
        """Authenticate user with email and password."""
        if not self.db:
            raise RuntimeError("Database session required for user management")

        stmt = select(UserModel).where(UserModel.email == email)
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user or not user.password_hash:
            raise ValueError("이메일 또는 비밀번호가 올바르지 않습니다")

        is_valid, new_hash = self.verify_and_upgrade_password(password, user.password_hash)
        if not is_valid:
            raise ValueError("이메일 또는 비밀번호가 올바르지 않습니다")

        # Auto-upgrade legacy SHA-256 hash to bcrypt
        if new_hash is not None:
            user.password_hash = new_hash

        if not user.is_active:
            raise ValueError("비활성화된 계정입니다")

        # Update last login
        user.last_login_at = utcnow()
        await self.db.commit()

        # Sync user role from organization membership
        user = await self.sync_user_role_from_org(user)
        return user
