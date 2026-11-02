"""Lookups several routes repeat: "which jobs are in my company" and "which
interviews am I assigned to". They take `db` as a parameter (the routes pass
`get_db()`), so this module holds no global state.

Interviews carry job_id, not comp_id, so a company's interviews are reached
through its job ids.
"""

from bson import ObjectId


async def company_job_ids(db, comp_id: ObjectId) -> list[str]:
    """The company's job ids as strings (how job_id is stored on other docs)."""
    return [str(j["_id"]) async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})]


async def assigned_interview_ids(db, user_id: str) -> list[ObjectId]:
    """Interviews this user is assigned to, via interview_users links."""
    ids: list[ObjectId] = []
    async for link in db.interview_users.find({"user_id": user_id}, {"intv_id": 1}):
        intv_id = link.get("intv_id")
        if intv_id and ObjectId.is_valid(intv_id):
            ids.append(ObjectId(intv_id))
    return ids
