import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "jobvelo"
    cors_origins: str = "http://localhost:5173"

    # JWT — set JWT_SECRET in .env for any deployment beyond local dev.
    # In dev we fall back to a per-process random key so tokens at least
    # don't survive a server restart (which is fine — login again).
    jwt_secret: str = secrets.token_urlsafe(48)
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Deepgram — realtime STT for interview transcription.
    deepgram_api_key: str = ""
    deepgram_model: str = "nova-2"

    # OpenAI — split into two models so realtime question generation can use
    # a fast/cheap model while end-of-interview summary/score uses a stronger one.
    openai_api_key: str = ""
    openai_question_model: str = "gpt-4o-mini"
    openai_analysis_model: str = "gpt-4o"

    # Gemini — CV analysis. Multimodal model so we can ingest PDFs directly.
    # The "-latest" aliases track Google's current models; pinned versions
    # (e.g. gemini-2.5-*) 404 for API keys created after their retirement.
    gemini_api_key: str = ""
    gemini_cv_model: str = "gemini-flash-latest"

    # Where uploaded files (company logos today; CVs etc. later) are stored.
    # Relative paths resolve against the backend working directory. Swap the
    # implementation in services/file_storage.py to move to S3 later.
    uploads_dir: str = "uploads"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
