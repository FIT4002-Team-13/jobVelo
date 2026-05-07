"""CV analysis backed by Google Gemini.

Gemini's multimodal models accept PDF/image bytes directly, so the route
hands raw file bytes here without any pre-extraction step. This keeps the
service portable: switch the model and you can ingest different file types
without changing the route.
"""

from __future__ import annotations

import json
from typing import Any

from google import genai
from google.genai import types

from config import settings

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


_PROMPT = (
    "You are a senior recruiter analysing a candidate CV. "
    "Reply as JSON with keys: "
    "name (string|null), email (string|null), phone (string|null), "
    "summary (string), years_experience (number), "
    "skills (string[]), strengths (string[]), weaknesses (string[]), "
    "highlighted_roles (string[]), fit_score (0-100). "
    "Output valid JSON only — no markdown fences."
)


async def analyse_cv(
    file_bytes: bytes,
    mime_type: str,
    job_title: str | None = None,
) -> dict[str, Any]:
    role_hint = f"Target role: {job_title}.\n\n" if job_title else ""

    contents = [
        types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
        types.Part.from_text(text=role_hint + _PROMPT),
    ]

    res = await _get_client().aio.models.generate_content(
        model=settings.gemini_cv_model,
        contents=contents,
        config=types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )

    return json.loads((res.text or "{}").strip())
