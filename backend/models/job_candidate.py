from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# Naming note: we use `cand_id` to match the candidate model + cand.py route.
# Don't reintroduce `candidate_id` without updating every other file at once.

# Status values a job-candidate link can carry. Pydantic Literal gives us
# automatic 422s for any other string, so the DB can never end up with a
# typo'd status from the API.
JobCandidateStatus = Literal["SCHEDULED", "EVALUATED", "HIRED", "REJECTED"]


class JobCandidateCreate(BaseModel):
    """Payload for creating a job-candidate link.

    cand_id + job_id are required to establish the link; the rest are optional
    analysis/scoring fields that the AI pipeline writes asynchronously.
    """

    cand_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    cv_analysis: Optional[str] = None
    communication_score: Optional[float] = None
    skill_score: Optional[float] = None
    problem_solving_score: Optional[float] = None


class JobCandidateScoreUpdate(BaseModel):
    """Body for PATCH /api/job-candidates/{id}/scores.

    All fields optional - the caller sends only what they want to change.
    The route auto-bumps `status` to "EVALUATED" whenever any of these
    fields lands with a non-null value, so a teammate scoring an interview
    never has to remember a second call to flip the status.

    Score ranges are clamped to 0-10 to match the typical interview rubric.
    """

    cv_analysis: Optional[str] = None
    communication_score: Optional[float] = Field(default=None, ge=0, le=10)
    skill_score: Optional[float] = Field(default=None, ge=0, le=10)
    problem_solving_score: Optional[float] = Field(default=None, ge=0, le=10)


class JobCandidateOut(BaseModel):
    """Safe public representation of a job-candidate link document.

    `status` is Optional because legacy rows created before the status
    field existed (e.g. via cand.py's create_candidate_for_job) won't have
    one set - read paths return None for those instead of crashing.
    """

    jobcand_id: str
    cand_id: str
    job_id: str
    status: Optional[JobCandidateStatus] = None
    cv_analysis: Optional[str] = None
    communication_score: Optional[float] = None
    skill_score: Optional[float] = None
    problem_solving_score: Optional[float] = None
    final_score: Optional[float] = None
    rank: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class CandidateWithJobOut(BaseModel):
    """Combined representation of a candidate document and its linked
    job-candidate analysis/scoring."""

    candidate: dict
    job_candidate: dict
