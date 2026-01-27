"""Base authentication provider interface."""

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel


class UserInfo(BaseModel):
    """User information from authentication provider."""

    id: str
    email: str
    name: str | None = None
    avatar_url: str | None = None
    provider: str  # google, github, saml, oidc
    raw_attributes: dict[str, Any] | None = None


class AuthProvider(ABC):
    """
    Abstract base class for authentication providers.

    All authentication providers (OAuth, SAML, OIDC) must implement this interface.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the name of this provider."""
        ...

    @abstractmethod
    async def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """
        Generate the authorization URL for this provider.

        Args:
            redirect_uri: The URL to redirect to after authentication
            state: CSRF protection state parameter

        Returns:
            The full authorization URL
        """
        ...

    @abstractmethod
    async def exchange_code(self, code: str, redirect_uri: str) -> UserInfo:
        """
        Exchange an authorization code for user information.

        Args:
            code: The authorization code from the provider
            redirect_uri: The redirect URI used in the initial request

        Returns:
            UserInfo object with user details
        """
        ...

    async def validate_token(self, token: str) -> UserInfo | None:
        """
        Validate a token and return user info if valid.

        Optional method for providers that support token validation.
        """
        return None

    async def logout(self, session_id: str) -> str | None:
        """
        Perform logout and return redirect URL if applicable.

        Optional method for providers that support single logout.
        """
        return None
