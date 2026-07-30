# from __future__ import annotations

# from typing import Any

# from fastapi import APIRouter, HTTPException, Query, status

# from database import get_db

# router = APIRouter(prefix="/api/applications", tags=["applications"])


# def _safe_avg_score(job_candidate: dict[str, Any]) -> float | None:
#     scores = [
#         job_candidate.get("communication_score"),
#         job_candidate.get("skill_score"),
#         job_candidate.get("problem_solving_score"),
#     ]
#     valid_scores = [float(s) for s in scores if s is not None]
#     if not valid_scores:
#         return None
#     return round(sum(valid_scores) / len(valid_scores), 1)


# @router.get("")
# async def list_applications(
#     interviewer_name: str = Query(..., description="Current interviewer full name"),
# ) -> list[dict[str, Any]]:
#     db = get_db()

#     if not interviewer_name.strip():
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail="Invalid interviewer name.",
#         )

#     # Applications are currently represented by job_candidates rows.
#     # The job page already relies on this shape, so we reuse the same source.
#     links = await db.job_candidates.find(
#         {"interviewer": interviewer_name}
#     ).to_list(length=2000)

#     if not links:
#         return []

#     cand_ids = [link.get("cand_id") for link in links if link.get("cand_id")]
#     job_ids = [link.get("job_id") for link in links if link.get("job_id")]

#     # candidates._id and jobs._id are ObjectIds, but job_candidates stores ids as strings.
#     from bson import ObjectId

#     cand_oids = [ObjectId(cid) for cid in cand_ids if ObjectId.is_valid(cid)]
#     job_oids = [ObjectId(jid) for jid in job_ids if ObjectId.is_valid(jid)]

#     candidates = await db.candidates.find(
#         {"_id": {"$in": cand_oids}}
#     ).to_list(length=2000)

#     jobs = await db.jobs.find(
#         {"_id": {"$in": job_oids}}
#     ).to_list(length=2000)

#     candidate_map = {str(c["_id"]): c for c in candidates}
#     job_map = {str(j["_id"]): j for j in jobs}

#     rows: list[dict[str, Any]] = []

#     for link in links:
#         cand_id = link.get("cand_id")
#         job_id = link.get("job_id")

#         if not isinstance(cand_id, str) or not isinstance(job_id, str):
#             continue

#         candidate = candidate_map.get(cand_id)
#         job = job_map.get(job_id)

#         if not candidate or not job:
#             continue

#         rows.append(
#             {
#                 "application_id": str(link["_id"]),
#                 "cand_id": str(candidate["_id"]),
#                 "candidate_name": candidate.get("cand_full_name") or "Unknown",
#                 "email": candidate.get("cand_email") or "",
#                 "phone": candidate.get("cand_phone") or "",
#                 "job_id": str(job["_id"]),
#                 "job_title": job.get("title") or "",
#                 "status": link.get("status") or "SCHEDULED",
#                 "cv_url": candidate.get("cand_cv_url"),
#                 "cover_letter_url": candidate.get("cand_cover_letter_url"),
#                 "score": _safe_avg_score(link) if any(
#                     s is not None
#                     for s in [
#                         link.get("communication_score"),
#                         link.get("skill_score"),
#                         link.get("problem_solving_score"),
#                     ]
#                 ) else link.get("score"),
#                 "interview_datetime": link.get("scheduled_at"),
#             }
#         )

#     rows.sort(
#         key=lambda row: row.get("interview_datetime") or "",
#         reverse=True,
#     )

#     return rows

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_db
from dependencies import get_current_comp_id

router = APIRouter(prefix="/api/applications", tags=["applications"])


def _safe_avg_score(job_candidate: dict[str, Any]) -> float | None:
    scores = [
        job_candidate.get("communication_score"),
        job_candidate.get("skill_score"),
        job_candidate.get("problem_solving_score"),
    ]
    valid_scores = [float(s) for s in scores if s is not None]
    if not valid_scores:
        return None
    return round(sum(valid_scores) / len(valid_scores), 1)


@router.get("")
async def list_applications(
    user_id: str = Query(..., description="Current user's MongoDB _id (string)"),
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[dict[str, Any]]:
    db = get_db()

    if not user_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user_id.",
        )

    # Tenant guard: the requested interviewer must belong to the caller's
    # company. Without this, anyone could pass another company's user_id
    # and read that interviewer's whole application list.
    interviewer_user = (
        await db.users.find_one({"_id": ObjectId(user_id), "comp_id": comp_id})
        if ObjectId.is_valid(user_id) else None
    )
    if not interviewer_user:
        raise HTTPException(status_code=404, detail="User not found")
    interviewer_name = (
        interviewer_user.get("full_name") or interviewer_user.get("username") or ""
    )

    # Set of the company's job ids - used to drop any application row whose
    # job belongs to a different company (defence-in-depth on the join below).
    company_job_ids = {
        str(j["_id"]) async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})
    }

    # Find all interview links for this user directly by ID — no name lookup.
    interview_user_links = await db.interview_users.find(
        {"user_id": user_id}
    ).to_list(length=2000)

    interview_ids = [
        link.get("intv_id")
        for link in interview_user_links
        if link.get("intv_id")
    ]

    interview_oids = [
        ObjectId(iid)
        for iid in interview_ids
        if ObjectId.is_valid(iid)
    ]

    interviews = []
    if interview_oids:
        interviews = await db.interviews.find(
            {"_id": {"$in": interview_oids}}
        ).to_list(length=2000)

    # Build a set of assigned candidate-job pairs.
    assigned_pairs = {
        (i.get("cand_id"), i.get("job_id"))
        for i in interviews
        if i.get("cand_id") and i.get("job_id")
    }

    if not assigned_pairs:
        return []

    # Pull all job-candidate links, then keep only assigned ones.
    all_job_candidates = await db.job_candidates.find({}).to_list(length=5000)

    matched_job_candidates = [
        jc for jc in all_job_candidates
        if (jc.get("cand_id"), jc.get("job_id")) in assigned_pairs
        # Only keep rows whose job is in the caller's company.
        and jc.get("job_id") in company_job_ids
    ]

    if not matched_job_candidates:
        return []

    cand_ids = [jc.get("cand_id") for jc in matched_job_candidates if jc.get("cand_id")]
    job_ids = [jc.get("job_id") for jc in matched_job_candidates if jc.get("job_id")]

    candidate_oids = [ObjectId(cid) for cid in cand_ids if ObjectId.is_valid(cid)]
    job_oids = [ObjectId(jid) for jid in job_ids if ObjectId.is_valid(jid)]

    candidates = await db.candidates.find(
        {"_id": {"$in": candidate_oids}}
    ).to_list(length=2000)

    jobs = await db.jobs.find(
        {"_id": {"$in": job_oids}}
    ).to_list(length=2000)

    candidate_map = {str(c["_id"]): c for c in candidates}
    job_map = {str(j["_id"]): j for j in jobs}
    interview_map = {
        (i.get("cand_id"), i.get("job_id")): i
        for i in interviews
    }

    rows: list[dict[str, Any]] = []

    for jc in matched_job_candidates:
        cand_id = jc.get("cand_id")
        job_id = jc.get("job_id")

        candidate = candidate_map.get(cand_id)
        job = job_map.get(job_id)
        interview = interview_map.get((cand_id, job_id))

        if not candidate or not job:
            continue

        rows.append(
            {
                "application_id": str(jc["_id"]),
                "cand_id": str(candidate["_id"]),
                "candidate_name": candidate.get("cand_full_name") or "Unknown",
                "email": candidate.get("cand_email") or "",
                "phone": candidate.get("cand_phone") or "",
                "job_id": str(job["_id"]),
                "job_title": job.get("title") or "",
                "status": (interview.get("intv_status") or "not_scheduled").replace("_", " ").upper() if interview else "NOT SCHEDULED",
                "cv_url": candidate.get("cand_cv_url"),
                "cover_letter_url": candidate.get("cand_cover_letter_url"),
                "score": _safe_avg_score(jc),
                "interview_datetime": interview.get("intv_date_time") if interview else None,
                "interviewer": interviewer_name,
                "interviewer_user_id": user_id,
            }
        )

    def _sort_key(row):
        dt = row.get("interview_datetime")
        if dt is None:
            return datetime.datetime.min.replace(tzinfo=timezone(timedelta(hours=10), 'AEST'))
        if hasattr(dt, "tzinfo") and dt.tzinfo is not None:
            return dt.replace(tzinfo=None)
        return dt

    rows.sort(key=_sort_key, reverse=True)

    return rows


class ApplicationUpdate(BaseModel):
    job_id: str
    interviewer_user_id: str | None = None
    scheduled_at: str | None = None


@router.patch("/{application_id}")
async def update_application(
    application_id: str,
    payload: ApplicationUpdate,
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    db = get_db()

    if not ObjectId.is_valid(application_id):
        raise HTTPException(status_code=400, detail="Invalid application id.")

    application = await db.job_candidates.find_one({"_id": ObjectId(application_id)})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found.")

    # Tenant guard: the application's current job AND the target job_id the
    # caller wants to move it to must both belong to the caller's company.
    old_job_id = application["job_id"]
    cand_id = application["cand_id"]
    for jid in (old_job_id, payload.job_id):
        if not jid or not ObjectId.is_valid(jid) or not await db.jobs.find_one(
            {"_id": ObjectId(jid), "comp_id": comp_id}, {"_id": 1}
        ):
            raise HTTPException(status_code=404, detail="Application not found.")

    now = datetime.now(timezone.utc)

    # 1. Update the job-candidate link.
    await db.job_candidates.update_one(
        {"_id": ObjectId(application_id)},
        {
            "$set": {
                "job_id": payload.job_id,
                "updated_at": now,
            }
        },
    )

    # 2. Find or create the interview for this candidate/job.
    interview = await db.interviews.find_one({
        "cand_id": cand_id,
        "job_id": old_job_id,
    })

    scheduled_dt = None
    if payload.scheduled_at:
        try:
            scheduled_dt = datetime.fromisoformat(payload.scheduled_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid scheduled_at.")

    intv_status = "scheduled" if scheduled_dt else "not_scheduled"

    if interview:
        await db.interviews.update_one(
            {"_id": interview["_id"]},
            {
                "$set": {
                    "job_id": payload.job_id,
                    "intv_date_time": scheduled_dt,
                    "intv_status": intv_status,
                    "intv_updated_at": now,
                }
            },
        )
        interview = await db.interviews.find_one({"_id": interview["_id"]})
    else:
        result = await db.interviews.insert_one({
            "cand_id": cand_id,
            "job_id": payload.job_id,
            "intv_date_time": scheduled_dt,
            "intv_location": None,
            "intv_transcript": None,
            "intv_status": intv_status,
            "intv_candidate_report": None,
            "intv_interviewer_report": None,
            "intv_created_at": now,
            "intv_updated_at": now,
        })
        interview = await db.interviews.find_one({"_id": result.inserted_id})

    # 3. Update interview_users link only if an interviewer_user_id was provided.
    # Using user_id (not a free-text name) keeps the link reliable — no name
    # typos can silently drop the candidate from the applications table.
    intv_id_str = str(interview["_id"])

    if payload.interviewer_user_id:
        if not ObjectId.is_valid(payload.interviewer_user_id):
            raise HTTPException(status_code=400, detail="Invalid interviewer_user_id.")

        # The interviewer being assigned must belong to the caller's company.
        if not await db.users.find_one(
            {"_id": ObjectId(payload.interviewer_user_id), "comp_id": comp_id}, {"_id": 1}
        ):
            raise HTTPException(status_code=404, detail="Interviewer not found.")

        existing_link = await db.interview_users.find_one({
            "intv_id": intv_id_str,
            "user_id": payload.interviewer_user_id,
        })

        if not existing_link:
            await db.interview_users.delete_many({"intv_id": intv_id_str})
            await db.interview_users.insert_one({
                "user_id": payload.interviewer_user_id,
                "intv_id": intv_id_str,
                "intvuser_created_at": now,
                "intvuser_updated_at": now,
            })

    return {
        "ok": True,
        "application_id": application_id,
        "job_id": payload.job_id,
        "interviewer_user_id": payload.interviewer_user_id,
        "scheduled_at": payload.scheduled_at,
    }