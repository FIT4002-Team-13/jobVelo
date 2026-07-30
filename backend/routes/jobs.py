r"""Job-post routes.

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
from dependencies import get_current_comp_id
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


# async def _job_stats(db, job_ids: list[str]) -> dict[str, dict]:
#     """Per-job stats derived live from the job_candidates link table:
#         { job_id_str: { count: N, interviewers: [unique names] } }

#     Both fields are computed on read so the JobCard never drifts away
#     from reality - e.g. when a candidate row is deleted (or the whole
#     collection nuked), the count + avatar stack catch up immediately
#     on the next request. No stored counter to keep in sync, no need
#     for decrements on cascade-delete.
#     """
#     if not job_ids:
#         return {}
#     pipeline = [
#         {"$match": {"job_id": {"$in": job_ids}}},
#         {"$group": {
#             "_id": "$job_id",
#             "count": {"$sum": 1},
#             "names": {"$addToSet": "$interviewer"},
#         }},
#     ]
#     out: dict[str, dict] = {}
#     async for row in db.job_candidates.aggregate(pipeline):
#         out[row["_id"]] = {
#             "count": row["count"],
#             "interviewers": [n for n in row["names"] if n],   # drop None/""
#         }
#     return out

async def _job_stats(db, job_ids: list[str]) -> dict[str, dict]:
    """Per-job stats derived live from job_candidates + interviews +
    interview_users. Count comes from job_candidates, interviewer names
    come from users linked through interview_users.
    """
    if not job_ids:
        return {}

    out: dict[str, dict] = {
        job_id: {"count": 0, "interviewers": []}
        for job_id in job_ids
    }

    # Candidate count is still purely the number of link rows.
    pipeline = [
        {"$match": {"job_id": {"$in": job_ids}}},
        {"$group": {"_id": "$job_id", "count": {"$sum": 1}}},
    ]
    async for row in db.job_candidates.aggregate(pipeline):
        out[row["_id"]]["count"] = row["count"]

    # Pull all interviews for these jobs.
    interviews = await db.interviews.find(
        {"job_id": {"$in": job_ids}}
    ).to_list(length=5000)

    if not interviews:
        return out

    # Drop orphan interviews — ones whose (cand_id, job_id) no longer has a
    # matching job_candidates row. Without this filter, an interview that was
    # never cleaned up after candidate removal would still surface its
    # interviewer avatar on the job card.
    link_pairs = set()
    async for link in db.job_candidates.find(
        {"job_id": {"$in": job_ids}},
        {"cand_id": 1, "job_id": 1},
    ):
        link_pairs.add((link.get("cand_id"), link.get("job_id")))

    interviews = [
        i for i in interviews
        if (i.get("cand_id"), i.get("job_id")) in link_pairs
    ]

    if not interviews:
        return out

    interview_ids = [str(i["_id"]) for i in interviews]
    job_by_interview_id = {str(i["_id"]): i.get("job_id") for i in interviews}

    # Pull all interviewer links for those interviews.
    interview_user_links = await db.interview_users.find(
        {"intv_id": {"$in": interview_ids}}
    ).to_list(length=5000)

    user_ids = [
        link.get("user_id")
        for link in interview_user_links
        if ObjectId.is_valid(link.get("user_id", ""))
    ]

    if not user_ids:
        return out

    users = await db.users.find(
        {"_id": {"$in": [ObjectId(uid) for uid in user_ids]}},
        {"password_hash": 0},
    ).to_list(length=5000)

    users_by_id = {str(u["_id"]): u for u in users}

    names_by_job: dict[str, set[str]] = {job_id: set() for job_id in job_ids}

    for link in interview_user_links:
        intv_id = link.get("intv_id")
        user_id = link.get("user_id")
        job_id = job_by_interview_id.get(intv_id)
        user = users_by_id.get(user_id)

        if not job_id or not user:
            continue

        display_name = (
            user.get("full_name")
            or user.get("username")
            or user.get("email")
        )
        if display_name:
            names_by_job.setdefault(job_id, set()).add(display_name)

    for job_id in job_ids:
        out[job_id]["interviewers"] = sorted(names_by_job.get(job_id, set()))

    return out


@router.get("", response_model=list[JobOut])
async def list_jobs(
    db: AsyncIOMotorDatabase = Depends(get_db),
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[JobOut]:
    """List jobs in the caller's company. Newest-update first.

    Tenant isolation: comp_id is sourced from the JWT - the client cannot
    pass a different comp_id to view another company's jobs.

    Each returned job's `interviewers` array is computed live from the
    job_candidates link table - the field on the job doc itself is just
    a placeholder (`[]` from create_job).
    """
    jobs = await (
        db.jobs.find({"comp_id": comp_id})
        .sort("job_last_update_datetime", -1)
        .to_list(length=200)
    )

    stats = await _job_stats(db, [str(j["_id"]) for j in jobs])
    return [
        _serialize({
            **j,
            "interviewers":      stats.get(str(j["_id"]), {}).get("interviewers", []),
            "candidates_filled": stats.get(str(j["_id"]), {}).get("count", 0),
        })
        for j in jobs
    ]


#@router.get("/{job_id}", response_model=JobOut)
# async def get_job(
#     job_id: str,
#     db: AsyncIOMotorDatabase = Depends(get_db),
# ) -> JobOut:
#     oid = _validate_oid(job_id)
#     job = await db.jobs.find_one({"_id": oid})
#     if job is None:
#         raise HTTPException(status_code=404, detail="Job not found")

#     # Count + interviewers both computed on read so a deleted candidate
#     # row (or a dropped collection) doesn't leave the counter stale.
#     count = await db.job_candidates.count_documents({"job_id": job_id})
#     raw = await db.job_candidates.distinct("interviewer", {"job_id": job_id})
#     interviewers = [n for n in raw if n]
#     return _serialize({
#         **job,
#         "interviewers": interviewers,
#         "candidates_filled": count,
#     })
@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> JobOut:
    oid = _validate_oid(job_id)
    # Filter by comp_id so jobs in another company return 404 (not 403) -
    # we don't reveal the existence of records the caller can't see.
    job = await db.jobs.find_one({"_id": oid, "comp_id": comp_id})
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    stats = await _job_stats(db, [job_id])

    return _serialize({
        **job,
        "interviewers": stats.get(job_id, {}).get("interviewers", []),
        "candidates_filled": stats.get(job_id, {}).get("count", 0),
    })


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> JobOut:
    """Create a job in the caller's company. Any comp_id in the body is
    IGNORED - we substitute the JWT one so a user can't create jobs in a
    company they don't belong to."""
    now = datetime.now(timezone.utc)
    body = payload.model_dump()
    body["comp_id"] = comp_id  # JWT-derived; ignore whatever the client sent
    # `candidates_filled` and `interviewers` are NOT stored on the doc -
    # they're computed live from job_candidates on every read so they can't
    # drift. _serialize fills them with safe defaults (0 / []) when missing.
    doc = {
        **body,
        "status": "Pending",
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
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> JobOut:
    oid = _validate_oid(job_id)

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["job_last_update_datetime"] = datetime.now(timezone.utc)

    # Two-part filter: only updates if the job ALSO belongs to the caller's
    # company. Cross-tenant edits fall into the 404 branch.
    result = await db.jobs.find_one_and_update(
        {"_id": oid, "comp_id": comp_id},
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
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Delete the job AND all its job_candidates links so we don't leave
    dangling rows pointing at a deleted job. The candidate docs themselves
    are NOT deleted - candidates are shared across many jobs."""
    oid = _validate_oid(job_id)

    # Only delete if the job belongs to the caller's company.
    result = await db.jobs.delete_one({"_id": oid, "comp_id": comp_id})
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
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Joined view: every candidate linked to this job, flattened with
    interview-style fields (name / status / score / scheduled_at /
    interviewer) so the table can render directly.

    Tenant guard: 404s if the job belongs to a different company.
    """
    oid = _validate_oid(job_id)
    if not await db.jobs.find_one({"_id": oid, "comp_id": comp_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Job not found")

    links = await db.job_candidates.find({"job_id": job_id}).to_list(length=500)
    if not links:
        return []

    # Bulk-fetch candidates.
    cand_oids = [ObjectId(link["cand_id"]) for link in links if ObjectId.is_valid(link.get("cand_id", ""))]
    cand_docs = await db.candidates.find({"_id": {"$in": cand_oids}}).to_list(length=500)
    cands_by_id = {str(c["_id"]): c for c in cand_docs}

    # Bulk-fetch interviews for this job, keyed by cand_id.
    interviews = await db.interviews.find({"job_id": job_id}).to_list(length=500)
    interview_by_cand = {i.get("cand_id"): i for i in interviews}

    # Bulk-fetch interview_user links for those interviews.
    interview_ids = [str(i["_id"]) for i in interviews]
    intv_user_links = []
    if interview_ids:
        intv_user_links = await db.interview_users.find(
            {"intv_id": {"$in": interview_ids}}
        ).to_list(length=500)
    user_id_by_intv = {lnk["intv_id"]: lnk["user_id"] for lnk in intv_user_links if lnk.get("intv_id")}

    # Bulk-fetch users for those interviewers.
    user_ids = list({uid for uid in user_id_by_intv.values() if ObjectId.is_valid(uid)})
    users_by_id: dict = {}
    if user_ids:
        user_docs = await db.users.find(
            {"_id": {"$in": [ObjectId(uid) for uid in user_ids]}},
            {"password_hash": 0},
        ).to_list(length=500)
        users_by_id = {str(u["_id"]): u for u in user_docs}

    out = []
    for link in links:
        cand_id = link.get("cand_id")
        c = cands_by_id.get(cand_id, {})

        # Resolve interviewer name from the interview chain only. The legacy
        # `job_candidates.interviewer` field is intentionally ignored — old
        # rows can hold a stale name string from before the interview_users
        # migration, which would surface a phantom interviewer on jobs that
        # have none assigned.
        interview = interview_by_cand.get(cand_id)
        intv_id = str(interview["_id"]) if interview else None
        user_id = user_id_by_intv.get(intv_id) if intv_id else None
        user = users_by_id.get(user_id) if user_id else None
        interviewer_name = (
            user.get("full_name") or user.get("username") or user.get("email")
        ) if user else None

        # scheduled_at from interview; fall back to stored field.
        scheduled_at = (
            interview.get("intv_date_time") if interview else link.get("scheduled_at")
        )

        scores = [
            link.get("communication_score"),
            link.get("skill_score"),
            link.get("problem_solving_score"),
        ]
        scores = [s for s in scores if s is not None]
        avg = sum(scores) / len(scores) if scores else link.get("score")

        out.append({
            "id": str(link["_id"]),
            "cand_id": str(c["_id"]) if c.get("_id") else cand_id,
            "job_id": job_id,
            "name": c.get("cand_full_name") or link.get("name", ""),
            "email": c.get("cand_email"),
            "phone": c.get("cand_phone"),
            "status": (interview.get("intv_status") or "not_scheduled").replace("_", " ").upper() if interview else "NOT SCHEDULED",
            "scheduled_at": scheduled_at,
            "interviewer": interviewer_name,
            "communication_score":   link.get("communication_score"),
            "skill_score":           link.get("skill_score"),
            "problem_solving_score": link.get("problem_solving_score"),
            "score": avg,
        })
    return out


@router.delete(
    "/{job_id}/candidates/{jobcand_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def remove_candidate_from_job(
    job_id: str,
    jobcand_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Remove a single candidate-job link.

    The candidate document itself stays around because the same candidate
    may be on multiple jobs (or could be reused later). But we DO cascade
    into interviews + interview_users for this (cand_id, job_id) pair —
    otherwise an orphan interview + interviewer link would leave a phantom
    avatar on the job card after the candidate is gone.
    """
    if not ObjectId.is_valid(jobcand_id):
        raise HTTPException(status_code=400, detail="Invalid jobcand_id")

    # Tenant guard: confirm the job belongs to this company before touching
    # anything beneath it.
    oid = _validate_oid(job_id)
    if not await db.jobs.find_one({"_id": oid, "comp_id": comp_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Job not found")

    # Read the link first so we know which candidate to cascade for.
    link = await db.job_candidates.find_one(
        {"_id": ObjectId(jobcand_id), "job_id": job_id}
    )
    if not link:
        raise HTTPException(status_code=404, detail="Candidate link not found on this job")

    cand_id = link.get("cand_id")

    # Scope by job_id too so an attacker can't delete a random link by id.
    await db.job_candidates.delete_one(
        {"_id": ObjectId(jobcand_id), "job_id": job_id}
    )

    # Cascade: find and remove the interview(s) for this candidate/job, plus
    # any interview_users links pointing at them.
    if cand_id:
        interviews = await db.interviews.find(
            {"cand_id": cand_id, "job_id": job_id}
        ).to_list(length=100)

        if interviews:
            intv_id_strs = [str(i["_id"]) for i in interviews]
            await db.interview_users.delete_many({"intv_id": {"$in": intv_id_strs}})
            await db.interviews.delete_many(
                {"_id": {"$in": [i["_id"] for i in interviews]}}
            )


# class AddCandidateToJob(BaseModel):
#     """Body for POST /api/jobs/{job_id}/candidates.

#     Mirrors the real Candidate model's required fields (name + email) so the
#     `candidates` collection ends up with proper data, plus optional contact
#     + document URLs and the interview-style fields the modal collects.
#     """

#     name: str = Field(..., min_length=1, max_length=100)
#     email: EmailStr
#     phone: str | None = Field(default=None, max_length=30)
#     cv_url: str | None = None
#     cover_letter_url: str | None = None
#     # Interview-side fields - stashed on the job_candidates link until a
#     # dedicated interview entity exists.
#     interviewer: str | None = Field(default=None, max_length=100)
#     scheduled_at: str | None = None

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
    interviewer_user_id: str | None = None
    scheduled_at: str | None = None


@router.post("/{job_id}/candidates", status_code=201)
async def add_candidate_to_job(
    job_id: str,
    payload: AddCandidateToJob,
    db: AsyncIOMotorDatabase = Depends(get_db),
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Create-or-reuse a candidate AND link them to this job in one call.

    Dedup behaviour: if a candidate already exists in the same company with
    the same email, that candidate is reused (and missing fields topped up)
    instead of creating a duplicate. Mirrors the create-for-job flow in
    cand.py so the data ends up in the same shape regardless of which
    entry-point was used.

    Tenant guard: the job must belong to the caller's company.

    Returns the joined shape the JobDetailPage table expects:
      { candidate: {flat shape with name/email/etc.}, job: <updated job> }
    """
    oid = _validate_oid(job_id)
    job = await db.jobs.find_one({"_id": oid, "comp_id": comp_id})
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
                "status": "SCHEDULED",
                "score": existing_link.get("score"),
            },
            "job": _serialize(job).model_dump(),
        }

    # 4. Create the link row (status lives on Interview per UML, not here).
    link_result = await db.job_candidates.insert_one({
        "cand_id": cand_id,
        "job_id": job_id,
        "score": None,
        "cv_analysis": None,
        "communication_score": None,
        "skill_score": None,
        "problem_solving_score": None,
        "created_at": now,
        "updated_at": now,
    })

    # 5. Create interview document whenever an interviewer is assigned.
    scheduled_dt = None
    if payload.scheduled_at:
        try:
            scheduled_dt = datetime.fromisoformat(payload.scheduled_at)
        except ValueError:
            pass

    if payload.interviewer_user_id:
        intv_status = "scheduled" if scheduled_dt else "not_scheduled"
        interview_result = await db.interviews.insert_one({
            "cand_id": cand_id,
            "job_id": job_id,
            "intv_date_time": scheduled_dt,
            "intv_location": None,
            "intv_transcript": None,
            "intv_status": intv_status,
            "intv_candidate_report": None,
            "intv_interviewer_report": None,
            "intv_created_at": now,
            "intv_updated_at": now,
        })

        # 6. Link interviewer via interview_users.
        await db.interview_users.insert_one({
            "user_id": payload.interviewer_user_id,
            "intv_id": str(interview_result.inserted_id),
            "intvuser_created_at": now,
            "intvuser_updated_at": now,
        })

    # Touch job timestamp so listings re-order correctly.
    updated_job = await db.jobs.find_one_and_update(
        {"_id": oid},
        {"$set": {"job_last_update_datetime": now}},
        return_document=True,
    )

    count = await db.job_candidates.count_documents({"job_id": job_id})
    stats = await _job_stats(db, [job_id])

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
            "interviewer": None,
            "scheduled_at": payload.scheduled_at,
            "status": "SCHEDULED",
            "score": None,
        },
        "job": _serialize({
            **updated_job,
            "candidates_filled": count,
            "interviewers": stats.get(job_id, {}).get("interviewers", []),
        }).model_dump(),
    }
