from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    internal_service_token: str = "dev-token-change-in-production"
    marcai_api_url: str = "http://localhost:5000"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_prefix: str = "marcai"

    evolution_api_url: str = "http://localhost:8080"
    evolution_api_key: str = ""

    ia_service_port: int = 8000
    sentry_dsn: str | None = None
    openai_api_key: str | None = None


settings = Settings()
