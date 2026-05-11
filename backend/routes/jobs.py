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


class JobUpdate(BaseModel):                
    title: str | None = None
    description: str | None = None
    employment_type: list[str] | None = None
    recruitment_start: str | None = None
    recruitment_end: str | None = None
    candidates_total: int | None = None
    salary: str | None = None
    salary_type: str | None = None
    status: str | None = None


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("/jobs")                        # List all jobs
async def get_jobs(db: AsyncIOMotorDatabase = Depends(get_db)):
    jobs = await db.jobs.find({}).to_list(length=200)
    return [_serialize(j) for j in jobs]


@router.get("/jobs/{job_id}")               # Get one job (Job Detail page)
async def get_job(job_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    try:
        oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job id")
    job = await db.jobs.find_one({"_id": oid})
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _serialize(job)


@router.post("/jobs", status_code=201)   # Create a new job posting
async def create_job(payload: JobCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = payload.model_dump()
    doc["status"] = "Pending"
    doc["candidates_filled"] = 0
    doc["interviewers"] = []
    result = await db.jobs.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc


@router.put("/jobs/{job_id}")        #Edit a job
async def update_job(job_id: str, payload: JobUpdate, db: AsyncIOMotorDatabase = Depends(get_db)):
    try:
        oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job id")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.jobs.find_one_and_update(
        {"_id": oid},
        {"$set": updates},
        return_document=True,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _serialize(result)


@router.delete("/jobs/{job_id}", status_code=204)   #  Delete a job
async def delete_job(job_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    try:
        oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job id")

    result = await db.jobs.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    


#     feat: add full CRUD endpoints to jobs router

# - Added JobUpdate pydantic model with all optional fields
#   for partial updates (title, description, employment_type,
#   recruitment_start, recruitment_end, candidates_total,
#   salary, salary_type, status)
# - Added GET /api/jobs/{job_id} to fetch a single job by id
#   used by the Job Detail page
# - Added POST /api/jobs to create a new job posting,
#   defaults status to Pending, candidates_filled to 0
#   and interviewers to empty list
# - Added PUT /api/jobs/{job_id} to edit any job fields
#   using $set, skips None values so partial updates work
# - Added DELETE /api/jobs/{job_id} to remove a job posting,
#   returns 404 if job does not exist
# - All endpoints validate ObjectId and return 400 for invalid id