"""Authentication module with multiple provider support."""

from auth.providers.base import AuthProvider, UserInfo
from auth.providers.google import GoogleAuthProvider
from auth.providers.github import GitHubAuthProvider
from auth.providers.saml import SAMLAuthProvider
from auth.providers.oidc import OIDCAuthProvider
from auth.token_service import TokenService

__all__ = [
    "AuthProvider",
    "UserInfo",
    "GoogleAuthProvider",
    "GitHubAuthProvider",
    "SAMLAuthProvider",
    "OIDCAuthProvider",
    "TokenService",
]
