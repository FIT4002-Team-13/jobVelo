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
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from dependencies import get_current_comp_id
from models.job_candidate import (
    JobCandidateCreate,
    JobCandidateOut,
    JobCandidatePlanUpdate,
    JobCandidateScoreUpdate,
)

router = APIRouter(prefix="/api/job-candidates", tags=["job_candidates"])


def job_candidate_helper(job_candidate: dict) -> JobCandidateOut:
    """Mongo doc -> API response. Always read `_id` for the primary key
    (the public-facing name is `jobcand_id` but Mongo stores it as `_id`)."""

    return JobCandidateOut(
        jobcand_id=str(job_candidate["_id"]),
        cand_id=str(job_candidate["cand_id"]),
        job_id=str(job_candidate["job_id"]),
        status=job_candidate.get("status"),
        cv_analysis=job_candidate.get("cv_analysis"),
        communication_score=job_candidate.get("communication_score"),
        skill_score=job_candidate.get("skill_score"),
        problem_solving_score=job_candidate.get("problem_solving_score"),
        final_score=job_candidate.get("final_score"),
        rank=job_candidate.get("rank"),
        plan_sections=job_candidate.get("plan_sections"),
        created_at=job_candidate.get("created_at") or datetime.now(timezone.utc),
        updated_at=job_candidate.get("updated_at") or datetime.now(timezone.utc),
    )


def _validate_oid(value: str, what: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {what} id")
    return ObjectId(value)


@router.post("", response_model=JobCandidateOut, status_code=status.HTTP_201_CREATED)
async def create_job_candidate(
    payload: JobCandidateCreate,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> JobCandidateOut:
    """Link an existing candidate to an existing job.

    For the combined "create candidate + link" flow used by the popup,
    call POST /api/candidates/create-for-job instead.
    """
    db = get_db()

    cand_oid = _validate_oid(payload.cand_id, "candidate")
    job_oid = _validate_oid(payload.job_id, "job")

    # Both records must exist AND belong to the caller's company. Scoping the
    # find by comp_id means a user can't link across tenants even if they
    # somehow know valid ids from another company - they just get a 404.
    candidate = await db.candidates.find_one({"_id": cand_oid, "comp_id": comp_id})
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    job = await db.jobs.find_one({"_id": job_oid, "comp_id": comp_id})
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

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
    created_job_candidate = await db.job_candidates.find_one(
        {"_id": result.inserted_id}
    )

    if not created_job_candidate:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create job-candidate link.",
        )

    return job_candidate_helper(created_job_candidate)


# Helper: confirm a job_candidates link belongs to the caller's company by
# walking link -> job -> comp_id. Used by the per-link read/update routes so
# they can't be used to read or score another company's candidates.
async def _link_in_company(db, link: dict, comp_id: ObjectId) -> bool:
    job_id = link.get("job_id")
    if not job_id or not ObjectId.is_valid(job_id):
        return False
    job = await db.jobs.find_one(
        {"_id": ObjectId(job_id), "comp_id": comp_id}, {"_id": 1}
    )
    return job is not None


@router.get("/by-job/{job_id}", response_model=list[JobCandidateOut])
async def list_job_candidates_by_job(
    job_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[JobCandidateOut]:
    db = get_db()
    # 404 the whole list if the job isn't in the caller's company.
    if not ObjectId.is_valid(job_id) or not await db.jobs.find_one(
        {"_id": ObjectId(job_id), "comp_id": comp_id}, {"_id": 1}
    ):
        raise HTTPException(status_code=404, detail="Job not found")
    job_candidates = await db.job_candidates.find({"job_id": job_id}).to_list(
        length=100
    )
    return [job_candidate_helper(doc) for doc in job_candidates]


@router.get("")
async def list_job_candidates_flat(comp_id: str | None = None) -> list[dict]:
    """Flat enumeration of every job-candidate link, optionally scoped to a
    company, joined with the job title + candidate name.

    Used by the CV Analyser upload page to populate its picker. Each row
    also carries `has_analysis` so the picker can short-circuit straight
    to the result screen for links that already have a cached analysis.
    """
    db = get_db()

    # 1. Scope by company: gather the company's job ids first, then filter
    #    links by job_id. (job_candidates docs don't store comp_id directly,
    #    but jobs do.)
    job_query: dict = {}
    if comp_id:
        if not ObjectId.is_valid(comp_id):
            raise HTTPException(status_code=400, detail="Invalid comp_id")
        job_query["comp_id"] = ObjectId(comp_id)

    jobs = await db.jobs.find(job_query, {"title": 1}).to_list(length=500)
    if not jobs:
        return []
    jobs_by_id = {str(j["_id"]): j for j in jobs}
    job_id_strs = list(jobs_by_id.keys())

    # 2. Fetch every link belonging to those jobs.
    links = await db.job_candidates.find(
        {"job_id": {"$in": job_id_strs}}
    ).to_list(length=1000)
    if not links:
        return []

    # 3. Bulk-fetch candidate names so we don't N+1 per link.
    cand_oids = [
        ObjectId(link["cand_id"])
        for link in links
        if ObjectId.is_valid(link.get("cand_id", ""))
    ]
    cand_docs = await db.candidates.find(
        {"_id": {"$in": cand_oids}},
        {"cand_full_name": 1, "name": 1},
    ).to_list(length=1000)
    cands_by_id = {str(c["_id"]): c for c in cand_docs}

    # 4. has_analysis flag: which jobcand_ids already have a cached analysis.
    link_ids = [str(link["_id"]) for link in links]
    analysed_ids = {
        a["jobcand_id"]
        async for a in db.cv_analyses.find(
            {"jobcand_id": {"$in": link_ids}},
            {"jobcand_id": 1},
        )
    }

    out: list[dict] = []
    for link in links:
        job = jobs_by_id.get(str(link["job_id"]))
        cand = cands_by_id.get(str(link["cand_id"]))
        out.append({
            "jobcand_id":     str(link["_id"]),
            "job_id":         str(link["job_id"]),
            "cand_id":        str(link["cand_id"]),
            "job_title":      (job or {}).get("title", "(missing job)"),
            "cand_full_name": (cand or {}).get("cand_full_name") or (cand or {}).get("name", "(unknown candidate)"),
            "status":         link.get("status"),
            "has_analysis":   str(link["_id"]) in analysed_ids,
        })
    return out


@router.get("/by-candidate/{cand_id}", response_model=list[JobCandidateOut])
async def list_job_candidates_by_candidate(
    cand_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[JobCandidateOut]:
    db = get_db()
    # 404 if the candidate isn't in the caller's company.
    if not ObjectId.is_valid(cand_id) or not await db.candidates.find_one(
        {"_id": ObjectId(cand_id), "comp_id": comp_id}, {"_id": 1}
    ):
        raise HTTPException(status_code=404, detail="Candidate not found")
    job_candidates = await db.job_candidates.find({"cand_id": cand_id}).to_list(
        length=100
    )
    return [job_candidate_helper(doc) for doc in job_candidates]


@router.get("/{jobcand_id}", response_model=JobCandidateOut)
async def get_job_candidate(
    jobcand_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> JobCandidateOut:
    db = get_db()
    oid = _validate_oid(jobcand_id, "job-candidate")
    job_candidate = await db.job_candidates.find_one({"_id": oid})
    if not job_candidate or not await _link_in_company(db, job_candidate, comp_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job-candidate link not found.",
        )
    return job_candidate_helper(job_candidate)


@router.patch("/{jobcand_id}/scores", response_model=JobCandidateOut)
async def update_job_candidate_scores(
    jobcand_id: str,
    payload: JobCandidateScoreUpdate,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> JobCandidateOut:
    """Update any/all of the AI / interview score fields on a link.

    Auto-status side-effect: as soon as any field lands with a non-null
    value, the link's `status` is set to "EVALUATED". This replaces the
    earlier dedicated /status endpoint - in practice nobody scores an
    interview without also moving the candidate out of SCHEDULED, so we
    do it in one call and remove the chance to forget.

    Clearing a score (sending {communication_score: null}) does NOT touch
    the status - that's an explicit "undo" gesture.
    """
    db = get_db()
    oid = _validate_oid(jobcand_id, "job-candidate")

    # Tenant guard: the link must belong to the caller's company.
    existing = await db.job_candidates.find_one({"_id": oid})
    if not existing or not await _link_in_company(db, existing, comp_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job-candidate link not found.",
        )

    # exclude_unset keeps fields the caller didn't include out of the $set,
    # so a partial update doesn't wipe other scores.
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Auto-bump status when a real (non-null) score is being recorded.
    if any(v is not None for v in updates.values()):
        updates["status"] = "EVALUATED"

    updates["updated_at"] = datetime.now(timezone.utc)

    result = await db.job_candidates.find_one_and_update(
        {"_id": oid},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job-candidate link not found.",
        )
    return job_candidate_helper(result)


@router.patch("/{jobcand_id}/plan", response_model=JobCandidateOut)
async def update_job_candidate_plan(
    jobcand_id: str,
    payload: JobCandidatePlanUpdate,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> JobCandidateOut:
    """Save or replace the AI-generated interview plan sections for a job-candidate link."""
    db = get_db()
    oid = _validate_oid(jobcand_id, "job-candidate")

    existing = await db.job_candidates.find_one({"_id": oid})
    if not existing or not await _link_in_company(db, existing, comp_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job-candidate link not found.",
        )

    result = await db.job_candidates.find_one_and_update(
        {"_id": oid},
        {
            "$set": {
                "plan_sections": payload.plan_sections,
                "updated_at": datetime.now(timezone.utc),
            }
        },
        return_document=True,
    )
    return job_candidate_helper(result)
