"""CV / cover-letter analysis route.

The endpoint is keyed by `jobcand_id` (the job-candidate link). One analysis
exists per link. When an analysis already exists for that link, every
endpoint serves the cached document instead of re-running Gemini - cheap
to read, free to render, and idempotent for the user.

Endpoints:
  POST   /api/cv-analysis                       - create or return cached
  GET    /api/cv-analysis/by-jobcand/{id}      - read existing, 404 if none
  DELETE /api/cv-analysis/{analysis_id}        - delete (lets user re-upload)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status

from database import get_db
from models.cv_analysis import (
    CvAnalysisBullet,
    CvAnalysisOut,
    CvAnalysisPositionFit,
    CvAnalysisQuestion,
)
from services.file_storage import delete_upload, save_upload
from services.gemini_service import analyse_cv

router = APIRouter(prefix="/api/cv-analysis", tags=["cv-analysis"])


# ---------- helpers ------------------------------------------------------


_ALLOWED_PDF_MIME = {"application/pdf"}


def _validate_pdf(upload: UploadFile, label: str) -> None:
    """Reject non-PDF uploads cleanly so the LLM never sees junk bytes."""
    if upload.content_type not in _ALLOWED_PDF_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} must be a PDF (got {upload.content_type or 'unknown'}).",
        )


def _serialise(doc: dict, *, cached: bool = False) -> CvAnalysisOut:
    """Mongo doc → public API model.

    Tolerant of older / partial docs: missing keys fall back to safe
    defaults rather than 500-ing the response. The `cached` flag is set
    by the caller (True when we hit the cache, False on fresh generation).
    """
    # Ignore any interview_questions doc entry that doesn't match the
    # enum'd shape (Pydantic would 500 the response on a bad category).
    _valid_questions = []
    for q in (doc.get("interview_questions") or []):
        try:
            _valid_questions.append(CvAnalysisQuestion(**q))
        except Exception:
            continue

    return CvAnalysisOut(
        analysis_id=str(doc["_id"]),
        jobcand_id=doc["jobcand_id"],
        candidate_name=doc.get("candidate_name"),
        position_title=doc.get("position_title") or "",
        position_fit=CvAnalysisPositionFit(**(doc.get("position_fit") or {})),
        key_strengths=[CvAnalysisBullet(**b) for b in (doc.get("key_strengths") or [])],
        improvements=[CvAnalysisBullet(**b) for b in (doc.get("improvements") or [])],
        inconsistencies=[CvAnalysisBullet(**b) for b in (doc.get("inconsistencies") or [])],
        interview_questions=_valid_questions,
        cv_path=doc["cv_path"],
        cover_letter_path=doc.get("cover_letter_path"),
        created_at=doc["created_at"],
        cached=cached,
    )


async def _lookup_jobcand_context(jobcand_id: str) -> tuple[dict, dict, dict]:
    """Resolve a jobcand_id to (link, job, candidate). Raises 404 if any
    of the three are missing - the chain has to be intact for an analysis
    to make sense.
    """
    if not ObjectId.is_valid(jobcand_id):
        raise HTTPException(status_code=400, detail="Invalid jobcand_id")

    db = get_db()
    link = await db.job_candidates.find_one({"_id": ObjectId(jobcand_id)})
    if not link:
        raise HTTPException(status_code=404, detail="Job-candidate link not found")

    # `cand_id` and `job_id` on the link doc are stored as STRINGS (see
    # cand.py's create_candidate_for_job) - we cast to ObjectId here to
    # look up the matching jobs/candidates rows.
    job_oid = ObjectId(link["job_id"]) if ObjectId.is_valid(link.get("job_id", "")) else None
    cand_oid = ObjectId(link["cand_id"]) if ObjectId.is_valid(link.get("cand_id", "")) else None

    job = await db.jobs.find_one({"_id": job_oid}) if job_oid else None
    candidate = await db.candidates.find_one({"_id": cand_oid}) if cand_oid else None

    if not job:
        raise HTTPException(status_code=404, detail="Job referenced by this link is missing")
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate referenced by this link is missing")

    return link, job, candidate


# ---------- POST: create or return cached ------------------------------


@router.post(
    "",
    response_model=CvAnalysisOut,
    summary="Analyse a CV for a job-candidate link. Returns cached record if one exists.",
)
async def analyse(
    jobcand_id:  Annotated[str,        Form(min_length=1)],
    cv:          Annotated[UploadFile | None, File(description="Candidate CV PDF")] = None,
    cover_letter: Annotated[UploadFile | None, File()] = None,
) -> CvAnalysisOut:
    """Cache-first: if an analysis already exists for this jobcand_id, return
    it without touching Gemini. Otherwise the caller MUST supply a CV PDF,
    we run the LLM, save the result, and return.
    """
    db = get_db()

    # 1. Cache check. Cheap query, runs before anything destructive.
    cached_doc = await db.cv_analyses.find_one({"jobcand_id": jobcand_id})
    if cached_doc:
        return _serialise(cached_doc, cached=True)

    # 2. No cache hit. CV is required to generate a new analysis.
    if cv is None or not cv.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No existing analysis for this job-candidate. Upload a CV PDF to generate one.",
        )
    _validate_pdf(cv, "CV")
    if cover_letter is not None and cover_letter.filename:
        _validate_pdf(cover_letter, "Cover letter")
    else:
        cover_letter = None

    # 3. Look up the job + candidate from the link so the LLM gets a real
    #    position title + job description + has a name to anchor against.
    link, job, candidate = await _lookup_jobcand_context(jobcand_id)
    position_title  = job.get("title") or "Untitled role"
    job_description = job.get("description") or None
    candidate_name  = candidate.get("cand_full_name") or candidate.get("name")

    # 4. Read bytes into memory once for both the disk save and the LLM call.
    cv_bytes = await cv.read()
    cl_bytes = await cover_letter.read() if cover_letter else None

    request_id = uuid.uuid4().hex
    await cv.seek(0)
    cv_path = await save_upload(cv, subdir="cv_analyses", key=f"{request_id}-cv")
    cl_path: str | None = None
    if cover_letter is not None:
        await cover_letter.seek(0)
        cl_path = await save_upload(cover_letter, subdir="cv_analyses", key=f"{request_id}-cl")

    # 5. Call Gemini.
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
        # Clean up uploaded files on failure so we don't leave orphans.
        delete_upload(cv_path)
        if cl_path:
            delete_upload(cl_path)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e)) from e

    # 6. Persist. Prefer the candidate doc's name over the LLM's read - the
    #    DB is more authoritative than the LLM's guess at the same field.
    now = datetime.now(timezone.utc)
    doc: dict = {
        "jobcand_id":        jobcand_id,
        "comp_id":           str(candidate.get("comp_id") or job.get("comp_id") or ""),
        "candidate_name":    candidate_name or result.get("candidate_name"),
        "position_title":    position_title,
        "position_fit":        result.get("position_fit") or {},
        "key_strengths":       result.get("key_strengths") or [],
        "improvements":        result.get("improvements") or [],
        "inconsistencies":     result.get("inconsistencies") or [],
        "interview_questions": result.get("interview_questions") or [],
        "cv_path":             cv_path,
        "cover_letter_path":   cl_path,
        "created_at":        now,
    }
    inserted = await db.cv_analyses.insert_one(doc)
    doc["_id"] = inserted.inserted_id
    return _serialise(doc, cached=False)


# ---------- GET: read existing -----------------------------------------


@router.get(
    "/by-jobcand/{jobcand_id}",
    response_model=CvAnalysisOut,
    summary="Fetch the existing analysis for a job-candidate link.",
)
async def get_by_jobcand(jobcand_id: str) -> CvAnalysisOut:
    """Pure read. Returns 404 when no analysis has been generated yet -
    the frontend uses this to decide whether to show the upload form or
    the result page directly."""
    db = get_db()
    doc = await db.cv_analyses.find_one({"jobcand_id": jobcand_id})
    if not doc:
        raise HTTPException(status_code=404, detail="No analysis exists for this job-candidate")
    return _serialise(doc, cached=True)


# ---------- DELETE ------------------------------------------------------


@router.delete(
    "/{analysis_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete an analysis record. The user can then upload a different CV.",
)
async def delete_analysis(analysis_id: str):
    """Removes the analysis doc AND the PDFs it owns. The job-candidate
    link itself is untouched - this is just clearing the analysis."""
    if not ObjectId.is_valid(analysis_id):
        raise HTTPException(status_code=400, detail="Invalid analysis id")

    db = get_db()
    doc = await db.cv_analyses.find_one_and_delete({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Best-effort cleanup. We don't fail the request if a file is already
    # gone - the DB row is the source of truth.
    if doc.get("cv_path"):
        delete_upload(doc["cv_path"])
    if doc.get("cover_letter_path"):
        delete_upload(doc["cover_letter_path"])
