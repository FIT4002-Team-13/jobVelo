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
from dependencies import get_current_comp_id, get_current_user
from models.job import JobCreate, JobOut, JobUpdate
from services.file_storage import delete_upload

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


async def delete_cv_analyses_for_links(db, jobcand_ids: list[str]) -> None:
    """Cascade helper: remove the cv_analyses docs for these job-candidate
    links AND the PDF files they own. Best-effort on the files (the DB row
    is the source of truth), exact on the docs."""
    if not jobcand_ids:
        return
    async for doc in db.cv_analyses.find(
        {"jobcand_id": {"$in": jobcand_ids}},
        {"cv_path": 1, "cover_letter_path": 1},
    ):
        await delete_upload(doc.get("cv_path"))
        await delete_upload(doc.get("cover_letter_path"))
    await db.cv_analyses.delete_many({"jobcand_id": {"$in": jobcand_ids}})


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


async def _job_stats(db, job_ids: list[str]) -> dict[str, dict]:
    """Per-job stats derived live from job_candidates + interviews +
    interview_users. Count comes from job_candidates, interviewer names
    come from users linked through interview_users.
    """
    if not job_ids:
        return {}

    out: dict[str, dict] = {
        job_id: {"count": 0, "interviewers": []} for job_id in job_ids
    }

    # Candidate count is still purely the number of link rows.
    pipeline = [
        {"$match": {"job_id": {"$in": job_ids}}},
        {"$group": {"_id": "$job_id", "count": {"$sum": 1}}},
    ]
    async for row in db.job_candidates.aggregate(pipeline):
        out[row["_id"]]["count"] = row["count"]

    # Pull all interviews for these jobs.
    interviews = await db.interviews.find({"job_id": {"$in": job_ids}}).to_list(
        length=5000
    )

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
        i for i in interviews if (i.get("cand_id"), i.get("job_id")) in link_pairs
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
            user.get("full_name") or user.get("username") or user.get("email")
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
        _serialize(
            {
                **j,
                "interviewers": stats.get(str(j["_id"]), {}).get("interviewers", []),
                "candidates_filled": stats.get(str(j["_id"]), {}).get("count", 0),
            }
        )
        for j in jobs
    ]



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

    return _serialize(
        {
            **job,
            "interviewers": stats.get(job_id, {}).get("interviewers", []),
            "candidates_filled": stats.get(job_id, {}).get("count", 0),
        }
    )

async def require_job_manager(
    user: dict = Depends(get_current_user),
) -> dict:
    if user.get("role") not in ("admin", "recruiter"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters and admins can manage jobs.",
        )
    return user

@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    comp_id: ObjectId = Depends(get_current_comp_id),
    user: dict = Depends(require_job_manager),
) -> JobOut:
    """Create a job in the caller's company. Any comp_id in the body is
    IGNORED - we substitute the JWT one so a user can't create jobs in a
    company they don't belong to."""
    if user.get("role") not in ("admin", "recruiter"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters and admins can manage jobs.",
        )
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
    user: dict = Depends(require_job_manager),
) -> JobOut:
    if user.get("role") not in ("admin", "recruiter"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters and admins can manage jobs.",
        )
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

    # Return the same computed fields the list/get endpoints carry
    # (candidates_filled + interviewers). Without them the frontend's
    # optimistic card update rendered 0 candidates and an empty avatar
    # stack until the next full refresh.
    stats = await _job_stats(db, [job_id])
    return _serialize(
        {
            **result,
            "interviewers": stats.get(job_id, {}).get("interviewers", []),
            "candidates_filled": stats.get(job_id, {}).get("count", 0),
        }
    )


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
    user: dict = Depends(require_job_manager),
):
    """Delete the job AND everything hanging off it: job_candidates links,
    interviews (+ interviewer links), and cv_analyses docs/files. The
    candidate docs themselves are NOT deleted - candidates are shared
    across many jobs.

    Without the full cascade, orphaned interviews kept feeding the
    dashboard status rollup (pinning candidates at "SCHEDULED" forever)
    and analysis PDFs accumulated on disk unreachably."""
    
    if user.get("role") not in ("admin", "recruiter"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters and admins can manage jobs.",
        )
    oid = _validate_oid(job_id)

    # Collect the dependent ids BEFORE deleting anything.
    link_ids = [
        str(link["_id"])
        async for link in db.job_candidates.find({"job_id": job_id}, {"_id": 1})
    ]
    interview_ids = [
        str(i["_id"]) async for i in db.interviews.find({"job_id": job_id}, {"_id": 1})
    ]

    # Only delete if the job belongs to the caller's company.
    result = await db.jobs.delete_one({"_id": oid, "comp_id": comp_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")

    # Cascade: links, their CV analyses (+ files), interviews, interviewer links.
    await db.job_candidates.delete_many({"job_id": job_id})
    await delete_cv_analyses_for_links(db, link_ids)
    if interview_ids:
        await db.interview_users.delete_many({"intv_id": {"$in": interview_ids}})
        await db.interviews.delete_many({"job_id": job_id})


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


async def _link_row(
    db,
    link: dict,
    job_id: str,
    name,
    email,
    phone,
    cv_url=None,
    cover_letter_url=None,
) -> dict:
    """Build the same flat row shape GET /{job_id}/candidates returns, for a
    single link. The POST endpoints return this so the optimistic row the
    frontend appends renders identically to what a refresh would show
    (status/interviewer/schedule included) instead of a hardcoded stub."""
    cand_id = link.get("cand_id")
    interview_docs = await db.interviews.find(
        {"job_id": job_id, "cand_id": cand_id}
    ).to_list(length=20)
    # Last-wins mirrors the GET's dict-keying of interviews by cand_id.
    interview = interview_docs[-1] if interview_docs else None
    completed_interview = next(
        (i for i in interview_docs if i.get("intv_status") == "completed"),
        None,
    )

    interviewer_name = None
    if interview is not None:
        iu = await db.interview_users.find_one({"intv_id": str(interview["_id"])})
        if iu and ObjectId.is_valid(iu.get("user_id", "")):
            u = await db.users.find_one(
                {"_id": ObjectId(iu["user_id"])}, {"password_hash": 0}
            )
            if u:
                interviewer_name = (
                    u.get("full_name") or u.get("username") or u.get("email")
                )

    scores = [
        link.get("communication_score"),
        link.get("skill_score"),
        link.get("problem_solving_score"),
    ]
    scores = [s for s in scores if s is not None]
    avg = sum(scores) / len(scores) if scores else link.get("score")

    return {
        "id": str(link["_id"]),
        "cand_id": cand_id,
        "job_id": job_id,
        "name": name,
        "email": email,
        "phone": phone,
        "cv_url": cv_url,
        "cover_letter_url": cover_letter_url,
        "status": (
            (interview.get("intv_status") or "not_scheduled").replace("_", " ").upper()
            if interview
            else "NOT SCHEDULED"
        ),
        "scheduled_at": (
            interview.get("intv_date_time") if interview else link.get("scheduled_at")
        ),
        "interviewer": interviewer_name,
        "communication_score": link.get("communication_score"),
        "skill_score": link.get("skill_score"),
        "problem_solving_score": link.get("problem_solving_score"),
        "score": avg,
        "intv_completed": completed_interview is not None,
        "intv_id": str(completed_interview["_id"]) if completed_interview else None,
    }


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

    # Validate the interviewer BEFORE creating anything, so a bad id can't
    # leave a half-created candidate+link with no interview. Must be a real
    # user in the caller's company (404, not 403 - don't reveal other
    # companies' user ids).
    if payload.interviewer_user_id:
        if not ObjectId.is_valid(payload.interviewer_user_id):
            raise HTTPException(status_code=400, detail="Invalid interviewer_user_id")
        interviewer_user = await db.users.find_one(
            {"_id": ObjectId(payload.interviewer_user_id), "comp_id": comp_id, "role": {"$in": ["interviewer", "hiring_manager"]}},
            {"_id": 1},
        )
        if interviewer_user is None:
            raise HTTPException(status_code=404, detail="Interviewer not found")

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
        if payload.cover_letter_url and payload.cover_letter_url != candidate.get(
            "cand_cover_letter_url"
        ):
            updates["cand_cover_letter_url"] = payload.cover_letter_url
        if updates:
            updates["cand_updated_at"] = now
            await db.candidates.update_one({"_id": candidate["_id"]}, {"$set": updates})
            candidate = await db.candidates.find_one({"_id": candidate["_id"]})
        cand_id = str(candidate["_id"])
    else:
        # 2. No match - create a new candidate.
        cand_result = await db.candidates.insert_one(
            {
                "cand_full_name": payload.name,
                "cand_email": payload.email,
                "cand_phone": payload.phone,
                "cand_cv_url": payload.cv_url,
                "cand_cover_letter_url": payload.cover_letter_url,
                "comp_id": comp_id,
                "cand_created_at": now,
                "cand_updated_at": now,
            }
        )
        cand_id = str(cand_result.inserted_id)

    # 3. Already linked to this job? Don't double-link, just return the
    #    existing relationship.
    existing_link = await db.job_candidates.find_one(
        {"cand_id": cand_id, "job_id": job_id}
    )
    if existing_link:
        # Return the link's REAL current state (was a hardcoded "SCHEDULED"
        # stub, which made the optimistic row lie until the next refresh).
        row = await _link_row(
            db,
            existing_link,
            job_id,
            payload.name,
            payload.email,
            payload.phone,
            cv_url=candidate.get("cand_cv_url"),
            cover_letter_url=candidate.get("cand_cover_letter_url"),
        )
        return {
            "candidate": row,
            "job": _serialize(job).model_dump(),
        }

    # 4. Create the link row (status lives on Interview per UML, not here).
    link_result = await db.job_candidates.insert_one(
        {
            "cand_id": cand_id,
            "job_id": job_id,
            "score": None,
            "cv_analysis": None,
            "communication_score": None,
            "skill_score": None,
            "problem_solving_score": None,
            "created_at": now,
            "updated_at": now,
        }
    )

    # 5. Create interview document whenever a date or interviewer is provided.
    scheduled_dt = None
    if payload.scheduled_at:
        try:
            scheduled_dt = datetime.fromisoformat(payload.scheduled_at)
        except ValueError:
            pass

    if scheduled_dt or payload.interviewer_user_id:
        intv_status = "scheduled" if scheduled_dt else "not_scheduled"
        interview_result = await db.interviews.insert_one(
            {
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
            }
        )

        # 6. Link interviewer via interview_users.
        if payload.interviewer_user_id:
            await db.interview_users.insert_one(
                {
                    "user_id": payload.interviewer_user_id,
                    "intv_id": str(interview_result.inserted_id),
                    "intvuser_created_at": now,
                    "intvuser_updated_at": now,
                }
            )

    # Touch job timestamp so listings re-order correctly.
    updated_job = await db.jobs.find_one_and_update(
        {"_id": oid},
        {"$set": {"job_last_update_datetime": now}},
        return_document=True,
    )

    count = await db.job_candidates.count_documents({"job_id": job_id})
    stats = await _job_stats(db, [job_id])

    # Build the row from what was ACTUALLY created - the status reflects
    # the real interview ("SCHEDULED"/"NOT SCHEDULED"/none) and the
    # interviewer name resolves through interview_users, exactly like a
    # GET would report it.
    new_link = await db.job_candidates.find_one({"_id": link_result.inserted_id})
    row = await _link_row(
        db,
        new_link,
        job_id,
        payload.name,
        payload.email,
        payload.phone,
        cv_url=payload.cv_url,
        cover_letter_url=payload.cover_letter_url,
    )

    return {
        "candidate": row,
        "job": _serialize(
            {
                **updated_job,
                "candidates_filled": count,
                "interviewers": stats.get(job_id, {}).get("interviewers", []),
            }
        ).model_dump(),
    }
