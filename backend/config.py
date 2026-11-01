import secrets

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "jobvelo"
    cors_origins: str = "http://localhost:5173"

    # Set APP_ENV=production on the deployed server so a missing JWT_SECRET is a
    # startup error instead of a silent per-process random key.
    app_env: str = "development"

    # JWT - set JWT_SECRET in .env for any deployment beyond local dev.
    # In dev an empty value falls back to a per-process random key so tokens at
    # least don't survive a server restart (fine - login again). That fallback
    # is wrong for a real server (restarts and multiple workers would each
    # reject the others' tokens), so APP_ENV=production refuses to start
    # without one.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Deepgram — realtime STT for interview transcription.
    deepgram_api_key: str = ""
    deepgram_model: str = "nova-2"
    # Silence (ms) that ends an utterance. Deepgram finalizes phrase fragments
    # at every short pause; we buffer those and only flush a full sentence when
    # Deepgram reports speech_final, which it does after this much silence.
    # Higher = fewer, more complete sentences (better follow-up prompts) at the
    # cost of a little latency before a line lands.
    deepgram_endpointing_ms: int = 400

    # OpenAI — split into two models so realtime question generation can use
    # a fast/cheap model while end-of-interview summary/score uses a stronger one.
    openai_api_key: str = ""
    openai_question_model: str = "gpt-4o-mini"
    openai_analysis_model: str = "gpt-4o"

    # Realtime bias/appropriateness check on interviewer questions - kept as
    # its own setting (not reusing openai_question_model) so it can be tuned
    # or swapped independently of next-question generation.
    openai_bias_model: str = "gpt-4o-mini"

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

    @model_validator(mode="after")
    def _resolve_jwt_secret(self) -> "Settings":
        if not self.jwt_secret:
            if self.app_env.lower() == "production":
                raise ValueError(
                    "JWT_SECRET must be set when APP_ENV=production. Generate one "
                    'with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
                )
            self.jwt_secret = secrets.token_urlsafe(48)
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
