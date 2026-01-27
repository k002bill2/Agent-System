"""GitHub OAuth authentication provider."""

import httpx

from auth.providers.base import AuthProvider, UserInfo
from config import get_settings


class GitHubAuthProvider(AuthProvider):
    """GitHub OAuth 2.0 authentication provider."""

    def __init__(self):
        self.settings = get_settings()

    @property
    def provider_name(self) -> str:
        return "github"

    async def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """Generate GitHub OAuth authorization URL."""
        params = {
            "client_id": self.settings.github_client_id,
            "redirect_uri": redirect_uri,
            "scope": "user:email read:user",
            "state": state,
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"https://github.com/login/oauth/authorize?{query}"

    async def exchange_code(self, code: str, redirect_uri: str) -> UserInfo:
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
                raise ValueError(f"GitHub OAuth error: {tokens.get('error_description', tokens['error'])}")

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

                # Find primary verified email
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
                raw_attributes=user_data,
            )
