"""Job-Candidate link table.

Each row represents "candidate X has been put forward for job Y" plus the
AI's interview analysis (cv_analysis + three sub-scores). This is the
N:N bridge between jobs and candidates.

Cross-tenant safety:
  - candidate.comp_id MUST match job.comp_id at link-creation time
  - this prevents an admin from Company A linking a Company B candidate
    to a Company A job, which would leak candidate data across tenants.
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status

from database import get_db
from models.job_candidate import JobCandidateCreate, JobCandidateOut

router = APIRouter(prefix="/api/job-candidates", tags=["job_candidates"])


def job_candidate_helper(job_candidate: dict) -> JobCandidateOut:
    """Mongo doc -> API response. Always read `_id` for the primary key
    (the public-facing name is `jobcand_id` but Mongo stores it as `_id`)."""

    return JobCandidateOut(
        jobcand_id=str(job_candidate["_id"]),
        cand_id=str(job_candidate["cand_id"]),
        job_id=str(job_candidate["job_id"]),
        cv_analysis=job_candidate.get("cv_analysis"),
        communication_score=job_candidate.get("communication_score"),
        skill_score=job_candidate.get("skill_score"),
        problem_solving_score=job_candidate.get("problem_solving_score"),
        created_at=job_candidate["created_at"],
        updated_at=job_candidate["updated_at"],
    )


def _validate_oid(value: str, what: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {what} id")
    return ObjectId(value)


@router.post("", response_model=JobCandidateOut, status_code=status.HTTP_201_CREATED)
async def create_job_candidate(payload: JobCandidateCreate) -> JobCandidateOut:
    """Link an existing candidate to an existing job.

    For the combined "create candidate + link" flow used by the popup,
    call POST /api/candidates/create-for-job instead.
    """
    db = get_db()

    cand_oid = _validate_oid(payload.cand_id, "candidate")
    job_oid = _validate_oid(payload.job_id, "job")

    # Both records must exist BEFORE we link them.
    candidate = await db.candidates.find_one({"_id": cand_oid})
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    job = await db.jobs.find_one({"_id": job_oid})
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    # Cross-tenant guard: candidate and job must belong to the same company.
    cand_comp = str(candidate.get("comp_id", ""))
    job_comp = str(job.get("comp_id", ""))
    if cand_comp and job_comp and cand_comp != job_comp:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidate and job belong to different companies",
        )

    # Prevent duplicate links - the (cand_id, job_id) pair is logically unique.
    existing_job_candidate = await db.job_candidates.find_one(
        {"cand_id": payload.cand_id, "job_id": payload.job_id}
    )
    if existing_job_candidate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate is already linked to this job.",
        )

    now = datetime.now(timezone.utc)
    job_candidate_doc = {
        "cand_id": payload.cand_id,
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


@router.get("/by-candidate/{cand_id}", response_model=list[JobCandidateOut])
async def list_job_candidates_by_candidate(cand_id: str) -> list[JobCandidateOut]:
    db = get_db()
    job_candidates = await db.job_candidates.find({"cand_id": cand_id}).to_list(length=100)
    return [job_candidate_helper(doc) for doc in job_candidates]


@router.get("/{jobcand_id}", response_model=JobCandidateOut)
async def get_job_candidate(jobcand_id: str) -> JobCandidateOut:
    db = get_db()
    oid = _validate_oid(jobcand_id, "job-candidate")
    job_candidate = await db.job_candidates.find_one({"_id": oid})
    if not job_candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job-candidate link not found.",
        )
    return job_candidate_helper(job_candidate)
