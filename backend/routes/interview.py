from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from dependencies import require_role
from models.interview import InterviewCreate, InterviewOut, InterviewUpdate

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
