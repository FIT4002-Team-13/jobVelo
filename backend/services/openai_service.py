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
from typing import Any

from openai import AsyncOpenAI

from config import settings

_client: AsyncOpenAI | None = None


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


async def generate_interview_plan(
    job_title: str,
    job_description: str | None,
    candidate_name: str,
    cv_analysis: dict | None = None,
    total_minutes: int | None = None,
) -> list[dict]:
    """Return AI-suggested interview sections (name, description, suggested_minutes)."""
    desc_block = (
        f"\nJob description:\n{job_description[:1500]}" if job_description else ""
    )

    cv_block = ""
    if cv_analysis:
        parts = []
        if cv_analysis.get("summary"):
            parts.append(f"Summary: {cv_analysis['summary']}")
        if cv_analysis.get("years_experience") is not None:
            parts.append(f"Years of experience: {cv_analysis['years_experience']}")
        if cv_analysis.get("skills"):
            parts.append(f"Skills: {', '.join(cv_analysis['skills'])}")
        if cv_analysis.get("highlighted_roles"):
            parts.append(f"Past roles: {', '.join(cv_analysis['highlighted_roles'])}")
        if cv_analysis.get("strengths"):
            parts.append(f"Strengths: {', '.join(cv_analysis['strengths'])}")
        if cv_analysis.get("weaknesses"):
            parts.append(f"Weaknesses/gaps: {', '.join(cv_analysis['weaknesses'])}")
        if parts:
            cv_block = "\n\nCandidate CV analysis:\n" + "\n".join(parts)

    time_constraint = (
        f" The total of all suggested_minutes values must sum to exactly {total_minutes} minutes."
        if total_minutes
        else ""
    )
    prompt = (
        f"You are preparing an interview plan for {candidate_name} applying for the role of {job_title}.{desc_block}{cv_block}\n\n"
        "Generate 4 to 6 interview sections that a structured interview should cover for this role. "
        "Tailor sections to probe the candidate's specific background, skills, and any gaps identified above. "
        "For each section return: a short name (2-4 words), a one-sentence description of what to explore, "
        f"and a suggested duration in minutes (between 5 and 20).{time_constraint} "
        'Reply with valid JSON only — an array of objects with keys "name", "description", "suggested_minutes".'
    )

    res = await _get_client().chat.completions.create(
        model=settings.openai_analysis_model,
        messages=[
            {
                "role": "system",
                "content": "You are an expert interview coach. Reply with valid JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.5,
        max_tokens=600,
    )

    raw = json.loads(res.choices[0].message.content or "{}")
    # The model may wrap the array under a key — unwrap if needed.
    if isinstance(raw, list):
        return raw
    for v in raw.values():
        if isinstance(v, list):
            return v
    return []


async def score(transcript: str, job_title: str | None = None) -> dict[str, Any]:
    """Return a structured 0-100 score with sub-scores and reasoning."""
    role = job_title or "the role"
    res = await _get_client().chat.completions.create(
        model=settings.openai_analysis_model,
        messages=[
            {
                "role": "system",
                "content": "You score interview candidates. Reply with valid JSON only.",
            },
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
