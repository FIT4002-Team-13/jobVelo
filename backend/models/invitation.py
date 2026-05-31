"""Invitation model.

Each invitation is single-use: status flips from 'active' -> 'used' the moment
a teammate signs up with it, and user_id is filled with their newly-created
user document. Deleting an invitation also deletes the user it produced
(if any) - that's the team's chosen kick-out mechanism.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from models.user import NonAdminRole

InvitationStatus = Literal["active", "used"]


class InvitationCreate(BaseModel):
    """Payload for POST /api/invitations. The admin picks the role the
    invitee will receive when they redeem the code, so role assignment
    is centralised instead of left to whoever happens to have the URL."""

    role: NonAdminRole


class InvitationOut(BaseModel):
    inv_id: str
    comp_id: str
    code: str
    role: NonAdminRole
    status: InvitationStatus
    user_id: str | None = None
    created_at: datetime
    used_at: datetime | None = None
