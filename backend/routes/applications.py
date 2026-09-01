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

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import get_db
from dependencies import get_current_comp_id, get_current_user

router = APIRouter(prefix="/api/applications", tags=["applications"])


def _safe_avg_score(job_candidate: dict[str, Any]) -> float | None:
    ratings = job_candidate.get("ratings") or {}

    scores = [
        (ratings.get("communication") or {}).get("score"),
        (ratings.get("technical_skills") or {}).get("score"),
        (ratings.get("problem_solving") or {}).get("score"),
    ]

    valid_scores = [float(score) for score in scores if score is not None]

    if not valid_scores:
        return None

    return round(sum(valid_scores) / len(valid_scores), 1)


@router.get("")
async def list_applications(
    user_id: str | None = Query(
        None,
        description="Deprecated - scope now derives from the JWT and this is ignored.",
    ),
    user: dict = Depends(get_current_user),
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[dict[str, Any]]:
    """List applications, scoped by the caller's ROLE (from the JWT):

    - interviewer: only the applications whose interview they are assigned
      to (their personal workload).
    - recruiter / admin / anyone else: every application in the company.
      Previously the list was interviewer-scoped for all roles, so a
      recruiter logged in to an empty Applications page and an empty
      Schedules calendar even when the pipeline was full.

    The legacy `user_id` query param is accepted but ignored - clients used
    to pass their own id, and deriving scope server-side closes the hole
    where any company user could enumerate a colleague's assignments.
    """
    db = get_db()

    # Set of the company's job ids - used to drop any application row whose
    # job belongs to a different company (defence-in-depth on the join below).
    company_job_ids = {
        str(j["_id"]) async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})
    }
    if not company_job_ids:
        return []

    if user.get("role") == "interviewer":
        # Interviewer: applications whose interview they're linked to.
        interview_user_links = await db.interview_users.find(
            {"user_id": str(user["_id"])}
        ).to_list(length=2000)

        interview_oids = [
            ObjectId(link["intv_id"])
            for link in interview_user_links
            if ObjectId.is_valid(link.get("intv_id", ""))
        ]

        interviews = []
        if interview_oids:
            interviews = await db.interviews.find(
                {"_id": {"$in": interview_oids}}
            ).to_list(length=2000)

        assigned_pairs = {
            (i.get("cand_id"), i.get("job_id"))
            for i in interviews
            if i.get("cand_id") and i.get("job_id")
        }

        # Fetch ONLY the links for the (cand, job) pairs this user is
        # assigned to. The (cand_id, job_id) pair is unique-indexed, so this
        # returns at most one doc per pair.
        pair_filters = [
            {"cand_id": cand_id, "job_id": job_id}
            for (cand_id, job_id) in assigned_pairs
            if job_id in company_job_ids
        ]
        if not pair_filters:
            return []

        matched_job_candidates = await db.job_candidates.find(
            {"$or": pair_filters}
        ).to_list(length=len(pair_filters))
    else:
        # Recruiter / admin / hiring manager: the whole company pipeline.
        matched_job_candidates = await db.job_candidates.find(
            {"job_id": {"$in": list(company_job_ids)}}
        ).to_list(length=2000)
        interviews = await db.interviews.find(
            {"job_id": {"$in": list(company_job_ids)}}
        ).to_list(length=2000)

    if not matched_job_candidates:
        return []

    cand_ids = [jc.get("cand_id") for jc in matched_job_candidates if jc.get("cand_id")]
    job_ids = [jc.get("job_id") for jc in matched_job_candidates if jc.get("job_id")]

    candidate_oids = [ObjectId(cid) for cid in cand_ids if ObjectId.is_valid(cid)]
    job_oids = [ObjectId(jid) for jid in job_ids if ObjectId.is_valid(jid)]

    candidates = await db.candidates.find({"_id": {"$in": candidate_oids}}).to_list(
        length=2000
    )

    jobs = await db.jobs.find({"_id": {"$in": job_oids}}).to_list(length=2000)

    candidate_map = {str(c["_id"]): c for c in candidates}
    job_map = {str(j["_id"]): j for j in jobs}
    interview_map = {(i.get("cand_id"), i.get("job_id")): i for i in interviews}

    # Resolve each row's interviewer THROUGH its interview (interview ->
    # interview_users -> users). The old code stamped the requesting user's
    # own name on every row, which was only coincidentally right for the
    # interviewer-scoped view and wrong for the company-wide one.
    intv_id_strs = [str(i["_id"]) for i in interviews]
    interviewer_id_by_intv: dict[str, str] = {}
    if intv_id_strs:
        async for link in db.interview_users.find(
            {"intv_id": {"$in": intv_id_strs}}, {"intv_id": 1, "user_id": 1}
        ):
            interviewer_id_by_intv[link.get("intv_id")] = link.get("user_id")

    interviewer_oids = [
        ObjectId(uid)
        for uid in set(interviewer_id_by_intv.values())
        if uid and ObjectId.is_valid(uid)
    ]
    interviewers_by_id: dict[str, dict] = {}
    if interviewer_oids:
        interviewers_by_id = {
            str(u["_id"]): u
            for u in await db.users.find(
                {"_id": {"$in": interviewer_oids}}, {"password_hash": 0}
            ).to_list(length=2000)
        }

    # Resolve each row's interviewer THROUGH its interview (interview ->
    # interview_users -> users). The old code stamped the requesting user's
    # own name on every row, which was only coincidentally right for the
    # interviewer-scoped view and wrong for the company-wide one.
    intv_id_strs = [str(i["_id"]) for i in interviews]
    interviewer_id_by_intv: dict[str, str] = {}
    if intv_id_strs:
        async for link in db.interview_users.find(
            {"intv_id": {"$in": intv_id_strs}}, {"intv_id": 1, "user_id": 1}
        ):
            interviewer_id_by_intv[link.get("intv_id")] = link.get("user_id")

    interviewer_oids = [
        ObjectId(uid)
        for uid in set(interviewer_id_by_intv.values())
        if uid and ObjectId.is_valid(uid)
    ]
    interviewers_by_id: dict[str, dict] = {}
    if interviewer_oids:
        interviewers_by_id = {
            str(u["_id"]): u
            for u in await db.users.find(
                {"_id": {"$in": interviewer_oids}}, {"password_hash": 0}
            ).to_list(length=2000)
        }

    # CV-analysis status per application, so the list's CV cell can link to
    # the analysis report (completed) or show a progress/failure hint
    # instead of the raw PDF. _effective_status also downgrades stale
    # "processing" docs, matching the by-jobcand endpoint.
    from routes.cv_analysis import _effective_status

    link_ids = [str(jc["_id"]) for jc in matched_job_candidates]
    analysis_status_map: dict[str, str] = {}
    async for a in db.cv_analyses.find(
        {"jobcand_id": {"$in": link_ids}},
        {"jobcand_id": 1, "status": 1, "error": 1, "created_at": 1},
    ):
        analysis_status_map[a["jobcand_id"]], _ = _effective_status(a)

    rows: list[dict[str, Any]] = []

    for jc in matched_job_candidates:
        cand_id = jc.get("cand_id")
        job_id = jc.get("job_id")

        candidate = candidate_map.get(cand_id)
        job = job_map.get(job_id)
        interview = interview_map.get((cand_id, job_id))

        if not candidate or not job:
            continue

        intv_id = str(interview["_id"]) if interview else None
        interviewer_uid = interviewer_id_by_intv.get(intv_id) if intv_id else None
        interviewer_doc = (
            interviewers_by_id.get(interviewer_uid) if interviewer_uid else None
        )
        interviewer_name = (
            (
                interviewer_doc.get("full_name")
                or interviewer_doc.get("username")
                or interviewer_doc.get("email")
            )
            if interviewer_doc
            else None
        )

        rows.append(
            {
                "application_id": str(jc["_id"]),
                "cand_id": str(candidate["_id"]),
                "candidate_name": candidate.get("cand_full_name") or "Unknown",
                "email": candidate.get("cand_email") or "",
                "phone": candidate.get("cand_phone") or "",
                "job_id": str(job["_id"]),
                "job_title": job.get("title") or "",
                # When the candidate profile was created - the dashboard's
                # admin summary uses it for the "+N this month" delta.
                "cand_created_at": candidate.get("cand_created_at"),
                "status": (interview.get("intv_status") or "not_scheduled")
                .replace("_", " ")
                .upper()
                if interview
                else "NOT SCHEDULED",
                "cv_url": candidate.get("cand_cv_url"),
                "cover_letter_url": candidate.get("cand_cover_letter_url"),
                # None when no analysis exists for this application yet.
                "cv_analysis_status": analysis_status_map.get(str(jc["_id"])),
                "score": _safe_avg_score(jc),
                "interview_datetime": interview.get("intv_date_time")
                if interview
                else None,
                "interviewer": interviewer_name,
                "interviewer_user_id": interviewer_uid,
                # Interview id rides along so rows can deep-link to the
                # interview page without an extra lookup.
                "intv_id": intv_id,
                "ratings": jc.get("ratings"),
            }
        )

    def _sort_key(row):
        dt = row.get("interview_datetime")

        if dt is None:
            return datetime.min.replace(tzinfo=timezone.utc)

        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

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
        if (
            not jid
            or not ObjectId.is_valid(jid)
            or not await db.jobs.find_one(
                {"_id": ObjectId(jid), "comp_id": comp_id}, {"_id": 1}
            )
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
    interview = await db.interviews.find_one(
        {
            "cand_id": cand_id,
            "job_id": old_job_id,
        }
    )

    scheduled_dt = None
    if payload.scheduled_at:
        try:
            scheduled_dt = datetime.fromisoformat(payload.scheduled_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid scheduled_at.")

    if interview:
        existing_status = interview.get("intv_status", "not_scheduled")
        interview_set: dict = {
            "job_id": payload.job_id,
            "intv_updated_at": now,
        }
        # Never overwrite the date/status on an interview that has already
        # progressed past scheduling — editing candidate details (name,
        # interviewer, etc.) must not reset an in-progress or completed
        # interview back to not_scheduled and wipe the recorded date.
        # We only touch date/status when:
        #   - the interview hasn't started yet (not_scheduled / scheduled), AND
        #   - a new date is being set, OR the user is explicitly clearing one.
        if existing_status in ("not_scheduled", "scheduled"):
            interview_set["intv_date_time"] = scheduled_dt
            interview_set["intv_status"] = (
                "scheduled" if scheduled_dt else "not_scheduled"
            )
        await db.interviews.update_one(
            {"_id": interview["_id"]},
            {"$set": interview_set},
        )
        interview = await db.interviews.find_one({"_id": interview["_id"]})
    else:
        intv_status = "scheduled" if scheduled_dt else "not_scheduled"
        result = await db.interviews.insert_one(
            {
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
            }
        )
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
            {"_id": ObjectId(payload.interviewer_user_id), "comp_id": comp_id},
            {"_id": 1},
        ):
            raise HTTPException(status_code=404, detail="Interviewer not found.")

        existing_link = await db.interview_users.find_one(
            {
                "intv_id": intv_id_str,
                "user_id": payload.interviewer_user_id,
            }
        )

        if not existing_link:
            await db.interview_users.delete_many({"intv_id": intv_id_str})
            await db.interview_users.insert_one(
                {
                    "user_id": payload.interviewer_user_id,
                    "intv_id": intv_id_str,
                    "intvuser_created_at": now,
                    "intvuser_updated_at": now,
                }
            )

    return {
        "ok": True,
        "application_id": application_id,
        "job_id": payload.job_id,
        "interviewer_user_id": payload.interviewer_user_id,
        "scheduled_at": payload.scheduled_at,
    }
