"""Token service with JWT management and blacklist support."""

import uuid
from datetime import datetime, timedelta
from typing import Any

import jwt
from pydantic import BaseModel

from config import get_settings
from utils.time import utcnow


class TokenPayload(BaseModel):
    """JWT token payload."""

    sub: str  # User ID
    type: str  # access or refresh
    exp: datetime
    iat: datetime
    jti: str | None = None  # Token ID for blacklist
    # Custom claims
    email: str | None = None
    name: str | None = None
    roles: list[str] = []
    tier: str | None = None


class TokenPair(BaseModel):
    """Access and refresh token pair."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # Seconds until access token expires


class TokenService:
    """
    JWT token management service with blacklist support.

    Features:
    - Short-lived access tokens (15 min default)
    - Long-lived refresh tokens (7 days default)
    - Token blacklisting for logout/revocation
    - Redis-backed blacklist (falls back to in-memory)
    """

    def __init__(self, redis_client: Any = None):
        """
        Initialize token service.

        Args:
            redis_client: Optional Redis async client for blacklist
        """
        self.settings = get_settings()
        self.redis = redis_client
        self._blacklist: set[str] = set()  # In-memory fallback
        self._blacklist_prefix = "token_blacklist:"

    # ─────────────────────────────────────────────────────────────
    # Token Creation
    # ─────────────────────────────────────────────────────────────

    def create_access_token(
        self,
        user_id: str,
        additional_claims: dict | None = None,
    ) -> str:
        """
        Create a short-lived access token.

        Args:
            user_id: The user's ID
            additional_claims: Optional extra claims to include

        Returns:
            Encoded JWT access token
        """
        expires_delta = timedelta(minutes=self.settings.access_token_expire_minutes)
        now = utcnow()

        payload = {
            "sub": user_id,
            "type": "access",
            "exp": now + expires_delta,
            "iat": now,
        }

        if additional_claims:
            payload.update(additional_claims)

        return jwt.encode(
            payload,
            self.settings.session_secret_key,
            algorithm=self.settings.jwt_algorithm,
        )

    def create_refresh_token(self, user_id: str) -> str:
        """
        Create a long-lived refresh token.

        Args:
            user_id: The user's ID

        Returns:
            Encoded JWT refresh token with unique ID for revocation
        """
        expires_delta = timedelta(days=self.settings.refresh_token_expire_days)
        now = utcnow()

        payload = {
            "sub": user_id,
            "type": "refresh",
            "exp": now + expires_delta,
            "iat": now,
            "jti": str(uuid.uuid4()),  # Unique token ID for blacklist
        }

        return jwt.encode(
            payload,
            self.settings.session_secret_key,
            algorithm=self.settings.jwt_algorithm,
        )

    def create_token_pair(
        self,
        user_id: str,
        additional_claims: dict | None = None,
    ) -> TokenPair:
        """Create both access and refresh tokens."""
        return TokenPair(
            access_token=self.create_access_token(user_id, additional_claims),
            refresh_token=self.create_refresh_token(user_id),
            expires_in=self.settings.access_token_expire_minutes * 60,
        )

    # ─────────────────────────────────────────────────────────────
    # Token Verification
    # ─────────────────────────────────────────────────────────────

    def verify_token(
        self,
        token: str,
        token_type: str = "access",
    ) -> TokenPayload | None:
        """
        Verify and decode a JWT token.

        Args:
            token: The JWT token to verify
            token_type: Expected token type ("access" or "refresh")

        Returns:
            TokenPayload if valid, None otherwise
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

            # Check blacklist for refresh tokens
            if token_type == "refresh":
                jti = payload.get("jti")
                if jti and self._is_blacklisted_sync(jti):
                    return None

            return TokenPayload(
                sub=payload["sub"],
                type=payload["type"],
                exp=datetime.fromtimestamp(payload["exp"]),
                iat=datetime.fromtimestamp(payload["iat"]),
                jti=payload.get("jti"),
                email=payload.get("email"),
                name=payload.get("name"),
                roles=payload.get("roles", []),
                tier=payload.get("tier"),
            )

        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    async def verify_token_async(
        self,
        token: str,
        token_type: str = "access",
    ) -> TokenPayload | None:
        """
        Async version of verify_token with Redis blacklist check.
        """
        try:
            payload = jwt.decode(
                token,
                self.settings.session_secret_key,
                algorithms=[self.settings.jwt_algorithm],
            )

            if payload.get("type") != token_type:
                return None

            # Check blacklist for refresh tokens
            if token_type == "refresh":
                jti = payload.get("jti")
                if jti and await self._is_blacklisted(jti):
                    return None

            return TokenPayload(
                sub=payload["sub"],
                type=payload["type"],
                exp=datetime.fromtimestamp(payload["exp"]),
                iat=datetime.fromtimestamp(payload["iat"]),
                jti=payload.get("jti"),
                email=payload.get("email"),
                name=payload.get("name"),
                roles=payload.get("roles", []),
                tier=payload.get("tier"),
            )

        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    # ─────────────────────────────────────────────────────────────
    # Token Refresh
    # ─────────────────────────────────────────────────────────────

    async def refresh_tokens(self, refresh_token: str) -> TokenPair | None:
        """
        Use refresh token to get new token pair.

        The old refresh token is blacklisted (token rotation).
        """
        payload = await self.verify_token_async(refresh_token, "refresh")
        if not payload:
            return None

        # Blacklist the old refresh token (rotation)
        if payload.jti:
            await self.blacklist_token(payload.jti, payload.exp)

        # Create new pair with same user and claims
        additional_claims = {}
        if payload.email:
            additional_claims["email"] = payload.email
        if payload.name:
            additional_claims["name"] = payload.name
        if payload.roles:
            additional_claims["roles"] = payload.roles
        if payload.tier:
            additional_claims["tier"] = payload.tier

        return self.create_token_pair(payload.sub, additional_claims or None)

    # ─────────────────────────────────────────────────────────────
    # Token Blacklist
    # ─────────────────────────────────────────────────────────────

    async def blacklist_token(
        self,
        token_id: str,
        expires_at: datetime | None = None,
    ) -> bool:
        """
        Add a token to the blacklist.

        Args:
            token_id: The jti (token ID) to blacklist
            expires_at: When the token expires (for TTL)

        Returns:
            True if successfully blacklisted
        """
        key = f"{self._blacklist_prefix}{token_id}"

        if self.redis:
            # Calculate TTL
            ttl = None
            if expires_at:
                ttl = int((expires_at - utcnow()).total_seconds())
                if ttl <= 0:
                    return True  # Already expired

            await self.redis.set(key, "1", ex=ttl)
        else:
            self._blacklist.add(token_id)

        return True

    async def revoke_user_tokens(self, user_id: str) -> bool:
        """
        Revoke all tokens for a user.

        Note: This requires tracking user tokens, which is not
        implemented in this basic version. For production, consider
        storing a user's token generation timestamp and checking it
        during validation.
        """
        # In a full implementation, you would:
        # 1. Store user's "tokens_valid_after" timestamp
        # 2. Check this during token validation
        # 3. Update the timestamp here to invalidate all tokens
        return True

    async def _is_blacklisted(self, token_id: str) -> bool:
        """Check if a token is blacklisted (async)."""
        key = f"{self._blacklist_prefix}{token_id}"

        if self.redis:
            result = await self.redis.get(key)
            return result is not None
        else:
            return token_id in self._blacklist

    def _is_blacklisted_sync(self, token_id: str) -> bool:
        """Check if a token is blacklisted (sync, in-memory only)."""
        return token_id in self._blacklist


# Global singleton
_token_service: TokenService | None = None


def get_token_service(redis_client: Any = None) -> TokenService:
    """Get or create the token service singleton."""
    global _token_service
    if _token_service is None:
        _token_service = TokenService(redis_client)
    return _token_service
