"""Google OAuth authentication provider."""

import httpx

from auth.providers.base import AuthProvider, UserInfo
from config import get_settings


class GoogleAuthProvider(AuthProvider):
    """Google OAuth 2.0 authentication provider."""

    def __init__(self):
        self.settings = get_settings()

    @property
    def provider_name(self) -> str:
        return "google"

    async def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """Generate Google OAuth authorization URL."""
        params = {
            "client_id": self.settings.google_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "state": state,
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    async def exchange_code(self, code: str, redirect_uri: str) -> UserInfo:
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
                raw_attributes=user_data,
            )
