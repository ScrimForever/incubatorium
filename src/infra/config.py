import os
from pathlib import Path

from pydantic import PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV = os.getenv("ENV", "development")
env_file = f".env.{ENV}"

if not Path(env_file).exists():
    raise FileNotFoundError(f"Arquivo de configuração '{env_file}' não encontrado.")


class Settings(BaseSettings):
    pg_user: str = "postgres"
    pg_password: str = ""
    pg_host: str = "localhost"
    pg_port: int = 5432
    pg_database_name: str = "tecincubadora"
    secret_key: str = ""
    resend_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=env_file if ENV == "development" else None,
        env_file_encoding="utf-8",
    )

    @computed_field
    @property
    def pg_dsn(self) -> PostgresDsn:
        return PostgresDsn(
            f"postgresql+asyncpg://{self.pg_user}:{self.pg_password}@{self.pg_host}:{self.pg_port}/{self.pg_database_name}"
        )


settings = Settings()
