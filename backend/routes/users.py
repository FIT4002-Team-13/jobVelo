"""Users list endpoint (read-only).

Used by UI elements that need to look up teammates - e.g. the AddCandidate
modal's interviewer combobox.

Currently accepts `comp_id` as a query param. Once auth is wired across
the codebase, swap that for a forced filter from `Depends(get_current_user)`.
"""

from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db

router = APIRouter(prefix="/api/users", tags=["users"])


def _comp_oid(comp_id: str) -> ObjectId:
    if not ObjectId.is_valid(comp_id):
        raise HTTPException(status_code=400, detail="Invalid comp_id")
    return ObjectId(comp_id)


@router.get("")
async def list_users(
    comp_id: str | None = None,
    role: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return users matching the given filters. Password hash is projected
    out at the DB level so it can never escape this endpoint by accident.

    Example: `GET /api/users?comp_id=abc...&role=interviewer`
    """
    query: dict = {}
    if comp_id:
        query["comp_id"] = _comp_oid(comp_id)
    if role:
        query["role"] = role

    users = await db.users.find(query, {"password_hash": 0}).to_list(length=200)
    return [
        {
            "userid": str(u["_id"]),
            "username": u.get("username"),
            "full_name": u.get("full_name"),
            "email": u.get("email"),
            "role": u.get("role"),
            "comp_id": str(u["comp_id"]) if u.get("comp_id") else None,
        }
        for u in users
    ]
