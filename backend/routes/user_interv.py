from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from dependencies import get_current_comp_id
from models.user_interview import InterviewUserCreate, InterviewUserOut

router = APIRouter(prefix="/api/interview-users", tags=["interview_users"])


async def _interview_company_ok(db, intv_id: str, comp_id: ObjectId) -> bool:
    """True if the interview (via its job) belongs to the caller's company.
    interview_users links carry intv_id; we walk link -> interview -> job."""
    if not intv_id or not ObjectId.is_valid(intv_id):
        return False
    interview = await db.interviews.find_one({"_id": ObjectId(intv_id)}, {"job_id": 1})
    if not interview:
        return False
    job_id = interview.get("job_id")
    if not job_id or not ObjectId.is_valid(job_id):
        return False
    return await db.jobs.find_one({"_id": ObjectId(job_id), "comp_id": comp_id}, {"_id": 1}) is not None

def interview_user_helper(interview_user: dict) -> InterviewUserOut:
    """Convert a raw Mongo interview-user link into the API response model.

    Timestamps fall back to a legacy `created_at` field, then `datetime.min`,
    so malformed rows do not 500 the whole endpoint.
    """

    fallback = interview_user.get("created_at") or datetime.min

    return InterviewUserOut(
        intvuser_id=str(interview_user["_id"]),
        user_id=str(interview_user["user_id"]),
        intv_id=str(interview_user["intv_id"]),
        intvuser_created_at=interview_user.get("intvuser_created_at") or fallback,
        intvuser_updated_at=interview_user.get("intvuser_updated_at") or fallback,
    )

@router.post(
    "",
    response_model=InterviewUserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Link a user to an interview.",
)
async def create_interview_user(
    payload: InterviewUserCreate,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> InterviewUserOut:
    """Create the user-interview relationship.

    Prevents the same user from being linked to the same interview twice.
    The interview must belong to the caller's company.
    """
    db = get_db()

    if not await _interview_company_ok(db, payload.intv_id, comp_id):
        raise HTTPException(status_code=404, detail="Interview not found")

    existing_link = await db.interview_users.find_one(
        {
            "user_id": payload.user_id,
            "intv_id": payload.intv_id,
        }
    )
    if existing_link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already linked to this interview.",
        )

    now = datetime.now(timezone.utc)

    interview_user_doc = {
        "user_id": payload.user_id,
        "intv_id": payload.intv_id,
        "intvuser_created_at": now,
        "intvuser_updated_at": now,
    }

    result = await db.interview_users.insert_one(interview_user_doc)
    created_link = await db.interview_users.find_one({"_id": result.inserted_id})

    if not created_link:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create interview-user link.",
        )

    return interview_user_helper(created_link)

@router.get(
    "/by-interview/{intv_id}",
    response_model=list[InterviewUserOut],
    summary="List users attached to an interview.",
)
async def list_interview_users_by_interview(
    intv_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[InterviewUserOut]:
    db = get_db()
    if not await _interview_company_ok(db, intv_id, comp_id):
        raise HTTPException(status_code=404, detail="Interview not found")
    links = await db.interview_users.find({"intv_id": intv_id}).to_list(length=100)
    return [interview_user_helper(doc) for doc in links]

@router.get(
    "/by-user/{user_id}",
    response_model=list[InterviewUserOut],
    summary="List interviews attached to a user.",
)
async def list_interview_users_by_user(
    user_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[InterviewUserOut]:
    db = get_db()
    # The target user must be in the caller's company.
    if not ObjectId.is_valid(user_id) or not await db.users.find_one(
        {"_id": ObjectId(user_id), "comp_id": comp_id}, {"_id": 1}
    ):
        raise HTTPException(status_code=404, detail="User not found")
    links = await db.interview_users.find({"user_id": user_id}).to_list(length=100)
    return [interview_user_helper(doc) for doc in links]

@router.get(
    "/{intvuser_id}",
    response_model=InterviewUserOut,
    summary="Get one interview-user link by id.",
)
async def get_interview_user(
    intvuser_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> InterviewUserOut:
    db = get_db()

    if not ObjectId.is_valid(intvuser_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid interview-user id.",
        )

    link = await db.interview_users.find_one({"_id": ObjectId(intvuser_id)})
    if not link or not await _interview_company_ok(db, link.get("intv_id", ""), comp_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview-user link not found.",
        )

    return interview_user_helper(link)