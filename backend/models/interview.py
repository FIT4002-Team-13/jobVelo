from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# Interview lifecycle used by scheduling and interview progress tracking.
InterviewStatus = Literal["scheduled", "in_progress", "completed", "cancelled"]


class InterviewFeedbackSection(BaseModel):
    """
    Create/update payload for one section of the interview feedback report.
    """

    items: list[str] = Field(default_factory=list)
    justification: Optional[str] = None


class InterviewFeedback(BaseModel):
    """
    Create/update payload for an interview feedback report.
    """

    summary: Optional[str] = None
    strengths: InterviewFeedbackSection = Field(default_factory=InterviewFeedbackSection)
    improvements: InterviewFeedbackSection = Field(default_factory=InterviewFeedbackSection)


class InterviewCreate(BaseModel):
    """
    Creating a new interview session.

    """

    cand_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    intv_date_time: datetime
    intv_location: Optional[str] = Field(default=None, max_length=200)
    intv_status: InterviewStatus = "scheduled"


class InterviewUpdate(BaseModel):
    """
    Patch payload for updating mutable interview fields.
    All fields optional - the caller sends only what they want to change.
    """

    intv_date_time: Optional[datetime] = None
    intv_location: Optional[str] = Field(default=None, max_length=200)
    intv_transcript: Optional[str] = None
    intv_status: Optional[InterviewStatus] = None
    intv_candidate_report: Optional[InterviewFeedback] = None
    intv_interviewer_report: Optional[InterviewFeedback] = None


class InterviewOut(BaseModel):
    """
    Public representation of an interview document.
    """

    intv_id: str
    cand_id: str
    job_id: str
    intv_date_time: datetime
    intv_location: Optional[str] = None
    intv_transcript: Optional[str] = None
    intv_status: InterviewStatus
    intv_candidate_report: Optional[InterviewFeedback] = None
    intv_interviewer_report: Optional[InterviewFeedback] = None
    intv_created_at: datetime
    intv_updated_at: datetime