"""Tenant-scoping guards shared across route modules.

Every company-scoped collection either stores `comp_id` directly (jobs,
candidates, cv_analyses) or is reached *through* its job (interviews,
job_candidates, interview_users). These helpers centralise the
"does this row belong to the caller's company?" walk so each route module
stops carrying its own near-identical copy.

Two flavours:
  * `*_in_company(...) -> bool`     - for callers that already 404 themselves.
  * `get_/assert_*(...)`            - raise 400 (bad id) / 404 (missing or
                                     cross-tenant) directly. 404 rather than
                                     403 so ids can't be probed.
"""

from __future__ import annotations

from bson import ObjectId
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase


def validate_oid(value: str, what: str = "job") -> ObjectId:
    """Parse `value` as an ObjectId, or raise 400 naming the bad `what` id."""
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {what} id")
    return ObjectId(value)


async def assigned_interview_ids(
    db: AsyncIOMotorDatabase, user_id_str: str
) -> list[ObjectId]:
    """Interviews this user is assigned to, via interview_users links."""
    ids: list[ObjectId] = []
    async for link in db.interview_users.find({"user_id": user_id_str}, {"intv_id": 1}):
        intv_id = link.get("intv_id")
        if intv_id and ObjectId.is_valid(intv_id):
            ids.append(ObjectId(intv_id))
    return ids


async def company_job_ids(db: AsyncIOMotorDatabase, comp_id: ObjectId) -> list[str]:
    """The caller's company's job ids (interviews don't carry comp_id directly)."""
    return [str(j["_id"]) async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})]


async def job_in_company(
    db: AsyncIOMotorDatabase, job_id: str | None, comp_id: ObjectId
) -> bool:
    """True when `job_id` names a job in the caller's company."""
    if not job_id or not ObjectId.is_valid(job_id):
        return False
    return (
        await db.jobs.find_one(
            {"_id": ObjectId(job_id), "comp_id": comp_id}, {"_id": 1}
        )
        is not None
    )


async def link_in_company(
    db: AsyncIOMotorDatabase, link: dict, comp_id: ObjectId
) -> bool:
    """True when a job_candidates `link` doc's job is in the caller's company."""
    return await job_in_company(db, link.get("job_id"), comp_id)


async def interview_in_company(
    db: AsyncIOMotorDatabase, intv_id: str | None, comp_id: ObjectId
) -> bool:
    """True when an interview's job is in the caller's company."""
    if not intv_id or not ObjectId.is_valid(intv_id):
        return False
    interview = await db.interviews.find_one({"_id": ObjectId(intv_id)}, {"job_id": 1})
    return await job_in_company(db, (interview or {}).get("job_id"), comp_id)


async def get_interview_in_company(
    db: AsyncIOMotorDatabase, intv_id: str, comp_id: ObjectId
) -> dict:
    """Fetch an interview, 400-ing a bad id and 404-ing one that's missing OR
    in a different company (404 not 403 so ids can't be probed)."""
    if not ObjectId.is_valid(intv_id):
        raise HTTPException(status_code=400, detail="Invalid interview id.")
    interview = await db.interviews.find_one({"_id": ObjectId(intv_id)})
    if not interview or not await job_in_company(db, interview.get("job_id"), comp_id):
        raise HTTPException(status_code=404, detail="Interview not found.")
    return interview


async def assert_jobcand_in_company(
    db: AsyncIOMotorDatabase, jobcand_id: str, comp_id: ObjectId
) -> None:
    """400 a bad jobcand_id; 404 one that's missing OR whose job belongs to a
    different company."""
    if not ObjectId.is_valid(jobcand_id):
        raise HTTPException(status_code=400, detail="Invalid jobcand_id")
    link = await db.job_candidates.find_one(
        {"_id": ObjectId(jobcand_id)}, {"job_id": 1}
    )
    if not link or not await link_in_company(db, link, comp_id):
        raise HTTPException(status_code=404, detail="Job-candidate link not found")
