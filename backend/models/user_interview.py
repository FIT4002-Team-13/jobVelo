from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class InterviewUserCreate(BaseModel):
    """Payload for linking a user to an interview.

    This corresponds to the Interviewer_Interview relationship in the UML.
    A user can be attached to an interview as one of its interviewers.
    """

    user_id: str = Field(..., min_length=1)
    intv_id: str = Field(..., min_length=1)


class InterviewUserOut(BaseModel):
    """Public representation of a user-interview relationship record."""

    intvuser_id: str
    user_id: str
    intv_id: str
    intvuser_created_at: datetime
    intvuser_updated_at: datetime