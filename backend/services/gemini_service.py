"""CV / cover-letter analysis backed by Google Gemini.

Gemini's multimodal models accept PDF/image bytes directly, so the route
hands raw file bytes here without any pre-extraction step.

This module uses Gemini 2.5 Pro (configured in `settings.gemini_cv_model`)
with thinking enabled. We optimise for analysis depth - especially on
inconsistency detection across two documents - over token budget.

The response shape is described in English inside the prompt and we ask
for `response_mime_type="application/json"`; we deliberately do NOT pass
`response_schema=<types.Schema>` because google-genai 0.3.0 mishandles
that path (it treats Schema instances as Pydantic classes and tries to
re-derive a JSON schema with $ref / anyOf, which the API then rejects).
A clean Pydantic class on the route layer validates the LLM output, so
schema enforcement still happens - just one hop later.
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


# ── Prompt ──────────────────────────────────────────────────────────────
# Describes the JSON shape we want back. Paired with response_mime_type
# = "application/json" in the call below, which nudges Gemini away from
# markdown fences. Validation of the actual JSON shape happens on the
# route layer (routes.cv_analysis.CvAnalysisResponse).

_PROMPT = """
You are a senior recruiter analysing a candidate CV (and optional cover
letter) against a target position. Read all documents carefully and
return a single JSON object with this shape:

{
  "candidate_name": string | null,           // best guess from the CV
  "position_fit": {
    "relevant_experience": number,           // 0.0 - 10.0, one decimal
    "technical_fit":       number,
    "soft_skills":         number
  },
  "key_strengths": [                         // 2-5 items
    { "title": string, "detail": string }    // title <= 6 words; detail 1-2 sentences
  ],
  "improvements": [                          // 2-5 items, growth areas or gaps
    { "title": string, "detail": string }
  ],
  "inconsistencies": [                       // 0-5 items, empty list is fine
    { "title": string, "detail": string }    // contradictions or unexplained gaps
  ]
}

Rules:
- Output ONLY valid JSON. No prose, no markdown fences.
- `candidate_name`: best guess from the CV, or null if not found.
- Each `detail`: 1-2 sentences citing evidence from the documents -
  not generic advice.
- `inconsistencies`: ONLY include real CV/cover-letter contradictions or
  unexplained gaps - DO NOT pad with stylistic notes.
- When a Job Description is supplied, treat it as the SINGLE SOURCE OF
  TRUTH for fit scoring:
    * `relevant_experience` - alignment between past work and the JD's
      stated responsibilities / years-of-experience requirements.
    * `technical_fit` - overlap between the candidate's tech stack and
      the JD's required + nice-to-have skills.
    * `soft_skills` - alignment with the JD's collaboration / leadership
      / communication expectations.
    * `key_strengths` - resume points that match JD requirements; cite
      the JD-side requirement in the detail when possible.
    * `improvements` - JD requirements the candidate is missing or weak on.
    * `inconsistencies` - claims that contradict each other OR claims
      that don't square with the JD's reality.
- When NO Job Description is supplied, fall back to scoring against the
  position_title alone with industry-standard expectations; be
  conservative with high scores.
""".strip()


# ── Public API ──────────────────────────────────────────────────────────


async def analyse_cv(
    *,
    cv_bytes: bytes,
    cv_mime_type: str,
    cover_letter_bytes: bytes | None = None,
    cover_letter_mime_type: str | None = None,
    position_title: str,
    job_description: str | None = None,
) -> dict[str, Any]:
    """Run Gemini against the supplied documents and return the parsed JSON.

    `position_title` is required because the model needs something to
    benchmark fit against when no JD is supplied. `job_description`, when
    present, becomes the source of truth for scoring.
    """
    parts: list[types.Part] = [
        types.Part.from_bytes(data=cv_bytes, mime_type=cv_mime_type),
    ]
    if cover_letter_bytes and cover_letter_mime_type:
        parts.append(types.Part.from_bytes(
            data=cover_letter_bytes,
            mime_type=cover_letter_mime_type,
        ))

    # One compact header that gives the model: target role, doc count, JD
    # block (or "no JD" marker). Keeping this tight is the second biggest
    # input-token saving after dropping the schema description.
    jd_block = (
        f"JOB DESCRIPTION:\n{job_description.strip()}"
        if job_description and job_description.strip()
        else "JOB DESCRIPTION: (not provided - score against position_title only)"
    )
    header = (
        f"Target position: {position_title}\n"
        f"Documents attached: {len(parts)}\n"
        f"{jd_block}\n\n"
    )
    parts.append(types.Part.from_text(text=header + _PROMPT))

    # No thinking_config or output limits - Gemini 2.5 Pro is free to use
    # as many thinking tokens as it wants for richer reasoning, especially
    # on inconsistency detection across two documents.
    #
    # We deliberately don't set response_schema: in google-genai 0.3.0 it
    # mis-derives a Pydantic-flavoured JSON schema (with $ref / anyOf)
    # that the Gemini API then rejects. Shape adherence comes from the
    # prompt's explicit schema block + response_mime_type="application/json",
    # and the route layer re-validates the result via Pydantic anyway.
    res = await _get_client().aio.models.generate_content(
        model=settings.gemini_cv_model,
        contents=parts,
        config=types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )

    # response_schema constrains generation but doesn't give us a typed
    # `parsed` attribute (that requires a Pydantic class, which we can't
    # use because of the JSON-Schema dialect mismatch noted above). So we
    # parse the text ourselves - schema-constrained output is reliably
    # valid JSON, but we still guard against the unlikely failure case.
    raw = (res.text or "{}").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini returned non-JSON output: {e}") from e
