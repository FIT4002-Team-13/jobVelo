from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Interview lifecycle used by scheduling and interview progress tracking.
InterviewStatus = Literal["not_scheduled", "scheduled", "in_progress", "completed", "cancelled", "evaluated", "HIRED", "REJECTED"]


class InterviewFeedbackSection(BaseModel):
    """
    Create/update payload for one section of the interview feedback report.
    """

    items: list[str] = Field(default_factory=list)
    justification: str | None = None


class InterviewFeedback(BaseModel):
    """
    Create/update payload for an interview feedback report.
    """

    summary: str | None = None
    strengths: InterviewFeedbackSection = Field(default_factory=InterviewFeedbackSection)
    improvements: InterviewFeedbackSection = Field(default_factory=InterviewFeedbackSection)


class InterviewCreate(BaseModel):
    """
    Creating a new interview session.

    """

    cand_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    intv_date_time: datetime
    intv_location: str | None = Field(default=None, max_length=200)
    intv_status: InterviewStatus = "scheduled"


class InterviewUpdate(BaseModel):
    """
    Patch payload for updating mutable interview fields.
    All fields optional - the caller sends only what they want to change.
    """

    intv_date_time: datetime | None = None
    intv_location: str | None = Field(default=None, max_length=200)
    intv_transcript: str | None = None
    intv_status: InterviewStatus | None = None
    intv_candidate_report: InterviewFeedback | None = None
    intv_interviewer_report: InterviewFeedback | None = None


class InterviewOut(BaseModel):
    """
    Public representation of an interview document.
    """

    intv_id: str
    cand_id: str
    job_id: str
    intv_date_time: datetime | None = None
    intv_location: str | None = None
    intv_transcript: str | None = None
    intv_status: InterviewStatus
    intv_candidate_report: InterviewFeedback | None = None
    intv_interviewer_report: InterviewFeedback | None = None
    intv_created_at: datetime
    intv_updated_at: datetime