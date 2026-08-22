from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from dependencies import require_role
from models.interview import (
    InterviewCompleteOut,
    InterviewCompleteRequest,
    InterviewCreate,
    InterviewFeedback,
    InterviewOut,
    InterviewScores,
    InterviewUpdate,
)
from services.openai_service import generate_interview_reports

router = APIRouter(prefix="/api/interviews", tags=["interviews"])

def interview_helper(interview: dict) -> InterviewOut:
    """Convert a raw Mongo interview document into the API response model."""

    return InterviewOut(
        intv_id=str(interview["_id"]),
        cand_id=str(interview["cand_id"]),
        job_id=str(interview["job_id"]),
        intv_date_time=interview.get("intv_date_time"),
        intv_location=interview.get("intv_location"),
        intv_transcript=interview.get("intv_transcript"),
        intv_status=interview["intv_status"],
        intv_duration_seconds=interview.get("intv_duration_seconds"),
        intv_candidate_report=interview.get("intv_candidate_report"),
        intv_interviewer_report=interview.get("intv_interviewer_report"),
        intv_created_at=interview["intv_created_at"],
        intv_updated_at=interview["intv_updated_at"],
    )

@router.post(
    "",
    response_model=InterviewOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an interview session.",
)
async def create_interview(
    payload: InterviewCreate,
    _user: dict = Depends(require_role("interviewer")),
) -> InterviewOut:
    """Insert a new interview document.

    The interview is created first, and interviewer-user links are created
    separately through /api/interview-users. Starting an interview is
    interviewer-only - other roles (admin, recruiter, hiring_manager) can
    still view interview data via the GET endpoints below, just not create
    a new session.
    """
    db = get_db()
    now = datetime.now(timezone.utc)

    interview_doc = {
        "cand_id": payload.cand_id,
        "job_id": payload.job_id,
        "intv_date_time": payload.intv_date_time,
        "intv_location": payload.intv_location,
        "intv_transcript": None,
        "intv_status": payload.intv_status,
        "intv_duration_seconds": None,
        "intv_candidate_report": None,
        "intv_interviewer_report": None,
        "intv_created_at": now,
        "intv_updated_at": now,
    }

    result = await db.interviews.insert_one(interview_doc)
    created_interview = await db.interviews.find_one({"_id": result.inserted_id})

    if not created_interview:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create interview.",
        )

    return interview_helper(created_interview)

@router.get(
    "",
    response_model=list[InterviewOut],
    summary="List interviews, optionally filtered by candidate or job.",
)
async def list_interviews(
    cand_id: str | None = None,
    job_id: str | None = None,
) -> list[InterviewOut]:
    db = get_db()

    query = {}
    if cand_id:
        query["cand_id"] = cand_id
    if job_id:
        query["job_id"] = job_id

    interviews = await db.interviews.find(query).to_list(length=100)
    return [interview_helper(doc) for doc in interviews]

@router.get(
    "/{intv_id}",
    response_model=InterviewOut,
    summary="Get one interview by id.",
)
async def get_interview(intv_id: str) -> InterviewOut:
    db = get_db()

    if not ObjectId.is_valid(intv_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid interview id.",
        )

    interview = await db.interviews.find_one({"_id": ObjectId(intv_id)})
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found.",
        )

    return interview_helper(interview)

def _transcript_to_text(entries: list[dict]) -> str:
    """Flatten transcript entries into "[mm:ss] Speaker: text" lines for
    the LLM. Skips empty lines and in-flight partials defensively."""
    lines = []
    for e in entries or []:
        text = (e.get("text") or "").strip()
        if not text:
            continue
        speaker = e.get("speaker") or "Unknown"
        timestamp = e.get("timestamp") or ""
        prefix = f"[{timestamp}] " if timestamp else ""
        lines.append(f"{prefix}{speaker}: {text}")
    return "\n".join(lines)


def _clamp_score(value) -> float:
    try:
        return round(min(10.0, max(0.0, float(value))), 1)
    except (TypeError, ValueError):
        return 0.0


@router.post(
    "/{intv_id}/complete",
    response_model=InterviewCompleteOut,
    summary="Finish an interview: persist the transcript, generate both LLM reports, and score the candidate.",
)
async def complete_interview(
    intv_id: str,
    payload: InterviewCompleteRequest,
    _user: dict = Depends(require_role("interviewer")),
) -> InterviewCompleteOut:
    """Called when the interviewer clicks Complete.

    1. Persists the final transcript + duration and marks the interview
       "completed".
    2. Runs one LLM pass over the transcript producing the candidate
       report (summary / strengths / improvements + three 0-10 ratings)
       and the interviewer coaching report (no ratings).
    3. Mirrors the ratings onto the job_candidates link (which also flips
       the application status to EVALUATED, same as the manual scores
       endpoint).

    Idempotent: re-calling on an interview that already has both reports
    returns the stored ones without another LLM run.
    """
    if not ObjectId.is_valid(intv_id):
        raise HTTPException(status_code=400, detail="Invalid interview id.")

    db = get_db()
    interview = await db.interviews.find_one({"_id": ObjectId(intv_id)})
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found.")

    link = await db.job_candidates.find_one(
        {"cand_id": interview.get("cand_id"), "job_id": interview.get("job_id")}
    )

    # Re-entry: reports already generated -> serve them, no second LLM run.
    if interview.get("intv_candidate_report") and interview.get("intv_interviewer_report"):
        return InterviewCompleteOut(
            intv_id=intv_id,
            intv_status="completed",
            scores=InterviewScores(
                communication=_clamp_score((link or {}).get("communication_score")),
                skill=_clamp_score((link or {}).get("skill_score")),
                problem_solving=_clamp_score((link or {}).get("problem_solving_score")),
            ),
            candidate_report=InterviewFeedback(**interview["intv_candidate_report"]),
            interviewer_report=InterviewFeedback(**interview["intv_interviewer_report"]),
            cached=True,
        )

    # Prefer the transcript sent with the click (freshest); fall back to
    # what the periodic autosave stored.
    entries = (
        [e.model_dump() for e in payload.transcript]
        if payload.transcript is not None
        else (interview.get("intv_transcript") or [])
    )
    transcript_text = _transcript_to_text(entries)
    if not transcript_text:
        raise HTTPException(
            status_code=400,
            detail="No transcript recorded - nothing to analyse.",
        )

    # Context for the LLM: role title + candidate name.
    job = None
    candidate = None
    if ObjectId.is_valid(interview.get("job_id") or ""):
        job = await db.jobs.find_one({"_id": ObjectId(interview["job_id"])})
    if ObjectId.is_valid(interview.get("cand_id") or ""):
        candidate = await db.candidates.find_one({"_id": ObjectId(interview["cand_id"])})

    try:
        result = await generate_interview_reports(
            transcript_text,
            job_title=(job or {}).get("title"),
            candidate_name=(candidate or {}).get("cand_full_name"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Report generation failed: {e}",
        ) from e

    raw_scores = result.get("scores") or {}
    scores = InterviewScores(
        communication=_clamp_score(raw_scores.get("communication")),
        skill=_clamp_score(raw_scores.get("skill")),
        problem_solving=_clamp_score(raw_scores.get("problem_solving")),
    )
    # Pydantic fills any missing sections with safe empties rather than 500-ing.
    candidate_report = InterviewFeedback(**(result.get("candidate_report") or {}))
    interviewer_report = InterviewFeedback(**(result.get("interviewer_report") or {}))

    now = datetime.now(timezone.utc)
    interview_updates: dict = {
        "intv_status": "completed",
        "intv_candidate_report": candidate_report.model_dump(),
        "intv_interviewer_report": interviewer_report.model_dump(),
        "intv_updated_at": now,
    }
    if payload.transcript is not None:
        interview_updates["intv_transcript"] = entries
    if payload.duration_seconds is not None:
        interview_updates["intv_duration_seconds"] = payload.duration_seconds
    await db.interviews.update_one({"_id": ObjectId(intv_id)}, {"$set": interview_updates})

    # Mirror the ratings onto the application link. Same side-effect as the
    # manual PATCH /job-candidates/{id}/scores: recording scores flips the
    # application to EVALUATED.
    if link:
        await db.job_candidates.update_one(
            {"_id": link["_id"]},
            {
                "$set": {
                    "communication_score": scores.communication,
                    "skill_score": scores.skill,
                    "problem_solving_score": scores.problem_solving,
                    "status": "EVALUATED",
                    "updated_at": now,
                }
            },
        )

    return InterviewCompleteOut(
        intv_id=intv_id,
        intv_status="completed",
        scores=scores,
        candidate_report=candidate_report,
        interviewer_report=interviewer_report,
        cached=False,
    )


@router.patch(
    "/{intv_id}",
    response_model=InterviewOut,
    summary="Update mutable interview fields.",
)
async def update_interview(intv_id: str, payload: InterviewUpdate) -> InterviewOut:
    db = get_db()

    if not ObjectId.is_valid(intv_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid interview id.",
        )

    existing_interview = await db.interviews.find_one({"_id": ObjectId(intv_id)})
    if not existing_interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        return interview_helper(existing_interview)

    update_data["intv_updated_at"] = datetime.now(timezone.utc)

    await db.interviews.update_one(
        {"_id": ObjectId(intv_id)},
        {"$set": update_data},
    )

    updated_interview = await db.interviews.find_one({"_id": ObjectId(intv_id)})
    if not updated_interview:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update interview.",
        )

    return interview_helper(updated_interview)
