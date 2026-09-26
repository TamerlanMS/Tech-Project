from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/orgusers"
    jwt_secret: str = "dev-only-secret-change-me-in-production-0123456789"
    jwt_algorithm: str = "HS256"
    jwt_ttl_minutes: int = 60 * 12
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:8080"]
    sql_echo: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
