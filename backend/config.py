"""
Configuration settings for Tally 7.1 + OpenRouter / Gemini Assistant backend.
Reads from local .env file.
"""
import os
from typing import Optional

TALLY_URL: str = os.getenv("TALLY_URL", "http://localhost:9000")
TALLY_TIMEOUT_SECONDS: int = int(os.getenv("TALLY_TIMEOUT_SECONDS", "10"))

# OpenRouter Configuration (Primary)
OPENROUTER_API_KEY: Optional[str] = os.getenv("OPENROUTER_API_KEY", None)
OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
AI_PROVIDER: str = os.getenv("AI_PROVIDER", "openrouter").lower()

# Gemini API Configuration (Fallback)
GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY", None)
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

TALLY_WRITE_ENABLED: bool = os.getenv("TALLY_WRITE_ENABLED", "false").lower() in ("true", "1", "yes")
HOST: str = os.getenv("HOST", "127.0.0.1")
PORT: int = int(os.getenv("PORT", "8000"))
TARGET_COMPANY: str = os.getenv("TARGET_COMPANY", "Chinar Resort & Spa Pvt Ltd. ACUTAL")
MOCK_FALLBACK: bool = os.getenv("MOCK_FALLBACK", "true").lower() in ("true", "1", "yes")
