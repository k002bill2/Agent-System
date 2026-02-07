"""Rate limiting middleware for FastAPI."""

from collections.abc import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from models.rate_limit import RateLimitTier
from services.rate_limit_service import RateLimitService, get_rate_limit_service


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for rate limiting.

    Features:
    - Per-user rate limiting based on JWT token
    - Per-IP rate limiting for unauthenticated requests
    - Tier-based limits
    - X-RateLimit-* response headers
    - Configurable exempt paths
    """

    def __init__(
        self,
        app: ASGIApp,
        rate_limit_service: RateLimitService | None = None,
        default_tier: str = RateLimitTier.FREE.value,
        enabled: bool = True,
        exempt_paths: list[str] | None = None,
    ):
        """
        Initialize rate limit middleware.

        Args:
            app: FastAPI application
            rate_limit_service: Rate limit service instance
            default_tier: Default tier for unauthenticated requests
            enabled: Whether rate limiting is enabled
            exempt_paths: Paths exempt from rate limiting
        """
        super().__init__(app)
        self.service = rate_limit_service or get_rate_limit_service()
        self.default_tier = default_tier
        self.enabled = enabled
        self.exempt_paths = exempt_paths or [
            "/health",
            "/health/live",
            "/health/ready",
            "/docs",
            "/redoc",
            "/openapi.json",
        ]

    async def dispatch(
        self,
        request: Request,
        call_next: Callable,
    ) -> Response:
        """Process request through rate limiter."""
        # Check if rate limiting is enabled
        if not self.enabled:
            return await call_next(request)

        # Check if path is exempt
        path = request.url.path
        if any(path.startswith(exempt) for exempt in self.exempt_paths):
            return await call_next(request)

        # Get identifier (user_id from JWT or IP address)
        identifier, tier = await self._get_identifier_and_tier(request)

        # Check rate limit
        result = await self.service.check_rate_limit(
            identifier=identifier,
            tier=tier,
            endpoint=path,
        )

        # Add rate limit headers
        headers = {
            "X-RateLimit-Limit": str(result.limit),
            "X-RateLimit-Remaining": str(result.remaining),
            "X-RateLimit-Reset": result.reset_at.isoformat(),
            "X-RateLimit-Tier": result.tier,
        }

        if not result.allowed:
            # Rate limit exceeded
            headers["Retry-After"] = str(result.retry_after)

            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please try again later.",
                    "tier": result.tier,
                    "limit": result.limit,
                    "reset_at": result.reset_at.isoformat(),
                    "retry_after": result.retry_after,
                },
                headers=headers,
            )

        # Process request
        response = await call_next(request)

        # Add headers to response
        for key, value in headers.items():
            response.headers[key] = value

        return response

    async def _get_identifier_and_tier(
        self,
        request: Request,
    ) -> tuple[str, str]:
        """
        Extract identifier and tier from request.

        Priority:
        1. API key from header (X-API-Key)
        2. User ID from JWT token (Authorization: Bearer ...)
        3. Client IP address (fallback)
        """
        # Check for API key
        api_key = request.headers.get("X-API-Key")
        if api_key:
            # TODO: Look up tier from API key registry
            # For now, use professional tier for API keys
            return f"apikey:{api_key}", RateLimitTier.PROFESSIONAL.value

        # Check for JWT token
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
            user_info = await self._decode_jwt(token)
            if user_info:
                user_id = user_info.get("sub")
                # Get tier from user info or default
                tier = user_info.get("tier", self.default_tier)
                return f"user:{user_id}", tier

        # Fallback to IP address
        client_ip = self._get_client_ip(request)
        return f"ip:{client_ip}", self.default_tier

    async def _decode_jwt(self, token: str) -> dict | None:
        """Decode JWT token to get user info."""
        try:
            import jwt

            from config import get_settings

            settings = get_settings()
            payload = jwt.decode(
                token,
                settings.session_secret_key,
                algorithms=[settings.jwt_algorithm],
            )
            return payload
        except Exception:
            return None

    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address from request."""
        # Check for forwarded headers (behind proxy)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # Take the first IP in the chain
            return forwarded.split(",")[0].strip()

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        # Direct connection
        if request.client:
            return request.client.host

        return "unknown"
