from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/me")                 #Returns the current logged-in user's name & role
async def get_me(db: AsyncIOMotorDatabase = Depends(get_db)):
    user = await db.users.find_one({"slug": "me"}, {"_id": 0, "slug": 0})
    if user is None:
        return {"name": "John Doe", "role": "Interviewer", "email": ""}
    return user


@router.get("/dashboard/summary")  #Returns Today / Completed / Up-coming interview counts for the summary cards
async def get_summary(db: AsyncIOMotorDatabase = Depends(get_db)):
    summary = await db.summary.find_one({"slug": "dashboard"}, {"_id": 0})
    return summary


@router.get("/candidates")         #Returns all candidates (used by the Dashboard page list)
async def get_candidates(db: AsyncIOMotorDatabase = Depends(get_db)):
    candidates = await db.candidates.find({}, {"_id": 0}).to_list(length=100)
    return candidates