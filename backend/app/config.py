"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./medsavings.db"

    # OCR
    OCR_PROVIDER: str = "gemini_vision"  # "gemini_vision" or "tesseract"
    OCR_API_KEY: Optional[str] = None

    # Firecrawl
    FIRECRAWL_API_KEY: Optional[str] = None

    # LLM Providers
    GEMINI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    GROQ_API_KEY_FALLBACK_1: Optional[str] = None
    GROQ_API_KEY_FALLBACK_2: Optional[str] = None
    LM_STUDIO_API_KEY: str = "sk-lm-4UrVEiYR:UjWVfwWSSYLWP6UnRALM"
    LM_STUDIO_BASE_URL: str = "http://localhost:1234/v1"

    # LLM Models
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_MODEL_FALLBACK: str = "llama-3.1-8b-instant"
    GEMINI_MODEL: str = "gemini-3.1-flash-lite-preview"
    GEMINI_MODEL_FALLBACK: str = "gemini-3.5-flash-lite"
    LM_STUDIO_MODEL: str = "granite-4.1-3b-tng-claude-coder-xlam-heretic-hi-mlx"
    LM_STUDIO_MODEL_VL: str = "llama-3.2-3b-instruct"

    # Frontend URL (for CORS)
    FRONTEND_URL: str = "http://localhost:3000"

    # Cache TTL (seconds)
    COMPOSITION_CACHE_TTL: int = 604800  # 7 days
    PRICE_CACHE_TTL: int = 604800        # 7 days

    # Concurrency & Rate Limiting
    MAX_CONCURRENT_REQUESTS: int = 2
    RATE_LIMIT_DELAY: float = 1.5  # seconds between requests
    LLM_SHOTS_PER_MODEL: int = 5   # 5 shots per model (4 models * 5 shots = 20 calls)
    GEMINI_MAX_CONCURRENT: int = 1 # strict Gemini concurrency
    GEMINI_CALL_DELAY: float = 2.0 # minimum delay between Gemini calls to prevent 429

    # File upload
    MAX_FILE_SIZE_MB: int = 10
    UPLOAD_DIR: str = "./uploads"

    # App
    APP_NAME: str = "Medicine Savings Intelligence"
    DEBUG: bool = False

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    def ensure_upload_dir(self) -> None:
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)


settings = Settings()
