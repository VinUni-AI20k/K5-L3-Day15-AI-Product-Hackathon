from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình app FastAPI. Model AI KHÔNG cấu hình ở đây: mọi lần gọi model
    đi qua codebase/ai.py::call_model (đọc MODEL_PROVIDER, MODEL_NAME, API_KEY từ .env của khung)."""
    APP_NAME: str = "Travel Planner API"
    DEBUG: bool = False

    DATABASE_URL: str
    REDIS_URL: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache()
def get_settings() -> Settings:
    return Settings()
