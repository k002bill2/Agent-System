"""JWT authentication middleware and RBAC for the v1 Agent Registry API.

Provides stateless JWT-based authentication with HS256 signing,
role-based access control (admin > manager > user), and token
lifecycle management (access: 30min, refresh: 7 days).
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

JWT_SECRET_KEY = "agent-registry-secret-key-change-in-production"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────


class UserRole(str, Enum):
    """User roles with hierarchical permissions."""

    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


# Role hierarchy: higher number = more permissions
ROLE_HIERARCHY: dict[UserRole, int] = {
    UserRole.USER: 1,
    UserRole.MANAGER: 2,
    UserRole.ADMIN: 3,
}


class TokenPayload(BaseModel):
    """JWT token payload schema."""

    sub: str = Field(..., description="User ID (subject)")
    username: str = Field(..., description="Username")
    role: UserRole = Field(default=UserRole.USER, description="User role")
    token_type: str = Field(default="access", description="Token type: access or refresh")
    exp: float = Field(..., description="Expiration timestamp")
    iat: float = Field(..., description="Issued at timestamp")


class TokenPairResponse(BaseModel):
    """Token pair response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = ACCESS_TOKEN_EXPIRE_MINUTES * 60


class AuthenticatedUser(BaseModel):
    """Authenticated user context extracted from JWT."""

    user_id: str
    username: str
    role: UserRole


# ─────────────────────────────────────────────────────────────
# In-memory user store (for eval/demo purposes)
# ─────────────────────────────────────────────────────────────


class UserRecord(BaseModel):
    """In-memory user record."""

    user_id: str
    username: str
    password_hash: str  # In production, use bcrypt/argon2
    role: UserRole = UserRole.USER
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# Default users for the registry
_users: dict[str, UserRecord] = {
    "admin": UserRecord(
        user_id="usr_admin_001",
        username="admin",
        password_hash="admin123",  # Simplified for eval
        role=UserRole.ADMIN,
    ),
    "manager": UserRecord(
        user_id="usr_manager_001",
        username="manager",
        password_hash="manager123",
        role=UserRole.MANAGER,
    ),
    "user": UserRecord(
        user_id="usr_user_001",
        username="user",
        password_hash="user123",
        role=UserRole.USER,
    ),
}

# Track revoked refresh tokens
_revoked_tokens: set[str] = set()


def get_user_store() -> dict[str, UserRecord]:
    """Get the in-memory user store."""
    return _users


def reset_user_store() -> None:
    """Reset user store to defaults (for testing)."""
    global _users, _revoked_tokens
    _users = {
        "admin": UserRecord(
            user_id="usr_admin_001",
            username="admin",
            password_hash="admin123",
            role=UserRole.ADMIN,
        ),
        "manager": UserRecord(
            user_id="usr_manager_001",
            username="manager",
            password_hash="manager123",
            role=UserRole.MANAGER,
        ),
        "user": UserRecord(
            user_id="usr_user_001",
            username="user",
            password_hash="user123",
            role=UserRole.USER,
        ),
    }
    _revoked_tokens.clear()


# ─────────────────────────────────────────────────────────────
# Token creation & verification
# ─────────────────────────────────────────────────────────────


def create_access_token(
    user_id: str,
    username: str,
    role: UserRole,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token.

    Args:
        user_id: User identifier.
        username: Username.
        role: User role.
        expires_delta: Custom expiration delta (default: 30 minutes).

    Returns:
        Encoded JWT access token string.
    """
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))

    payload = {
        "sub": user_id,
        "username": username,
        "role": role.value,
        "token_type": "access",
        "exp": expire.timestamp(),
        "iat": now.timestamp(),
    }

    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(
    user_id: str,
    username: str,
    role: UserRole,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT refresh token.

    Args:
        user_id: User identifier.
        username: Username.
        role: User role.
        expires_delta: Custom expiration delta (default: 7 days).

    Returns:
        Encoded JWT refresh token string.
    """
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))

    payload = {
        "sub": user_id,
        "username": username,
        "role": role.value,
        "token_type": "refresh",
        "exp": expire.timestamp(),
        "iat": now.timestamp(),
    }

    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_token_pair(user_id: str, username: str, role: UserRole) -> TokenPairResponse:
    """Create both access and refresh tokens.

    Args:
        user_id: User identifier.
        username: Username.
        role: User role.

    Returns:
        TokenPairResponse with both tokens.
    """
    access_token = create_access_token(user_id, username, role)
    refresh_token = create_refresh_token(user_id, username, role)

    return TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


def verify_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    """Verify and decode a JWT token.

    Args:
        token: The JWT token string.
        expected_type: Expected token type ("access" or "refresh").

    Returns:
        Decoded token payload dict.

    Raises:
        HTTPException: If the token is invalid, expired, or wrong type.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError as e:
        logger.warning("JWT decode error: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check token type
    token_type = payload.get("token_type", "access")
    if token_type != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Expected {expected_type} token, got {token_type}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check expiration explicitly
    exp = payload.get("exp", 0)
    if time.time() > exp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if refresh token is revoked
    if expected_type == "refresh" and token in _revoked_tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def revoke_refresh_token(token: str) -> None:
    """Add a refresh token to the revocation set."""
    _revoked_tokens.add(token)


# ─────────────────────────────────────────────────────────────
# Authentication dependencies (used with Depends())
# ─────────────────────────────────────────────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthenticatedUser:
    """Extract and validate the current user from the JWT token.

    This is a FastAPI dependency. Use with Depends(get_current_user).

    Raises:
        HTTPException: 401 if not authenticated or token is invalid.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_token(credentials.credentials, expected_type="access")

    return AuthenticatedUser(
        user_id=payload["sub"],
        username=payload["username"],
        role=UserRole(payload.get("role", "user")),
    )


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthenticatedUser | None:
    """Extract user from JWT token if present, otherwise return None.

    Use for endpoints that work differently for authenticated vs anonymous users.
    """
    if not credentials:
        return None

    try:
        payload = verify_token(credentials.credentials, expected_type="access")
        return AuthenticatedUser(
            user_id=payload["sub"],
            username=payload["username"],
            role=UserRole(payload.get("role", "user")),
        )
    except HTTPException:
        return None


# ─────────────────────────────────────────────────────────────
# RBAC middleware / dependency helpers
# ─────────────────────────────────────────────────────────────


class RBACMiddleware:
    """Role-based access control middleware.

    Enforces minimum role requirements for protected endpoints.
    Role hierarchy: admin (3) > manager (2) > user (1).
    """

    def __init__(self, min_role: UserRole = UserRole.USER) -> None:
        """Initialize with minimum required role.

        Args:
            min_role: Minimum role required to access the endpoint.
        """
        self.min_role = min_role

    async def __call__(
        self,
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        """Validate that the current user meets the minimum role requirement.

        Args:
            current_user: The authenticated user from JWT.

        Returns:
            The authenticated user if authorized.

        Raises:
            HTTPException: 403 if the user's role is insufficient.
        """
        user_level = ROLE_HIERARCHY.get(current_user.role, 0)
        required_level = ROLE_HIERARCHY.get(self.min_role, 0)

        if user_level < required_level:
            logger.warning(
                "RBAC denied: user=%s role=%s required=%s",
                current_user.username,
                current_user.role.value,
                self.min_role.value,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {self.min_role.value}",
            )

        return current_user


# Pre-built role requirement dependencies
require_admin = RBACMiddleware(min_role=UserRole.ADMIN)
require_manager = RBACMiddleware(min_role=UserRole.MANAGER)
require_user = RBACMiddleware(min_role=UserRole.USER)


def authenticate_user(username: str, password: str) -> UserRecord | None:
    """Authenticate a user with username and password.

    Args:
        username: The username to authenticate.
        password: The plaintext password.

    Returns:
        UserRecord if credentials are valid, None otherwise.
    """
    user = _users.get(username)
    if not user:
        return None
    if user.password_hash != password:
        return None
    if not user.is_active:
        return None
    return user
