"""Application configuration."""
import json
import secrets
import warnings
from pathlib import Path
from typing import Any

from pydantic import AnyHttpUrl, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"

# Weak secrets that should never be used in production
WEAK_SECRETS = {
    "dev-secret-change-me",
    "secret",
    "password",
    "changeme",
    "CHANGE_ME_GENERATE_A_SECURE_KEY",
    "",
}


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_PATH,
        case_sensitive=True,
        extra="ignore",
    )

    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Van Pooling Platform"
    VERSION: str = "0.1.0"
    DESCRIPTION: str = (
        "Backend-first MVP for demand-responsive corporate van pooling."
    )

    BACKEND_CORS_ORIGINS: list[AnyHttpUrl | str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:19006",
            "http://127.0.0.1:19006",
            "http://localhost:8081",
            "http://127.0.0.1:8081",
            "http://localhost:8082",
            "http://127.0.0.1:8082",
            "http://localhost:7357",
            "http://127.0.0.1:7357",
            "http://localhost",
        ]
    )

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "vanpool"
    POSTGRES_PASSWORD: str = Field(default="vanpool_dev_only")
    POSTGRES_DB: str = "vanpool_db"
    DATABASE_URL: str | None = "sqlite:///./vanpool.db"

    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT_SECRET_KEY must be explicitly set - no insecure default
    JWT_SECRET_KEY: str = Field(default="")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    GOOGLE_MAPS_API_KEY: str = "not-configured"
    GOOGLE_MAPS_BROWSER_API_KEY: str | None = None
    GOOGLE_MAPS_MAP_ID: str = "DEMO_MAP_ID"
    GOOGLE_MAPS_REGION: str = "IN"
    GOOGLE_MAPS_LANGUAGE: str = "en-US"
    GOOGLE_MAPS_USE_TRAFFIC: bool = True

    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-5.4-mini"
    OPENAI_REASONING_EFFORT: str = "low"
    OPENAI_TIMEOUT_SECONDS: int = 25

    MATCHING_AGGREGATION_WINDOW_SECONDS: int = 90
    MATCHING_PICKUP_RADIUS_METERS: int = 800
    MATCHING_ENABLE_RADIUS_FALLBACK: bool = True
    MATCHING_FALLBACK_PICKUP_RADIUS_METERS: int = 12000
    MATCHING_ALLOW_STALE_HEARTBEAT_FALLBACK: bool = True
    MATCHING_DESTINATION_CLUSTER_RADIUS_METERS: int = 1200
    MATCHING_MAX_DETOUR_MINUTES: int = 15
    MATCHING_MAX_EXTRA_DISTANCE_METERS: int = 5000
    MATCHING_SCHEDULE_COMPATIBILITY_MINUTES: int = 20
    MATCHING_STALE_DRIVER_HEARTBEAT_SECONDS: int = 120
    MATCHING_RECOVERY_GRACE_SECONDS: int = 30
    MATCHING_SCORE_PICKUP_WEIGHT: float = 0.40
    MATCHING_SCORE_DESTINATION_WEIGHT: float = 0.30
    MATCHING_SCORE_DETOUR_WEIGHT: float = 0.20
    MATCHING_SCORE_READINESS_WEIGHT: float = 0.10
    VAN_STALE_ALERT_SECONDS: int = 180
    DRIVER_ARRIVAL_THRESHOLD_METERS: int = 120
    DISPATCH_WORKER_INTERVAL_SECONDS: int = 15
    SCHEDULED_RIDE_DISPATCH_LEAD_MINUTES: int = 15
    SCHEDULED_RIDE_UNMATCHED_ALERT_MINUTES: int = 10
    RECURRING_RIDE_LOOKAHEAD_MINUTES: int = 30
    DRIVER_SHIFT_DEFAULT_HOURS: int = 9

    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    ENVIRONMENT: str = "development"
    DEBUG: bool = False  # Default to False for security - must explicitly enable
    LOG_LEVEL: str = "INFO"

    DEFAULT_VAN_CAPACITY: int = 8
    DEFAULT_OPERATING_HOURS_START: str = "07:00"
    DEFAULT_OPERATING_HOURS_END: str = "22:00"

    ENABLE_PUSH_NOTIFICATIONS: bool = False
    ENABLE_SMS_NOTIFICATIONS: bool = False
    ENABLE_EMAIL_NOTIFICATIONS: bool = True

    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_HOUR: int = 1000
    AUTO_RUN_MIGRATIONS: bool = True

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, value: Any) -> list[str] | Any:
        if isinstance(value, str):
            if value.startswith("["):
                return json.loads(value)
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("OPENAI_API_KEY", mode="before")
    @classmethod
    def normalize_openai_api_key(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value

        normalized = value.strip().strip('"').strip("'")
        if normalized.lower().startswith("bearer "):
            normalized = normalized[7:].strip()
        if normalized.startswith("-sk-"):
            normalized = normalized[1:]
        return normalized or None

    @property
    def sqlalchemy_database_uri(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def is_sqlite(self) -> bool:
        return self.sqlalchemy_database_uri.startswith("sqlite")

    @property
    def google_maps_browser_key(self) -> str:
        return self.GOOGLE_MAPS_BROWSER_API_KEY or self.GOOGLE_MAPS_API_KEY

    @property
    def google_maps_enabled(self) -> bool:
        return self.GOOGLE_MAPS_API_KEY not in {"", "not-configured"}

    @property
    def openai_enabled(self) -> bool:
        return bool(self.OPENAI_API_KEY)

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        """Validate security-critical settings."""
        # Check JWT secret
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY.lower() in WEAK_SECRETS:
            if self.ENVIRONMENT == "production":
                raise ValueError(
                    "JWT_SECRET_KEY must be set to a secure value in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
                )
            # Auto-generate for development only
            self.JWT_SECRET_KEY = secrets.token_urlsafe(64)
            warnings.warn(
                "JWT_SECRET_KEY not configured - using auto-generated key. "
                "This is only acceptable for development.",
                UserWarning,
                stacklevel=2,
            )

        # Minimum secret length check
        if len(self.JWT_SECRET_KEY) < 32:
            if self.ENVIRONMENT == "production":
                raise ValueError(
                    "JWT_SECRET_KEY must be at least 32 characters in production."
                )
            warnings.warn(
                f"JWT_SECRET_KEY is only {len(self.JWT_SECRET_KEY)} characters. "
                "Use at least 32 characters for security.",
                UserWarning,
                stacklevel=2,
            )

        # Warn about debug mode
        if self.DEBUG and self.ENVIRONMENT == "production":
            warnings.warn(
                "DEBUG is enabled in production environment. This is a security risk!",
                UserWarning,
                stacklevel=2,
            )

        return self


settings = Settings()
