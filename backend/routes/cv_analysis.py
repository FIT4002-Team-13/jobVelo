"""CV / cover-letter analysis route.

The endpoint is keyed by `jobcand_id` (the job-candidate link). One analysis
exists per link.

Processing is asynchronous: POST validates + stores the files, inserts the
analysis doc with status="processing", and returns immediately. A FastAPI
background task then runs Gemini and flips the doc to "completed" (or
"failed" with an error message). The frontend polls GET /by-jobcand until
the status leaves "processing" - this is what drives the loading state on
the candidate page's "View" button.

POST semantics per existing doc state:
  - "processing"                    -> return the doc as-is (no double-run)
  - any state, no CV file attached  -> return the doc as-is (cached read)
  - "completed"/"failed" + new CV   -> replace: old doc + files are deleted
                                       and a fresh analysis is started

Endpoints:
  POST   /api/cv-analysis                       - start (or return existing)
  GET    /api/cv-analysis/by-jobcand/{id}      - read existing, 404 if none
  DELETE /api/cv-analysis/{analysis_id}        - delete (lets user re-upload)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from pymongo.errors import DuplicateKeyError

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

# A doc stuck in "processing" longer than this is reported as failed - the
# server likely restarted mid-run and the background task died with it.
_PROCESSING_TIMEOUT = timedelta(minutes=10)


# ---------- helpers ------------------------------------------------------


_ALLOWED_PDF_MIME = {"application/pdf"}


def _validate_pdf(upload: UploadFile, label: str) -> None:
    """Reject non-PDF uploads cleanly so the LLM never sees junk bytes."""
    if upload.content_type not in _ALLOWED_PDF_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} must be a PDF (got {upload.content_type or 'unknown'}).",
        )


def _effective_status(doc: dict) -> tuple[str, str | None]:
    """Resolve (status, error) for a doc, downgrading stale "processing"
    docs to "failed" so a crashed background task can't strand the UI in
    an eternal spinner. Docs from before the async rework have no status
    field at all - they were written synchronously, so they're complete.
    """
    doc_status = doc.get("status") or "completed"
    error = doc.get("error")
    if doc_status == "processing":
        created = doc.get("created_at")
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - created > _PROCESSING_TIMEOUT:
                return "failed", "Analysis timed out. Re-upload the CV to retry."
    return doc_status, error


def _serialise(doc: dict, *, cached: bool = False) -> CvAnalysisOut:
    """Mongo doc → public API model.

    Tolerant of older / partial docs: missing keys fall back to safe
    defaults rather than 500-ing the response. The `cached` flag is set
    by the caller (True when we hit the cache, False on fresh generation).
    """
    # Ignore any interview_questions doc entry that doesn't match the
    # enum'd shape (Pydantic would 500 the response on a bad category).
    _valid_questions = []
    for q in doc.get("interview_questions") or []:
        try:
            _valid_questions.append(CvAnalysisQuestion(**q))
        except Exception:
            continue

    doc_status, error = _effective_status(doc)

    return CvAnalysisOut(
        analysis_id=str(doc["_id"]),
        jobcand_id=doc["jobcand_id"],
        status=doc_status,
        error=error,
        candidate_name=doc.get("candidate_name"),
        position_title=doc.get("position_title") or "",
        position_fit=CvAnalysisPositionFit(**(doc.get("position_fit") or {})),
        key_strengths=[CvAnalysisBullet(**b) for b in (doc.get("key_strengths") or [])],
        improvements=[CvAnalysisBullet(**b) for b in (doc.get("improvements") or [])],
        inconsistencies=[
            CvAnalysisBullet(**b) for b in (doc.get("inconsistencies") or [])
        ],
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
    job_oid = (
        ObjectId(link["job_id"]) if ObjectId.is_valid(link.get("job_id", "")) else None
    )
    cand_oid = (
        ObjectId(link["cand_id"])
        if ObjectId.is_valid(link.get("cand_id", ""))
        else None
    )

    job = await db.jobs.find_one({"_id": job_oid}) if job_oid else None
    candidate = await db.candidates.find_one({"_id": cand_oid}) if cand_oid else None

    if not job:
        raise HTTPException(
            status_code=404, detail="Job referenced by this link is missing"
        )
    if not candidate:
        raise HTTPException(
            status_code=404, detail="Candidate referenced by this link is missing"
        )

    return link, job, candidate


# ---------- background worker ------------------------------------------


async def _run_analysis(
    analysis_oid: ObjectId,
    *,
    cv_bytes: bytes,
    cv_mime_type: str,
    cover_letter_bytes: bytes | None,
    cover_letter_mime_type: str | None,
    position_title: str,
    job_description: str | None,
) -> None:
    """Runs after the POST response is sent. Calls Gemini and writes the
    result (or the failure) back onto the "processing" doc. Never raises -
    an unhandled exception here would just vanish into the task runner, so
    every failure is captured onto the doc where the frontend can see it.
    """
    db = get_db()
    try:
        result = await analyse_cv(
            cv_bytes=cv_bytes,
            cv_mime_type=cv_mime_type,
            cover_letter_bytes=cover_letter_bytes,
            cover_letter_mime_type=cover_letter_mime_type,
            position_title=position_title,
            job_description=job_description,
        )
    except Exception as e:  # RuntimeError from the service, or anything else
        await db.cv_analyses.update_one(
            {"_id": analysis_oid, "status": "processing"},
            {"$set": {"status": "failed", "error": str(e) or "Analysis failed."}},
        )
        return

    await db.cv_analyses.update_one(
        # Guard on status so a doc the user deleted-and-recreated mid-run
        # can't be clobbered by this (now stale) task's result.
        {"_id": analysis_oid, "status": "processing"},
        {
            "$set": {
                "position_fit": result.get("position_fit") or {},
                "key_strengths": result.get("key_strengths") or [],
                "improvements": result.get("improvements") or [],
                "inconsistencies": result.get("inconsistencies") or [],
                "interview_questions": result.get("interview_questions") or [],
                "status": "completed",
                "error": None,
            }
        },
    )


# ---------- POST: start an analysis (or return the existing one) --------


@router.post(
    "",
    response_model=CvAnalysisOut,
    summary="Start a CV analysis for a job-candidate link. Returns immediately with status=processing.",
)
async def analyse(
    background_tasks: BackgroundTasks,
    jobcand_id: Annotated[str, Form(min_length=1)],
    cv: Annotated[UploadFile | None, File(description="Candidate CV PDF")] = None,
    cover_letter: Annotated[UploadFile | None, File()] = None,
) -> CvAnalysisOut:
    """See the module docstring for the per-state semantics. The short
    version: no file → read; new file → (re)start; in-flight → no-op.
    """
    db = get_db()

    has_new_cv = cv is not None and bool(cv.filename)

    # 1. Existing-doc check. Cheap query, runs before anything destructive.
    existing = await db.cv_analyses.find_one({"jobcand_id": jobcand_id})
    if existing:
        doc_status, _ = _effective_status(existing)
        # An in-flight run is never interrupted, and a fileless POST is a read.
        if doc_status == "processing" or not has_new_cv:
            return _serialise(existing, cached=True)
        # New CV over a completed/failed analysis → replace it wholesale.
        await db.cv_analyses.delete_one({"_id": existing["_id"]})
        if existing.get("cv_path"):
            delete_upload(existing["cv_path"])
        if existing.get("cover_letter_path"):
            delete_upload(existing["cover_letter_path"])
    elif not has_new_cv:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No existing analysis for this job-candidate. Upload a CV PDF to generate one.",
        )

    # 2. Validate the uploads before anything is written.
    _validate_pdf(cv, "CV")
    if cover_letter is not None and cover_letter.filename:
        _validate_pdf(cover_letter, "Cover letter")
    else:
        cover_letter = None

    # 3. Look up the job + candidate from the link so the LLM gets a real
    #    position title + job description + has a name to anchor against.
    _link, job, candidate = await _lookup_jobcand_context(jobcand_id)
    position_title = job.get("title") or "Untitled role"
    job_description = job.get("description") or None
    candidate_name = candidate.get("cand_full_name") or candidate.get("name")

    # 4. Read bytes into memory once for both the disk save and the LLM call.
    cv_bytes = await cv.read()
    cl_bytes = await cover_letter.read() if cover_letter else None

    request_id = uuid.uuid4().hex
    await cv.seek(0)
    cv_path = await save_upload(cv, subdir="cv_analyses", key=f"{request_id}-cv")
    cl_path: str | None = None
    if cover_letter is not None:
        await cover_letter.seek(0)
        cl_path = await save_upload(
            cover_letter, subdir="cv_analyses", key=f"{request_id}-cl"
        )

    # 5. Insert the doc as "processing". The analysis fields are filled in
    #    by the background task; until then they serialise as empty.
    now = datetime.now(timezone.utc)
    doc: dict = {
        "jobcand_id": jobcand_id,
        "comp_id": str(candidate.get("comp_id") or job.get("comp_id") or ""),
        "candidate_name": candidate_name,
        "position_title": position_title,
        "position_fit": {},
        "key_strengths": [],
        "improvements": [],
        "inconsistencies": [],
        "interview_questions": [],
        "cv_path": cv_path,
        "cover_letter_path": cl_path,
        "status": "processing",
        "error": None,
        "created_at": now,
    }
    try:
        inserted = await db.cv_analyses.insert_one(doc)
    except DuplicateKeyError:
        # A concurrent POST won the unique-index race. Serve their doc and
        # drop our now-orphaned files.
        delete_upload(cv_path)
        if cl_path:
            delete_upload(cl_path)
        winner = await db.cv_analyses.find_one({"jobcand_id": jobcand_id})
        if winner:
            return _serialise(winner, cached=True)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent analysis request. Retry.",
        )
    doc["_id"] = inserted.inserted_id

    # 6. Point the candidate profile's document links at the freshly stored
    #    files so the raw-PDF links elsewhere (e.g. the applications table)
    #    light up without a separate upload flow.
    cand_updates: dict = {
        "cand_cv_url": f"/api/files/{cv_path}",
        "cand_updated_at": now,
    }
    if cl_path:
        cand_updates["cand_cover_letter_url"] = f"/api/files/{cl_path}"
    await db.candidates.update_one({"_id": candidate["_id"]}, {"$set": cand_updates})

    # 7. Hand the heavy Gemini call to a background task and return now -
    #    the frontend polls GET /by-jobcand for completion.
    background_tasks.add_task(
        _run_analysis,
        inserted.inserted_id,
        cv_bytes=cv_bytes,
        cv_mime_type=cv.content_type or "application/pdf",
        cover_letter_bytes=cl_bytes,
        cover_letter_mime_type=(cover_letter.content_type if cover_letter else None),
        position_title=position_title,
        job_description=job_description,
    )
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
        raise HTTPException(
            status_code=404, detail="No analysis exists for this job-candidate"
        )
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
