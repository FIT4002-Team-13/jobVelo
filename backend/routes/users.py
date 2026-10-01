"""Users read endpoints.

Used by UI elements that need to look up teammates - e.g. the AddCandidate
modal's interviewer combobox, and the candidate/interview detail screens
that need to turn an interviewer `user_id` into a display name.

Tenant isolation: comp_id comes from the JWT, NOT a query/path param, so a
user can never read another company's teammates. `role` stays a query
filter for narrowing within the caller's own company.
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from dependencies import get_current_comp_id
from models.user import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])

_ALLOWED_ROLES = {"admin", "recruiter", "interviewer", "hiring_manager"}


def _user_row(doc: dict) -> dict:
    """Flat dict shape used by the list endpoint (key is `userid`, no
    password hash, tolerant of legacy docs)."""
    return {
        "userid": str(doc["_id"]),
        "username": doc.get("username"),
        "full_name": doc.get("full_name"),
        "email": doc.get("email"),
        "role": doc.get("role"),
        "comp_id": str(doc["comp_id"]) if doc.get("comp_id") else None,
    }


def _user_out(doc: dict) -> UserOut:
    """Mongo user doc -> UserOut, tolerant of older schema versions the same
    way auth._user_out is (unknown role -> interviewer, missing timestamps
    -> now) so one legacy account can't 500 the response."""
    role = doc.get("role") or doc.get("user_type") or "interviewer"
    if role not in _ALLOWED_ROLES:
        role = "interviewer"
    return UserOut(
        userid=str(doc["_id"]),
        username=doc.get("username") or "unknown",
        full_name=doc.get("full_name") or doc.get("username") or "Unknown",
        email=doc.get("email") or "unknown@unknown.test",
        role=role,
        comp_id=str(doc["comp_id"]) if doc.get("comp_id") else None,
        created_at=doc.get("created_at") or datetime.now(timezone.utc),
    )


@router.get("")
async def list_users(
    role: str | None = None,
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Return teammates in the caller's company, optionally filtered by role.
    Password hash is projected out at the DB level so it can never escape
    this endpoint by accident.

    Example: `GET /api/users?role=interviewer`
    """
    db = get_db()
    query: dict = {"comp_id": comp_id}
    if role:
        query["role"] = role

    users = await db.users.find(query, {"password_hash": 0}).to_list(length=200)
    return [_user_row(u) for u in users]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> UserOut:
    """Fetch a single teammate by id. 404s (never 403s) for a user in
    another company so ids can't be probed across tenants."""
    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id."
        )
    db = get_db()
    doc = await db.users.find_one(
        {"_id": ObjectId(user_id), "comp_id": comp_id}, {"password_hash": 0}
    )
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found."
        )
    return _user_out(doc)
