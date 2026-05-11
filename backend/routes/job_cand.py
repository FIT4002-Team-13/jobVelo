from __future__ import annotations

from datetime import datetime, UTC

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status

from database import get_db
from models.job_candidate import JobCandidateCreate, JobCandidateOut

router = APIRouter(prefix="/api/job-candidates", tags=["job_candidates"])

def job_candidate_helper(job_candidate: dict) -> JobCandidateOut:
    return JobCandidateOut(
        id=str(job_candidate["_id"]),
        candidate_id=str(job_candidate["candidate_id"]),
        job_id=str(job_candidate["job_id"]),
        cv_analysis=job_candidate.get("cv_analysis"),
        communication_score=job_candidate.get("communication_score"),
        skill_score=job_candidate.get("skill_score"),
        problem_solving_score=job_candidate.get("problem_solving_score"),
        created_at=job_candidate["created_at"],
        updated_at=job_candidate["updated_at"],
    )

@router.post("", response_model=JobCandidateOut, status_code=status.HTTP_201_CREATED)
async def create_job_candidate(payload: JobCandidateCreate) -> JobCandidateOut:
    db = get_db()

    existing_job_candidate = await db.job_candidates.find_one(
        {
            "candidate_id": payload.candidate_id,
            "job_id": payload.job_id,
        }
    )
    if existing_job_candidate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate is already linked to this job.",
        )

    now = datetime.now(UTC)

    job_candidate_doc = {
        "candidate_id": payload.candidate_id,
        "job_id": payload.job_id,
        "cv_analysis": payload.cv_analysis,
        "communication_score": payload.communication_score,
        "skill_score": payload.skill_score,
        "problem_solving_score": payload.problem_solving_score,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.job_candidates.insert_one(job_candidate_doc)
    created_job_candidate = await db.job_candidates.find_one({"_id": result.inserted_id})

    if not created_job_candidate:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create job-candidate link.",
        )

    return job_candidate_helper(created_job_candidate)

@router.get("/by-job/{job_id}", response_model=list[JobCandidateOut])
async def list_job_candidates_by_job(job_id: str) -> list[JobCandidateOut]:
    db = get_db()

    job_candidates = await db.job_candidates.find({"job_id": job_id}).to_list(length=100)
    return [job_candidate_helper(doc) for doc in job_candidates]

@router.get("/by-candidate/{candidate_id}", response_model=list[JobCandidateOut])
async def list_job_candidates_by_candidate(candidate_id: str) -> list[JobCandidateOut]:
    db = get_db()

    job_candidates = await db.job_candidates.find({"candidate_id": candidate_id}).to_list(length=100)
    return [job_candidate_helper(doc) for doc in job_candidates]

@router.get("/{job_candidate_id}", response_model=JobCandidateOut)
async def get_job_candidate(job_candidate_id: str) -> JobCandidateOut:
    db = get_db()

    if not ObjectId.is_valid(job_candidate_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job-candidate id.",
        )

    job_candidate = await db.job_candidates.find_one({"_id": ObjectId(job_candidate_id)})
    if not job_candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job-candidate link not found.",
        )

    return job_candidate_helper(job_candidate)