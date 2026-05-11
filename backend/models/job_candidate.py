from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

class JobCandidateCreate(BaseModel):
    candidate_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    cv_analysis: Optional[str] = None
    communication_score: Optional[float] = None
    skill_score: Optional[float] = None
    problem_solving_score: Optional[float] = None

class JobCandidateOut(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    cv_analysis: Optional[str] = None
    communication_score: Optional[float] = None
    skill_score: Optional[float] = None
    problem_solving_score: Optional[float] = None
    created_at: datetime
    updated_at: datetime

class CandidateWithJobOut(BaseModel):
    candidate: dict
    job_candidate: dict