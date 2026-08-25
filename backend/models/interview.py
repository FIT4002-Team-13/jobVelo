from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Interview cycle for scheduling + running + post-interview state.
InterviewStatus = Literal["not_scheduled", "scheduled", "in_progress", "completed", "cancelled"]


class TranscriptEntry(BaseModel):
    id: str
    speaker: str
    timestamp: str
    text: str
    comment: str | None = None

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
    """Base payload for creating an interview session.

    An interview belongs to one candidate and one job. Interviewers are linked
    separately through the interview_user collection so one interview can have
    one or more interviewers.
    """

    cand_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    intv_date_time: datetime
    intv_location: str | None = Field(default=None, max_length=200)
    intv_status: InterviewStatus = "scheduled"


class InterviewUpdate(BaseModel):
    """Patch payload for updating mutable interview fields."""

    intv_date_time: datetime | None = None
    intv_location: str | None = Field(default=None, max_length=200)
    intv_transcript: list[TranscriptEntry] | None = None
    intv_status: InterviewStatus | None = None
    intv_duration_seconds: int | None = None
    intv_candidate_report: str | None = None
    intv_interviewer_report: str | None = None


class InterviewOut(BaseModel):
    """Public representation of an interview document."""

    intv_id: str
    cand_id: str
    job_id: str
    # None for interviews that exist but haven't been scheduled yet - an
    # interviewer can be assigned before a date is picked (intv_status
    # "not_scheduled"), and both cand.py and applications.py store None.
    intv_date_time: datetime | None = None
    intv_location: str | None = None
    intv_transcript: list[TranscriptEntry] | None = None
    intv_status: InterviewStatus
    intv_duration_seconds: int | None = None
    intv_candidate_report: str | None = None
    intv_interviewer_report: str | None = None
    intv_created_at: datetime
    intv_updated_at: datetime

class InterviewCompleteRequest(BaseModel):
    transcript: list[TranscriptEntry] = Field(default_factory=list)