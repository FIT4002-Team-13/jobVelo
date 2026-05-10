from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from database import get_db

router = APIRouter(prefix="/api", tags=["jobs"])


class JobCreate(BaseModel):
    title: str
    description: str = ""
    employment_type: list[str] = []
    recruitment_start: str
    recruitment_end: str
    candidates_total: int = 1
    salary: str = ""
    salary_type: str = ""


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("/jobs")            # List all jobs
async def get_jobs(db: AsyncIOMotorDatabase = Depends(get_db)):
    jobs = await db.jobs.find({}).to_list(length=200)
    return [_serialize(j) for j in jobs]