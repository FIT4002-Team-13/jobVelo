from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# Naming note: we use `cand_id` to match the candidate model + cand.py route.
# Don't reintroduce `candidate_id` without updating every other file at once.

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


class JobCandidateOut(BaseModel):
    """Safe public representation of a job-candidate link document."""

    jobcand_id: str
    cand_id: str
    job_id: str
    cv_analysis: Optional[str] = None
    communication_score: Optional[float] = None
    skill_score: Optional[float] = None
    problem_solving_score: Optional[float] = None
    created_at: datetime
    updated_at: datetime


class CandidateWithJobOut(BaseModel):
    """Combined representation of a candidate document and its linked
    job-candidate analysis/scoring."""

    candidate: dict
    job_candidate: dict
