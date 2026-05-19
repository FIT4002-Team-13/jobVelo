"""CV / cover-letter analysis route.

One endpoint: POST /api/cv-analysis. Takes a multipart payload with the
CV PDF (required), an optional cover-letter PDF, and the position the
candidate is applying for. Returns a structured analysis ready to render
in the CV Analysis page on the frontend.

The PDFs themselves are also saved under uploads/cv_analyses/ so the
frontend can preview them via the existing /api/files endpoint - we
return the storage paths in the response alongside the analysis.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from services.file_storage import save_upload
from services.gemini_service import analyse_cv

router = APIRouter(prefix="/api/cv-analysis", tags=["cv-analysis"])


# ---------- response shape (mirror of the Gemini output) ------------------


class PositionFit(BaseModel):
    relevant_experience: float = 0.0
    technical_fit:       float = 0.0
    soft_skills:         float = 0.0


class AnalysisBullet(BaseModel):
    title: str
    detail: str


class CvAnalysisResponse(BaseModel):
    candidate_name:  str | None = None
    position_title:  str
    position_fit:    PositionFit
    key_strengths:   list[AnalysisBullet] = []
    improvements:    list[AnalysisBullet] = []
    inconsistencies: list[AnalysisBullet] = []
    # Storage paths so the frontend can render a preview via /api/files/<path>.
    cv_path:         str
    cover_letter_path: str | None = None


# ---------- helpers ------------------------------------------------------


_ALLOWED_PDF_MIME = {"application/pdf"}


def _validate_pdf(upload: UploadFile, label: str) -> None:
    """Reject non-PDF uploads cleanly so the LLM never sees junk bytes."""
    if upload.content_type not in _ALLOWED_PDF_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} must be a PDF (got {upload.content_type or 'unknown'}).",
        )


# ---------- route --------------------------------------------------------


@router.post(
    "",
    response_model=CvAnalysisResponse,
    summary="Analyse a CV (and optional cover letter) against a target position.",
)
async def analyse(
    cv:              Annotated[UploadFile, File(description="Candidate CV PDF")],
    position_title:  Annotated[str,        Form(min_length=1, max_length=120)],
    cover_letter:    Annotated[UploadFile | None, File()] = None,
    # Optional but heavily recommended. When supplied, the Gemini prompt
    # uses it as the source of truth for scoring + bullet grounding (see
    # services.gemini_service for the full rules).
    job_description: Annotated[str | None,  Form(max_length=10_000)] = None,
) -> CvAnalysisResponse:
    _validate_pdf(cv, "CV")
    if cover_letter is not None and cover_letter.filename:
        _validate_pdf(cover_letter, "Cover letter")
    else:
        cover_letter = None  # treat empty multipart as not-sent

    # Read both files into memory once so we can both save them to disk and
    # pass them to Gemini without re-reading the stream.
    cv_bytes = await cv.read()
    cl_bytes = await cover_letter.read() if cover_letter else None

    # Persist for preview. The exact filename doesn't matter - we keep a
    # uuid per request so concurrent uploads can't collide.
    # save_upload calls .read() again, so rewind the stream first; UploadFile
    # exposes an async .seek() that works whether the body is in memory or
    # spooled to a temp file.
    request_id = uuid.uuid4().hex
    await cv.seek(0)
    cv_path = await save_upload(cv, subdir="cv_analyses", key=f"{request_id}-cv")
    cl_path: str | None = None
    if cover_letter is not None:
        await cover_letter.seek(0)
        cl_path = await save_upload(cover_letter, subdir="cv_analyses", key=f"{request_id}-cl")

    # Hand off to Gemini.
    try:
        result = await analyse_cv(
            cv_bytes=cv_bytes,
            cv_mime_type=cv.content_type or "application/pdf",
            cover_letter_bytes=cl_bytes,
            cover_letter_mime_type=(cover_letter.content_type if cover_letter else None),
            position_title=position_title,
            job_description=job_description,
        )
    except RuntimeError as e:
        # Gemini misconfig (no API key) or non-JSON output - bubble up as 502.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e)) from e

    # Merge LLM result with our local fields. position_title is taken from
    # the form rather than the LLM so it always matches what the user typed.
    return CvAnalysisResponse(
        candidate_name=result.get("candidate_name"),
        position_title=position_title,
        position_fit=PositionFit(**(result.get("position_fit") or {})),
        key_strengths=[AnalysisBullet(**b) for b in (result.get("key_strengths") or [])],
        improvements=[AnalysisBullet(**b) for b in (result.get("improvements") or [])],
        inconsistencies=[AnalysisBullet(**b) for b in (result.get("inconsistencies") or [])],
        cv_path=cv_path,
        cover_letter_path=cl_path,
    )
