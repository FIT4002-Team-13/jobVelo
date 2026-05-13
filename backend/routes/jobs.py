"""Job-post routes.

  company -1---N-> jobs  -N---N-> candidates   (bridged by job_candidates)
                       \__________ user (the recruiter/admin) creating it

Tenant isolation: lists filter by `comp_id` when provided. Once routes are
auth-gated, the filter should come from `user["comp_id"]` instead of the
optional query param.

Pydantic shapes (JobCreate, JobUpdate, JobOut) live in models/job.py so the
model and route files stay consistent with the candidate / job_candidate split.

Route shape: /api/jobs + /api/jobs/{job_id}
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from database import get_db
from models.job import JobCreate, JobOut, JobUpdate

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _comp_oid(comp_id: str) -> ObjectId:
    """Validate + cast a string comp_id to an ObjectId.

    Every collection stores `comp_id` as an ObjectId (matching auth.py +
    invitations.py), so a string from the request body or query param must
    be converted before insert/query, otherwise nothing matches.
    """
    if not ObjectId.is_valid(comp_id):
        raise HTTPException(status_code=400, detail="Invalid comp_id")
    return ObjectId(comp_id)


# ---------- helpers ----------------------------------------------------------


def _serialize(doc: dict) -> JobOut:
    """Mongo doc -> JobOut. Tolerant of missing fields so a legacy doc
    can't crash a list query."""
    return JobOut(
        id=str(doc["_id"]),
        comp_id=str(doc.get("comp_id", "")),
        title=doc.get("title", ""),
        description=doc.get("description", ""),
        employment_type=doc.get("employment_type", []),
        recruitment_start=doc.get("recruitment_start", ""),
        recruitment_end=doc.get("recruitment_end", ""),
        candidates_total=doc.get("candidates_total", 1),
        candidates_filled=doc.get("candidates_filled", 0),
        salary=doc.get("salary", ""),
        salary_type=doc.get("salary_type", ""),
        status=doc.get("status", "Pending"),
        interviewers=doc.get("interviewers", []),
        job_created_at=doc.get("job_created_at"),
        job_last_update_datetime=doc.get("job_last_update_datetime"),
    )


def _validate_oid(job_id: str) -> ObjectId:
    """ObjectId.is_valid is cheaper than try/except and gives a clean 400."""
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=400, detail="Invalid job id")
    return ObjectId(job_id)


# ---------- routes -----------------------------------------------------------


async def _interviewers_for_jobs(db, job_ids: list[str]) -> dict[str, list[str]]:
    """Return `{job_id_str: [unique interviewer names]}` for the given jobs.

    The interviewer name is stashed on the job_candidates link when a
    candidate is added via POST /api/jobs/{job_id}/candidates. This
    aggregation reads them back so the JobCard avatar stack on the
    Jobs page reflects who's actually involved.

    One aggregation query per list_jobs call - no N+1 lookups.
    """
    if not job_ids:
        return {}
    pipeline = [
        {"$match": {"job_id": {"$in": job_ids}, "interviewer": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$job_id", "names": {"$addToSet": "$interviewer"}}},
    ]
    out: dict[str, list[str]] = {}
    async for row in db.job_candidates.aggregate(pipeline):
        out[row["_id"]] = row["names"]
    return out


@router.get("", response_model=list[JobOut])
async def list_jobs(
    comp_id: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[JobOut]:
    """List jobs, optionally filtered to a company. Newest-update first.

    Each returned job's `interviewers` array is computed live from the
    job_candidates link table - the field on the job doc itself is just
    a placeholder (`[]` from create_job). This means avatar stacks on
    the JobCard update without needing a separate write path.

    Once routes are auth-gated, replace the optional query param with a
    forced filter from `user["comp_id"]`.
    """
    query = {"comp_id": _comp_oid(comp_id)} if comp_id else {}
    jobs = await db.jobs.find(query).sort("job_last_update_datetime", -1).to_list(length=200)

    interviewers_by_job = await _interviewers_for_jobs(
        db, [str(j["_id"]) for j in jobs]
    )
    return [
        _serialize({**j, "interviewers": interviewers_by_job.get(str(j["_id"]), [])})
        for j in jobs
    ]


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> JobOut:
    oid = _validate_oid(job_id)
    job = await db.jobs.find_one({"_id": oid})
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    # distinct() is cleaner than aggregate() for the single-job case.
    raw = await db.job_candidates.distinct("interviewer", {"job_id": job_id})
    interviewers = [n for n in raw if n]   # drop None / empty strings
    return _serialize({**job, "interviewers": interviewers})


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> JobOut:
    now = datetime.now(timezone.utc)
    body = payload.model_dump()
    body["comp_id"] = _comp_oid(body["comp_id"])  # store ObjectId, not string
    doc = {
        **body,
        # Server-controlled defaults - never trusted from the client.
        "status": "Pending",
        "candidates_filled": 0,
        "interviewers": [],
        "job_created_at": now,
        "job_last_update_datetime": now,
    }
    result = await db.jobs.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.put("/{job_id}", response_model=JobOut)
async def update_job(
    job_id: str,
    payload: JobUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> JobOut:
    oid = _validate_oid(job_id)

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["job_last_update_datetime"] = datetime.now(timezone.utc)

    result = await db.jobs.find_one_and_update(
        {"_id": oid},
        {"$set": updates},
        return_document=True,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _serialize(result)


@router.delete(
    "/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    # response_class=Response (media_type=None) is required by FastAPI 0.115+
    # for any 204 route - the default JSONResponse would try to write a body.
    response_class=Response,
)
async def delete_job(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Delete the job AND all its job_candidates links so we don't leave
    dangling rows pointing at a deleted job. The candidate docs themselves
    are NOT deleted - candidates are shared across many jobs."""
    oid = _validate_oid(job_id)

    result = await db.jobs.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")

    # Cascade: remove the link rows pointing at this job.
    await db.job_candidates.delete_many({"job_id": job_id})


# ---------- Job ⇄ candidates view (compatibility for JobDetailPage) ----------
#
# These two endpoints expose a flat "candidate per job" shape that the
# JobDetailPage was originally built against. Internally they go through
# the proper candidates + job_candidates collections.
#
# The flat shape carries some fields that don't have a "real" home yet in
# the new model (status, scheduled_at, interviewer). They're stashed on
# the job_candidates link as extras until a dedicated interview entity
# lands.


@router.get("/{job_id}/candidates")
async def list_candidates_for_job(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Joined view: every candidate linked to this job, flattened with
    interview-style fields (name / status / score / scheduled_at /
    interviewer) so the table can render directly."""
    oid = _validate_oid(job_id)
    if not await db.jobs.find_one({"_id": oid}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Job not found")

    links = await db.job_candidates.find({"job_id": job_id}).to_list(length=500)
    if not links:
        return []

    # Bulk fetch the candidates referenced by the links. Skip any invalid
    # cand_ids defensively so one bad row can't fail the whole query.
    cand_oids = [ObjectId(l["cand_id"]) for l in links if ObjectId.is_valid(l.get("cand_id", ""))]
    cand_docs = await db.candidates.find({"_id": {"$in": cand_oids}}).to_list(length=500)
    cands_by_id = {str(c["_id"]): c for c in cand_docs}

    out = []
    for link in links:
        c = cands_by_id.get(link.get("cand_id"), {})
        # Average of the three AI scores when available; otherwise fall back
        # to a literal `score` field stashed on the link.
        scores = [
            link.get("communication_score"),
            link.get("skill_score"),
            link.get("problem_solving_score"),
        ]
        scores = [s for s in scores if s is not None]
        avg = sum(scores) / len(scores) if scores else link.get("score")
        out.append({
            "id": str(link["_id"]),
            "cand_id": str(c["_id"]) if c.get("_id") else link.get("cand_id"),
            "job_id": job_id,
            "name": c.get("cand_full_name") or link.get("name", ""),
            "email": c.get("cand_email"),
            "phone": c.get("cand_phone"),
            "status": link.get("status"),
            "scheduled_at": link.get("scheduled_at"),
            "interviewer": link.get("interviewer"),
            "score": avg,
        })
    return out


class AddCandidateToJob(BaseModel):
    """Body for POST /api/jobs/{job_id}/candidates.

    Mirrors the real Candidate model's required fields (name + email) so the
    `candidates` collection ends up with proper data, plus optional contact
    + document URLs and the interview-style fields the modal collects.
    """

    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    cv_url: str | None = None
    cover_letter_url: str | None = None
    # Interview-side fields - stashed on the job_candidates link until a
    # dedicated interview entity exists.
    interviewer: str | None = Field(default=None, max_length=100)
    scheduled_at: str | None = None


@router.post("/{job_id}/candidates", status_code=201)
async def add_candidate_to_job(
    job_id: str,
    payload: AddCandidateToJob,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create-or-reuse a candidate AND link them to this job in one call.

    Dedup behaviour: if a candidate already exists in the same company with
    the same email, that candidate is reused (and missing fields topped up)
    instead of creating a duplicate. Mirrors the create-for-job flow in
    cand.py so the data ends up in the same shape regardless of which
    entry-point was used.

    Returns the joined shape the JobDetailPage table expects:
      { candidate: {flat shape with name/email/etc.}, job: <updated job> }
    """
    oid = _validate_oid(job_id)
    job = await db.jobs.find_one({"_id": oid})
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    now = datetime.now(timezone.utc)
    comp_id = job["comp_id"]  # ObjectId

    # 1. Reuse existing candidate by (comp_id, email) if present.
    candidate = await db.candidates.find_one(
        {"comp_id": comp_id, "cand_email": payload.email}
    )
    if candidate:
        # Top up any fields the existing doc is missing so we don't lose
        # information the user just typed.
        updates = {}
        if payload.name and payload.name != candidate.get("cand_full_name"):
            updates["cand_full_name"] = payload.name
        if payload.phone and payload.phone != candidate.get("cand_phone"):
            updates["cand_phone"] = payload.phone
        if payload.cv_url and payload.cv_url != candidate.get("cand_cv_url"):
            updates["cand_cv_url"] = payload.cv_url
        if payload.cover_letter_url and payload.cover_letter_url != candidate.get("cand_cover_letter_url"):
            updates["cand_cover_letter_url"] = payload.cover_letter_url
        if updates:
            updates["cand_updated_at"] = now
            await db.candidates.update_one({"_id": candidate["_id"]}, {"$set": updates})
            candidate = await db.candidates.find_one({"_id": candidate["_id"]})
        cand_id = str(candidate["_id"])
    else:
        # 2. No match - create a new candidate.
        cand_result = await db.candidates.insert_one({
            "cand_full_name": payload.name,
            "cand_email": payload.email,
            "cand_phone": payload.phone,
            "cand_cv_url": payload.cv_url,
            "cand_cover_letter_url": payload.cover_letter_url,
            "comp_id": comp_id,
            "cand_created_at": now,
            "cand_updated_at": now,
        })
        cand_id = str(cand_result.inserted_id)

    # 3. Already linked to this job? Don't double-link, just return the
    #    existing relationship.
    existing_link = await db.job_candidates.find_one(
        {"cand_id": cand_id, "job_id": job_id}
    )
    if existing_link:
        return {
            "candidate": {
                "id": str(existing_link["_id"]),
                "cand_id": cand_id,
                "job_id": job_id,
                "name": payload.name,
                "email": payload.email,
                "phone": payload.phone,
                "cv_url": payload.cv_url,
                "cover_letter_url": payload.cover_letter_url,
                "interviewer": existing_link.get("interviewer"),
                "scheduled_at": existing_link.get("scheduled_at"),
                "status": existing_link.get("status") or "SCHEDULED",
                "score": existing_link.get("score"),
            },
            "job": _serialize(job).model_dump(),
        }

    # 4. Create the link row + bump the job's candidates_filled counter.
    link_result = await db.job_candidates.insert_one({
        "cand_id": cand_id,
        "job_id": job_id,
        # Display fields stashed on the link until a proper interview entity:
        "interviewer": payload.interviewer,
        "scheduled_at": payload.scheduled_at,
        "status": "SCHEDULED",
        "score": None,
        # AI-pipeline fields stay null until the analysis writes them:
        "cv_analysis": None,
        "communication_score": None,
        "skill_score": None,
        "problem_solving_score": None,
        "created_at": now,
        "updated_at": now,
    })

    updated_job = await db.jobs.find_one_and_update(
        {"_id": oid},
        {
            "$inc": {"candidates_filled": 1},
            "$set": {"job_last_update_datetime": now},
        },
        return_document=True,
    )

    return {
        "candidate": {
            "id": str(link_result.inserted_id),
            "cand_id": cand_id,
            "job_id": job_id,
            "name": payload.name,
            "email": payload.email,
            "phone": payload.phone,
            "cv_url": payload.cv_url,
            "cover_letter_url": payload.cover_letter_url,
            "interviewer": payload.interviewer,
            "scheduled_at": payload.scheduled_at,
            "status": "SCHEDULED",
            "score": None,
        },
        "job": _serialize(updated_job).model_dump(),
    }
