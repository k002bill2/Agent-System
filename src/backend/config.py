"""Application configuration."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # API Keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""

    # LLM Provider Settings
    llm_provider: str = "google"
    google_model: str = "gemini-2.0-flash-exp"
    anthropic_model: str = "claude-sonnet-4-20250514"
    ollama_model: str = "qwen2.5:7b"
    ollama_base_url: str = "http://localhost:11434"

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/agent_orchestrator"
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
    default_model: str = "claude-sonnet-4-20250514"

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    # OAuth/JWT Settings
    session_secret_key: str = ""  # JWT signing key
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""

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

    # Password Hashing
    password_hash_algorithm: str = "bcrypt"
    bcrypt_rounds: int = 12

    # Session TTL
    session_ttl_days: int = 7
    session_inactive_hours: int = 24

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
