"""Authentication providers."""

from auth.providers.base import AuthProvider, UserInfo
from auth.providers.google import GoogleAuthProvider
from auth.providers.github import GitHubAuthProvider
from auth.providers.saml import SAMLAuthProvider
from auth.providers.oidc import OIDCAuthProvider

__all__ = [
    "AuthProvider",
    "UserInfo",
    "GoogleAuthProvider",
    "GitHubAuthProvider",
    "SAMLAuthProvider",
    "OIDCAuthProvider",
]
