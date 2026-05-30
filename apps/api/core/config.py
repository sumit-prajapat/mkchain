from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    environment: str = "development"
    debug: bool = False
    api_version: str = "v1"

    # Database
    database_url: str = "postgresql://mkchain:mkchain123@localhost:5432/mkchain"

    # CORS
    frontend_url: str = "http://localhost:3000"

    # Auth (Supabase JWT HS256)
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    require_auth: bool = False

    # Blockchain APIs
    etherscan_api_key: str = ""
    blockcypher_token: str = ""
    groq_api_key: str = ""

    @property
    def cors_origins(self) -> list[str]:
        origins = ["http://localhost:5173", "http://localhost:3000"]
        if self.frontend_url and self.frontend_url not in origins:
            origins.append(self.frontend_url)
        return origins

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
