"""Candidate sub-resources nested under jobs.

Routes live at /api/jobs/{job_id}/candidates/... to keep the URL stable,
but the code belongs here rather than in jobs.py because these are
candidate-management operations, not job-management operations.
"""

from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status

from database import get_db
from dependencies import get_current_comp_id
from routes.jobs import delete_cv_analyses_for_links

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _validate_oid(value: str, what: str = "job") -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {what} id")
    return ObjectId(value)


@router.get("/{job_id}/candidates")
async def list_candidates_for_job(
    job_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Joined view: every candidate linked to this job, flattened with
    interview-style fields (name / status / score / scheduled_at /
    interviewer) so the table can render directly.

    Tenant guard: 404s if the job belongs to a different company.
    """
    db = get_db()
    oid = _validate_oid(job_id)
    if not await db.jobs.find_one({"_id": oid, "comp_id": comp_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Job not found")

    links = await db.job_candidates.find({"job_id": job_id}).to_list(length=500)
    if not links:
        return []

    # Bulk fetch the candidates referenced by the links. Skip any invalid
    # cand_ids defensively so one bad row can't fail the whole query.
    cand_oids = [
        ObjectId(lnk["cand_id"])
        for lnk in links
        if ObjectId.is_valid(lnk.get("cand_id", ""))
    ]
    cand_docs = await db.candidates.find({"_id": {"$in": cand_oids}}).to_list(
        length=500
    )
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
    user_id_by_intv = {
        lnk["intv_id"]: lnk["user_id"] for lnk in intv_user_links if lnk.get("intv_id")
    }

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

        interview_docs = await db.interviews.find(
            {"job_id": job_id, "cand_id": cand_id}
        ).to_list(length=20)
        completed_interview = next(
            (item for item in interview_docs if item.get("intv_status") == "completed"),
            None,
        )

        # Resolve interviewer name from the interview chain only. The legacy
        # `job_candidates.interviewer` field is intentionally ignored — old rows
        # can hold a stale name string from before the interview_users migration.
        interview = interview_by_cand.get(cand_id)
        intv_id = str(interview["_id"]) if interview else None
        user_id = user_id_by_intv.get(intv_id) if intv_id else None
        user = users_by_id.get(user_id) if user_id else None
        interviewer_name = (
            (user.get("full_name") or user.get("username") or user.get("email"))
            if user
            else None
        )

        scheduled_at = (
            interview.get("intv_date_time") if interview else link.get("scheduled_at")
        )

        ratings = link.get("ratings") or {}
        scores = [
            (ratings.get("communication") or {}).get("score"),
            (ratings.get("technical_skills") or {}).get("score"),
            (ratings.get("problem_solving") or {}).get("score"),
        ]
        scores = [s for s in scores if s is not None]
        avg = round(sum(scores) / len(scores), 1) if scores else None

        out.append(
            {
                "id": str(link["_id"]),
                "cand_id": str(c["_id"]) if c.get("_id") else cand_id,
                "job_id": job_id,
                "name": c.get("cand_full_name") or link.get("name", ""),
                "email": c.get("cand_email"),
                "phone": c.get("cand_phone"),
                "cv_url": c.get("cand_cv_url"),
                "cover_letter_url": c.get("cand_cover_letter_url"),
                "status": (
                    (interview.get("intv_status") or "not_scheduled")
                    .replace("_", " ")
                    .upper()
                    if interview
                    else "NOT SCHEDULED"
                ),
                "scheduled_at": scheduled_at,
                "interviewer": interviewer_name,
                "ratings": ratings or None,
                "score": avg,
                "intv_completed": completed_interview is not None,
                "intv_id": str(completed_interview["_id"])
                if completed_interview
                else None,
            }
        )
    return out


@router.delete(
    "/{job_id}/candidates/{jobcand_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def remove_candidate_from_job(
    job_id: str,
    jobcand_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Remove a single candidate-job link.

    The candidate document itself stays around because the same candidate
    may be on multiple jobs (or could be reused later). We DO cascade into
    interviews + interview_users for this (cand_id, job_id) pair — otherwise
    an orphan interview would leave a phantom avatar on the job card.
    """
    db = get_db()
    if not ObjectId.is_valid(jobcand_id):
        raise HTTPException(status_code=400, detail="Invalid jobcand_id")

    oid = _validate_oid(job_id)
    if not await db.jobs.find_one({"_id": oid, "comp_id": comp_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Job not found")

    link = await db.job_candidates.find_one(
        {"_id": ObjectId(jobcand_id), "job_id": job_id}
    )
    if not link:
        raise HTTPException(
            status_code=404, detail="Candidate link not found on this job"
        )

    cand_id = link.get("cand_id")

    await db.job_candidates.delete_one({"_id": ObjectId(jobcand_id), "job_id": job_id})
    await delete_cv_analyses_for_links(db, [jobcand_id])

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
