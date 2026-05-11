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

InvitationStatus = Literal["active", "used"]


class InvitationOut(BaseModel):
    inv_id: str
    comp_id: str
    code: str
    status: InvitationStatus
    user_id: str | None = None
    created_at: datetime
    used_at: datetime | None = None
