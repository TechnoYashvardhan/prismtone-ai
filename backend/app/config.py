"""
PrismTone Configuration
Centralized settings management using python-dotenv.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend folder
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)


def _normalize_model(name: str, default: str) -> str:
    raw = (name or default).strip()
    return raw if raw.startswith("models/") else f"models/{raw}"


class Settings:
    PROJECT_NAME: str = "PrismTone"
    VERSION: str = "1.1.0"
    API_PREFIX: str = "/api/v1"

    # Gemini AI Configuration (Primary + Fast Lite Failover)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL: str = _normalize_model(os.getenv("GEMINI_MODEL", ""), "models/gemini-3.6-flash")
    GEMINI_FALLBACK_MODEL: str = _normalize_model(
        os.getenv("GEMINI_FALLBACK_MODEL", ""), "models/gemini-3.5-flash-lite"
    )

    # Optional alternative providers
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "").strip()

    # Server configs
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1")

    # CORS Origins
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*"
    ]


settings = Settings()
