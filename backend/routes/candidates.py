from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from database import get_db

router = APIRouter(prefix="/api", tags=["candidates"])


class CandidateCreate(BaseModel):
    name: str
    interviewer: str
    scheduled_at: str
    status: str = "SCHEDULED"
    score: float | None = None


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("/jobs/{job_id}/candidates")        #List all candidates for a specific job
async def get_candidates(job_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    try:
        ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job id")
    docs = await db.candidates.find({"job_id": job_id}).to_list(length=500)
    return [_serialize(d) for d in docs]


@router.post("/jobs/{job_id}/candidates", status_code=201)  #Add a candidate to a specific job — also increments candidates_filled on the job
async def add_candidate(job_id: str, payload: CandidateCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    try:
        oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job id")

    job = await db.jobs.find_one({"_id": oid})
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    doc = payload.model_dump()
    doc["job_id"] = job_id
    doc["position"] = job.get("title", "")

    result = await db.candidates.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)

    updated_job = await db.jobs.find_one_and_update(
        {"_id": oid},
        {"$inc": {"candidates_filled": 1}},
        return_document=True,
    )
    updated_job["id"] = str(updated_job.pop("_id"))

    return {"candidate": doc, "job": updated_job}
