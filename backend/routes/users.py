"""Users list endpoint (read-only).

Used by UI elements that need to look up teammates - e.g. the AddCandidate
modal's interviewer combobox.

Tenant isolation: comp_id comes from the JWT, NOT a query param, so a user
can never enumerate another company's teammates. `role` stays a query
filter for narrowing within the caller's own company.
"""

from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db
from dependencies import get_current_comp_id

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
async def list_users(
    role: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Return teammates in the caller's company, optionally filtered by role.
    Password hash is projected out at the DB level so it can never escape
    this endpoint by accident.

    Example: `GET /api/users?role=interviewer`
    """
    query: dict = {"comp_id": comp_id}
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
