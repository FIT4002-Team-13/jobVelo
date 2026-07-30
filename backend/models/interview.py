from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# Interview cycle for scheduling + running + post-interview state.
InterviewStatus = Literal["scheduled", "in_progress", "completed", "cancelled"]

class TranscriptEntry(BaseModel):
    id:str
    speaker: str
    timestamp: str
    text: str
    comment: Optional[str] = None

class InterviewCreate(BaseModel):
    """Base payload for creating an interview session.

    An interview belongs to one candidate and one job. Interviewers are linked
    separately through the interview_user collection so one interview can have
    one or more interviewers.
    """

    cand_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    intv_date_time: datetime
    intv_location: Optional[str] = Field(default=None, max_length=200)
    intv_status: InterviewStatus = "scheduled"

class InterviewUpdate(BaseModel):
    """Patch payload for updating mutable interview fields."""

    intv_date_time: Optional[datetime] = None
    intv_location: Optional[str] = Field(default=None, max_length=200)
    intv_transcript: Optional[list[TranscriptEntry]] = None
    intv_status: Optional[InterviewStatus] = None
    intv_duration_seconds: Optional[int] = None
    intv_candidate_report: Optional[str] = None
    intv_interviewer_report: Optional[str] = None

class InterviewOut(BaseModel):
    """Public representation of an interview document."""

    intv_id: str
    cand_id: str
    job_id: str
    intv_date_time: datetime
    intv_location: Optional[str] = None
    intv_transcript: Optional[list[TranscriptEntry]] = None
    intv_status: InterviewStatus
    intv_duration_seconds: Optional[int] = None
    intv_candidate_report: Optional[str] = None
    intv_interviewer_report: Optional[str] = None
    intv_created_at: datetime
    intv_updated_at: datetime


