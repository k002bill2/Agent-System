"""Authentication providers."""

from auth.providers.base import AuthProvider, UserInfo
from auth.providers.github import GitHubAuthProvider
from auth.providers.google import GoogleAuthProvider
from auth.providers.oidc import OIDCAuthProvider
from auth.providers.saml import SAMLAuthProvider

__all__ = [
    "AuthProvider",
    "UserInfo",
    "GoogleAuthProvider",
    "GitHubAuthProvider",
    "SAMLAuthProvider",
    "OIDCAuthProvider",
]
