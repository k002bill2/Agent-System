"""OpenID Connect (OIDC) authentication provider."""

import httpx

from auth.providers.base import AuthProvider, UserInfo
from config import get_settings


class OIDCConfig:
    """OIDC configuration."""

    def __init__(
        self,
        issuer_url: str,
        client_id: str,
        client_secret: str,
        scopes: list[str] | None = None,
        # Auto-discovered endpoints (can be overridden)
        authorization_endpoint: str | None = None,
        token_endpoint: str | None = None,
        userinfo_endpoint: str | None = None,
        jwks_uri: str | None = None,
    ):
        self.issuer_url = issuer_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.scopes = scopes or ["openid", "email", "profile"]

        # These can be auto-discovered
        self.authorization_endpoint = authorization_endpoint
        self.token_endpoint = token_endpoint
        self.userinfo_endpoint = userinfo_endpoint
        self.jwks_uri = jwks_uri
        self._discovered = False

    async def discover(self) -> None:
        """Discover OIDC endpoints from well-known configuration."""
        if self._discovered:
            return

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.issuer_url}/.well-known/openid-configuration"
            )
            response.raise_for_status()
            config = response.json()

            self.authorization_endpoint = self.authorization_endpoint or config.get("authorization_endpoint")
            self.token_endpoint = self.token_endpoint or config.get("token_endpoint")
            self.userinfo_endpoint = self.userinfo_endpoint or config.get("userinfo_endpoint")
            self.jwks_uri = self.jwks_uri or config.get("jwks_uri")
            self._discovered = True


class OIDCAuthProvider(AuthProvider):
    """
    OpenID Connect (OIDC) authentication provider.

    Supports auto-discovery of endpoints from the issuer's
    .well-known/openid-configuration.
    """

    def __init__(self, config: OIDCConfig | None = None, provider_id: str = "oidc"):
        self.settings = get_settings()
        self.config = config
        self._provider_id = provider_id

    @property
    def provider_name(self) -> str:
        return self._provider_id

    async def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """Generate OIDC authorization URL."""
        if not self.config:
            raise ValueError("OIDC configuration not set")

        # Discover endpoints if needed
        await self.config.discover()

        if not self.config.authorization_endpoint:
            raise ValueError("OIDC authorization endpoint not configured")

        params = {
            "client_id": self.config.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(self.config.scopes),
            "state": state,
        }

        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.config.authorization_endpoint}?{query}"

    async def exchange_code(self, code: str, redirect_uri: str) -> UserInfo:
        """Exchange OIDC authorization code for user info."""
        if not self.config:
            raise ValueError("OIDC configuration not set")

        # Discover endpoints if needed
        await self.config.discover()

        async with httpx.AsyncClient() as client:
            # Exchange code for tokens
            token_response = await client.post(
                self.config.token_endpoint,
                data={
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                },
            )
            token_response.raise_for_status()
            tokens = token_response.json()

            # Get user info
            if self.config.userinfo_endpoint:
                userinfo_response = await client.get(
                    self.config.userinfo_endpoint,
                    headers={"Authorization": f"Bearer {tokens['access_token']}"},
                )
                userinfo_response.raise_for_status()
                user_data = userinfo_response.json()
            else:
                # Try to decode ID token if no userinfo endpoint
                user_data = self._decode_id_token(tokens.get("id_token", ""))

            return UserInfo(
                id=user_data.get("sub") or user_data.get("id"),
                email=user_data.get("email"),
                name=user_data.get("name") or user_data.get("preferred_username"),
                avatar_url=user_data.get("picture"),
                provider=self._provider_id,
                raw_attributes=user_data,
            )

    def _decode_id_token(self, id_token: str) -> dict:
        """
        Decode ID token payload (without full validation).

        Note: In production, you should validate the token signature
        against the JWKS.
        """
        import base64
        import json

        try:
            # Split token
            parts = id_token.split(".")
            if len(parts) != 3:
                return {}

            # Decode payload (second part)
            payload = parts[1]
            # Add padding if needed
            padding = 4 - len(payload) % 4
            if padding != 4:
                payload += "=" * padding

            decoded = base64.urlsafe_b64decode(payload)
            return json.loads(decoded)
        except Exception:
            return {}

    async def validate_token(self, token: str) -> UserInfo | None:
        """Validate access token and return user info."""
        if not self.config or not self.config.userinfo_endpoint:
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.config.userinfo_endpoint,
                    headers={"Authorization": f"Bearer {token}"},
                )
                if response.status_code != 200:
                    return None

                user_data = response.json()
                return UserInfo(
                    id=user_data.get("sub") or user_data.get("id"),
                    email=user_data.get("email"),
                    name=user_data.get("name"),
                    avatar_url=user_data.get("picture"),
                    provider=self._provider_id,
                    raw_attributes=user_data,
                )
        except Exception:
            return None
