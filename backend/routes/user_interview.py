from __future__ import annotations

from datetime import UTC, datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status

from database import get_db
from models.user_interview import InterviewUserCreate, InterviewUserOut

router = APIRouter(prefix="/api/interview-users", tags=["interview_users"])


def interview_user_helper(interview_user: dict) -> InterviewUserOut:
    """Convert a raw Mongo interview-user link into the API response model."""

    return InterviewUserOut(
        intvuser_id=str(interview_user["_id"]),
        user_id=str(interview_user["user_id"]),
        intv_id=str(interview_user["intv_id"]),
        intvuser_created_at=interview_user["intvuser_created_at"],
        intvuser_updated_at=interview_user["intvuser_updated_at"],
    )


@router.post(
    "",
    response_model=InterviewUserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Link a user to an interview.",
)
async def create_interview_user(payload: InterviewUserCreate) -> InterviewUserOut:
    """Create the user-interview relationship.

    Prevents the same user from being linked to the same interview twice.
    """
    db = get_db()

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

    now = datetime.now(UTC)

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
async def list_interview_users_by_interview(intv_id: str) -> list[InterviewUserOut]:
    db = get_db()
    links = await db.interview_users.find({"intv_id": intv_id}).to_list(length=100)
    return [interview_user_helper(doc) for doc in links]


@router.get(
    "/by-user/{user_id}",
    response_model=list[InterviewUserOut],
    summary="List interviews attached to a user.",
)
async def list_interview_users_by_user(user_id: str) -> list[InterviewUserOut]:
    db = get_db()
    links = await db.interview_users.find({"user_id": user_id}).to_list(length=100)
    return [interview_user_helper(doc) for doc in links]


@router.get(
    "/{intvuser_id}",
    response_model=InterviewUserOut,
    summary="Get one interview-user link by id.",
)
async def get_interview_user(intvuser_id: str) -> InterviewUserOut:
    db = get_db()

    if not ObjectId.is_valid(intvuser_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid interview-user id.",
        )

    link = await db.interview_users.find_one({"_id": ObjectId(intvuser_id)})
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview-user link not found.",
        )

    return interview_user_helper(link)
