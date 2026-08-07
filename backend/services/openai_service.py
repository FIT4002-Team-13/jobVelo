"""Realtime LLM helpers backed by OpenAI.

Used during a live interview to:
  • generate the next interview question from the running transcript
  • summarise the interview so far
  • score the candidate against a job role

Each function is a single self-contained call so the WS handler can fan
them out without coupling to internal state.
"""

from __future__ import annotations

import json
import re
from typing import Any

from openai import AsyncOpenAI

from config import settings

_client: AsyncOpenAI | None = None


def _coerce_transcript_entries(transcript: list[dict[str, Any]] | str | None) -> list[dict[str, Any]]:
    """Normalise transcript payloads from the UI into a simple list of speaker/text entries."""
    if isinstance(transcript, str):
        entries = [line.strip() for line in transcript.splitlines() if line.strip()]
        return [{"speaker": "Transcript", "text": line} for line in entries]

    if not isinstance(transcript, list):
        return []

    normalized: list[dict[str, Any]] = []
    for item in transcript:
        if not isinstance(item, dict):
            continue
        text = item.get("text") or item.get("content") or item.get("message") or ""
        if not text:
            continue
        speaker = item.get("speaker") or item.get("role") or "Transcript"
        normalized.append({"speaker": str(speaker), "text": str(text)})
    return normalized


def _fallback_highlights(entries: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    """Generate deterministic highlights when OpenAI is unavailable or errors."""
    if not entries:
        return []

    primary_terms = [
        "latency",
        "performance",
        "improve",
        "improved",
        "reduce",
        "reduced",
        "experience",
        "migrated",
        "microservices",
        "architecture",
        "customer",
        "lead",
        "built",
        "launched",
        "shipping",
        "delivery",
        "scalable",
    ]

    candidates: list[str] = []
    for entry in entries:
        text = str(entry.get("text") or "").strip()
        if not text:
            continue
        for sentence in re.split(r"(?<=[.!?])\s+", text):
            clean = sentence.strip()
            if not clean:
                continue
            lowered = clean.lower()
            if any(term in lowered for term in primary_terms) or any(char.isdigit() for char in clean):
                candidates.append(clean)

    if not candidates:
        candidates = [str(entry.get("text") or "").strip() for entry in entries[:limit] if entry.get("text")]

    highlights: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in candidates[: limit * 2]:
        cleaned = re.sub(r"\s+", " ", raw).strip()
        if not cleaned:
            continue
        lower = cleaned.lower()
        if lower in seen:
            continue
        seen.add(lower)

        importance = 3
        if any(term in lower for term in primary_terms):
            importance = 4
        if any(char.isdigit() for char in cleaned):
            importance = 5

        if len(cleaned) > 140:
            cleaned = cleaned[:137].rsplit(" ", 1)[0] + "…"

        highlights.append({"text": cleaned, "importance": importance})
        if len(highlights) >= limit:
            break

    return highlights


def _get_client() -> AsyncOpenAI:
    """Lazy singleton — avoids constructing the client at import time so the
    app still boots when OPENAI_API_KEY isn't set (e.g. CV-only deployments)."""
    global _client
    if _client is None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY not configured")
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def generate_next_question(
    transcript: str,
    job_title: str | None = None,
    asked: list[str] | None = None,
) -> str:
    """Pick the single best follow-up question, given the conversation so far."""
    asked_block = ""
    if asked:
        asked_block = "Already asked:\n" + "\n".join(f"- {q}" for q in asked) + "\n\n"

    job_block = f"Role: {job_title}\n\n" if job_title else ""

    prompt = (
        f"{job_block}"
        f"{asked_block}"
        "Interview transcript so far:\n"
        f"{transcript}\n\n"
        "Suggest the single best next question to ask the candidate. "
        "Build on what they just said. Reply with just the question — no preamble."
    )

    res = await _get_client().chat.completions.create(
        model=settings.openai_question_model,
        messages=[
            {
                "role": "system",
                "content": "You are an expert technical interviewer. Keep questions focused and ask one at a time.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=120,
    )
    return (res.choices[0].message.content or "").strip()


async def summarise(transcript: str) -> str:
    res = await _get_client().chat.completions.create(
        model=settings.openai_analysis_model,
        messages=[
            {
                "role": "system",
                "content": "Summarise interview transcripts crisply: strengths, weaknesses, notable answers. Markdown bullets.",
            },
            {"role": "user", "content": transcript},
        ],
        temperature=0.3,
        max_tokens=600,
    )
    return (res.choices[0].message.content or "").strip()


async def score(transcript: str, job_title: str | None = None) -> dict[str, Any]:
    """Return a structured 0-100 score with sub-scores and reasoning."""
    role = job_title or "the role"
    res = await _get_client().chat.completions.create(
        model=settings.openai_analysis_model,
        messages=[
            {"role": "system", "content": "You score interview candidates. Reply with valid JSON only."},
            {
                "role": "user",
                "content": (
                    f"Score the candidate for {role}. Respond as JSON with keys: "
                    "overall (0-100), communication (0-100), technical (0-100), "
                    "culture_fit (0-100), reasoning (string).\n\n"
                    f"Transcript:\n{transcript}"
                ),
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=500,
    )
    return json.loads(res.choices[0].message.content or "{}")


async def extract_highlights(
    transcript: list[dict[str, Any]] | str | None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Extract a few notable phrases and their importance from a transcript."""
    entries = _coerce_transcript_entries(transcript)
    if not entries:
        return []

    if not settings.openai_api_key:
        return _fallback_highlights(entries, limit=limit)

    recent_entries = entries[-20:]
    transcript_text = "\n".join(
        f"{entry['speaker']}: {entry['text']}" for entry in recent_entries
    )

    try:
        res = await _get_client().chat.completions.create(
            model=settings.openai_analysis_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract key moments from a live interview transcript. "
                        "Return concise phrases the interviewer should notice, with a 1-5 importance score. "
                        "Respond with valid JSON only in the shape {\"highlights\": [{\"text\": ..., \"importance\": ...}]}."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Analyse the most important points from this interview transcript. "
                        "Prefer short, specific phrases rather than full sentences.\n\n"
                        f"Transcript:\n{transcript_text}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=400,
        )
        payload = json.loads(res.choices[0].message.content or "{}")
        highlights = payload.get("highlights") or []
        cleaned: list[dict[str, Any]] = []
        for item in highlights[:limit]:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            importance = item.get("importance", 3)
            try:
                importance_value = max(1, min(5, int(importance)))
            except (TypeError, ValueError):
                importance_value = 3
            cleaned.append({"text": text, "importance": importance_value})
        if cleaned:
            return cleaned
    except Exception:
        pass

    return _fallback_highlights(entries, limit=limit)
