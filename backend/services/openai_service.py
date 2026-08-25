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

from models.interview import TranscriptEntry
from models.job_candidate import (CandidateRatings, RatingEvidence, SkillName, SkillRating)

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

async def rate_candidate_skills(transcript: list[TranscriptEntry], job_title: str | None = None, job_description: str | None = None, candidate_name: str | None = None) -> CandidateRatings:

    # remove empty and unfinished live transcript entries.
    final_entries = [
        entry
        for entry in transcript
        if entry.text.strip()
        and not entry.id.startswith("partial-")
    ]

    if not final_entries:
        raise ValueError(
            "A completed transcript entry is required to generate ratings."
        )

    role = job_title or "the advertised role"
    description = (job_description or "No job description was provided.").strip()
    candidate = candidate_name or "Candidate"
    candidate_labels = {candidate.casefold(), "candidate", "interviewee",}

    candidate_entries = [
        entry
        for entry in final_entries
        if entry.speaker.strip().casefold() in candidate_labels
    ]

    transcript_text = "\n".join(
        (
            f"[{entry.id}] "
            f"{entry.speaker} "
            f"({entry.timestamp}): "
            f"{entry.text.strip()}"
        )
        for entry in final_entries
    )

    candidate_entry_ids = (", ".join(entry.id for entry in candidate_entries) or "none")

    json_format = """
        {
            "technical_skills": {
                "score": 7,
                "evidence_entry_ids": ["3"]
            },
            "communication": {
                "score": 7,
                "evidence_entry_ids": ["3"]
            },
            "problem_solving": {
                "score": 7,
                "evidence_entry_ids": ["5"]
            }
        }
        """

    prompt = (
        f"Role: {role}\n"
        f"Job description: {description}\n"
        f'Candidate speaker: "{candidate}"\n\n'
        "This interview has finished. Provide the candidate's final rating from 1 to 10 for exactly these skills:\n"
        "Technical Skills\n"
        "Communication\n"
        "Problem Solving\n"
        "Only use skills demonstrated in the candidate's answers."
        "If the candidate didn't demonstrate a skill, give a score of 0 and explain why."
        f"Return valid JSON using this format:\n{json_format}\n"
        "For each skill, provide the top 3 most relevant transcript entry as evidence for the score. if theres no 3 then provide as many as you can as long as it is relevant. "
        "Ids that support the rating. "
        f"The candidate entry Ids are: {candidate_entry_ids}.\n\n"
        f"Full interview transcript:\n{transcript_text}"
    )

    response = await _get_client().chat.completions.create(
        model=settings.openai_analysis_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an impartial interview evaluator. "
                    "Only evaluate skills demonstrated by the candidate. "
                    "Do not infer protected personal characteristics. "
                    "Return valid JSON only."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=900,
    )

    raw_result = json.loads(response.choices[0].message.content or "{}")

    candidate_entries_by_id = {
        entry.id: entry
        for entry in candidate_entries
    }

    def build_skill_rating(result_key: str, skill_name: SkillName) -> SkillRating:
        result = raw_result.get(result_key)

        if not isinstance(result, dict):
            result = {}

        try:
            score = float(result.get("score", 5))
        except (TypeError, ValueError):
            score = 5.0

        score = round(min(10.0, max(1.0, score)), 1)

        evidence_ids = result.get("evidence_entry_ids", [])

        if not isinstance(evidence_ids, list):
            evidence_ids = []

        evidence: list[RatingEvidence] = []

        for entry_id in evidence_ids[:3]:
            transcript_entry = candidate_entries_by_id.get(
                str(entry_id)
            )

            if transcript_entry is None:
                continue

            evidence.append(RatingEvidence(transcript_entry_id=transcript_entry.id, speaker=transcript_entry.speaker, timestamp=transcript_entry.timestamp, text=transcript_entry.text))
        return SkillRating(skill=skill_name, score=score, evidence=evidence)

    return CandidateRatings(
        technical_skills=build_skill_rating(
            "technical_skills",
            "Technical Skills",
        ),
        communication=build_skill_rating(
            "communication",
            "Communication",
        ),
        problem_solving=build_skill_rating(
            "problem_solving",
            "Problem Solving",
        ),
    )


