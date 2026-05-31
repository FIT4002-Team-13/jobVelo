"""Invitation management - admin-only.

Admins generate codes (one per teammate), list them with status, and delete
them. Deleting an invitation that's been used also deletes the user it
created - this is how admins kick teammates off the platform.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status

from database import get_db
from dependencies import require_role
from models.invitation import InvitationCreate, InvitationOut

router = APIRouter(prefix="/api/invitations", tags=["invitations"])


# Avoid 0/O and 1/I/l to keep dictated codes unambiguous.
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _generate_code() -> str:
    """Return a human-friendly 12-char code, e.g. INV-A7P9-K2L4."""
    a = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    b = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    return f"INV-{a}-{b}"


def _serialize(doc: dict) -> InvitationOut:
    # `role` defaults to "interviewer" for legacy invitations created before
    # the role-on-invite refactor - they had no role attached. Picking the
    # safest non-admin role keeps existing codes redeemable.
    return InvitationOut(
        inv_id=str(doc["_id"]),
        comp_id=str(doc["comp_id"]),
        code=doc["code"],
        role=doc.get("role") or "interviewer",
        status=doc["status"],
        user_id=str(doc["user_id"]) if doc.get("user_id") else None,
        created_at=doc["created_at"],
        used_at=doc.get("used_at"),
    )


@router.get("", response_model=list[InvitationOut])
async def list_invitations(admin=Depends(require_role("admin"))) -> list[InvitationOut]:
    """List every invitation generated for the admin's company, newest-first."""
    db = get_db()
    cursor = db.invitations.find({"comp_id": admin["comp_id"]}).sort("created_at", -1)
    return [_serialize(doc) async for doc in cursor]


@router.post("", response_model=InvitationOut, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    payload: InvitationCreate,
    admin=Depends(require_role("admin")),
) -> InvitationOut:
    """Generate a fresh invitation code for the admin's company.

    The admin picks the role on this side - the invitee no longer chooses
    their own role at signup. This keeps role assignment under admin
    control instead of trusting whoever happens to receive the code.

    Retries on the rare collision against an existing code (~10^12 space).
    """
    db = get_db()
    now = datetime.now(timezone.utc)

    for _ in range(5):
        code = _generate_code()
        doc = {
            "comp_id":    admin["comp_id"],
            "code":       code,
            "role":       payload.role,
            "status":     "active",
            "user_id":    None,
            "created_at": now,
            "used_at":    None,
        }
        try:
            result = await db.invitations.insert_one(doc)
            doc["_id"] = result.inserted_id
            return _serialize(doc)
        except Exception:
            # DuplicateKeyError on the (effectively impossible) collision -
            # generate a new code and retry.
            continue

    raise HTTPException(status_code=500, detail="Failed to generate a unique code")


@router.delete(
    "/{inv_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    # response_class=Response (media_type=None) is required by FastAPI 0.115+
    # for any 204 route - the default JSONResponse would try to write a body.
    response_class=Response,
)
async def delete_invitation(
    inv_id: str,
    admin=Depends(require_role("admin")),
):
    """Delete an invitation. If it was used, ALSO delete the user it created -
    that's the team's chosen mechanism for removing teammates."""
    if not ObjectId.is_valid(inv_id):
        raise HTTPException(status_code=400, detail="Invalid invitation id")
    db = get_db()

    inv = await db.invitations.find_one(
        {"_id": ObjectId(inv_id), "comp_id": admin["comp_id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # Cascade-delete the user this invitation produced, if any. Refuse to
    # delete an admin via this mechanism - prevents accidental self-lockout.
    if inv.get("user_id"):
        target_user = await db.users.find_one({"_id": inv["user_id"]})
        if target_user and target_user.get("role") == "admin":
            raise HTTPException(
                status_code=409,
                detail="Can't delete an admin via invitation removal",
            )
        await db.users.delete_one({"_id": inv["user_id"]})

    await db.invitations.delete_one({"_id": inv["_id"]})
