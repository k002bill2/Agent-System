"""Application configuration."""

import json
from functools import lru_cache
from typing import TYPE_CHECKING, Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

if TYPE_CHECKING:
    pass


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # API Keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""

    # LLM Provider Settings
    # Note: These are environment variable overrides.
    # Default values come from models.llm_models.LLMModelRegistry
    llm_provider: str = "google"
    google_model: str = ""  # If empty, uses LLMModelRegistry.get_default(GOOGLE)
    anthropic_model: str = ""  # If empty, uses LLMModelRegistry.get_default(ANTHROPIC)
    ollama_model: str = ""  # If empty, uses LLMModelRegistry.get_default(OLLAMA)
    ollama_base_url: str = "http://localhost:11434"

    # Database
    database_url: str = "postgresql+asyncpg://aos:aos@localhost:5432/aos"
    use_database: bool = False

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    log_level: str = "INFO"

    # Orchestration
    max_iterations: int = 100
    default_model: str = ""  # If empty, uses LLMModelRegistry.get_default()

    # CORS - NoDecode prevents EnvSettingsSource from JSON-parsing before validator runs
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str] | object:
        """Handle JSON array, bracket-wrapped, comma-separated string, or list."""
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                try:
                    return json.loads(v)
                except json.JSONDecodeError:
                    # Shell source strips inner quotes: ["a","b"] → [a,b]
                    inner = v.strip("[]")
                    return [o.strip().strip("'\"") for o in inner.split(",") if o.strip()]
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # OAuth/JWT Settings
    session_secret_key: str = ""  # JWT signing key
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_token: str = ""  # Personal Access Token for GitHub API

    # Frontend URL for OAuth redirects
    frontend_url: str = "http://localhost:5173"

    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_default_tier: str = "free"

    # Audit
    audit_hash_chain_enabled: bool = True
    audit_retention_days: int = 2555  # 7 years for compliance

    # Cost Allocation
    cost_tracking_enabled: bool = True

    # SSO/SAML
    saml_sp_entity_id: str = ""
    saml_sp_acs_url: str = ""
    saml_idp_metadata_url: str = ""
    oidc_issuer_url: str = ""

    # Super Admins (comma-separated emails that always have admin role)
    super_admin_emails: str = ""

    # Password Hashing
    password_hash_algorithm: str = "bcrypt"
    bcrypt_rounds: int = 12

    # Encryption
    encryption_master_key: str = ""  # Hex-encoded 32+ byte key for AES-256 field encryption

    # Database TLS
    db_ssl_mode: str = ""  # e.g. "require", "verify-ca", "verify-full"
    db_ssl_cert_path: str = ""  # Path to CA cert for verify-ca / verify-full

    # Redis TLS
    redis_ssl: bool = False

    # Session TTL
    session_ttl_days: int = 7
    session_inactive_hours: int = 24

    # Qdrant Vector Database
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""  # Cloud deployment
    qdrant_prefer_grpc: bool = True

    # RAG Settings
    rag_enable_hybrid: bool = False
    rag_enable_rerank: bool = False
    rag_rerank_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    rag_full_context_threshold: int = 3000
    rag_candidate_multiplier: int = 3

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def get_model_for_provider(provider: str) -> str:
    """Get model for a provider, with Registry fallback.

    Uses environment variable if set, otherwise falls back to LLMModelRegistry.

    Args:
        provider: Provider name ('google', 'anthropic', 'openai', 'ollama')

    Returns:
        Model ID string
    """
    from models.llm_models import LLMModelRegistry, LLMProvider

    settings = get_settings()

    # Check environment variable override first
    if provider == "google" and settings.google_model:
        return settings.google_model
    elif provider == "anthropic" and settings.anthropic_model:
        return settings.anthropic_model
    elif provider == "ollama" and settings.ollama_model:
        return settings.ollama_model

    # Fallback to Registry default
    try:
        return LLMModelRegistry.get_default(LLMProvider(provider))
    except ValueError:
        return LLMModelRegistry.get_default()


def get_default_model() -> str:
    """Get the default model, with Registry fallback.

    Uses DEFAULT_MODEL env var if set, otherwise falls back to LLMModelRegistry.
    """
    from models.llm_models import LLMModelRegistry

    settings = get_settings()

    if settings.default_model:
        return settings.default_model

    return LLMModelRegistry.get_default()
