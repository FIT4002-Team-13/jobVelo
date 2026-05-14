from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

# Rolled-up status used by the dashboard candidates list. A candidate can be
# linked to several jobs at once with different statuses, so we collapse
# them into one "where in the pipeline are they right now" label:
#   SCHEDULED → has at least one upcoming interview
#   EVALUATED → all interviews are done (no SCHEDULED left)
#   None       → no job_candidate links yet (just a profile)
# Kept in lock-step with JobCandidateStatus on the link doc.
CandidateRollupStatus = Literal["SCHEDULED", "EVALUATED"]

class CandidateCreate(BaseModel):
    """Base payload for creating a standalone candidate profile, used when the system only needs to create the candidate 
    record without immediately linking the candidate to a specific job. comp_id scopes the candidate to a single company."""

    cand_full_name: str = Field(..., min_length=1, max_length=100)
    cand_email: EmailStr
    cand_phone: Optional[str] = Field(default=None, max_length=30)
    cand_cv_url: Optional[str] = None
    cand_cover_letter_url: Optional[str] = None
    comp_id: str = Field(..., min_length=1)

class CandidateCreateForJob(BaseModel):
    """Combined popup payload for 'create candidate for a job'.

    Used by the create-candidate popup when it is opened from either:
      - the job page, where job_id is prefilled server-side/front-end side
      - the candidate page, where the user selects a job in the popup

    cand_id is optional:
      - if provided, the backend links an existing candidate to the job
      - if omitted, the backend creates the candidate first and then links it
    """

    cand_id: Optional[str] = Field(default=None, min_length=1)
    cand_full_name: str = Field(..., min_length=1, max_length=100)
    cand_email: EmailStr
    cand_phone: Optional[str] = Field(default=None, max_length=30)
    cand_cv_url: Optional[str] = None
    cand_cover_letter_url: Optional[str] = None
    comp_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)

class CandidateUpdate(BaseModel):
    """Payload for updating a candidate profile. All fields optional."""

    cand_full_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    cand_email: Optional[EmailStr] = None
    cand_phone: Optional[str] = Field(default=None, max_length=30)
    cand_cv_url: Optional[str] = None
    cand_cover_letter_url: Optional[str] = None

class CandidateOut(BaseModel):
    """Safe public representation of a candidate document. 
    Never includes any sensitive info, only the basic contact/profile fields. 
    The linked job-candidate analysis/scoring is deliberately NOT stored here 
    — it's aggregated on demand from the job_candidates collection.
    """

    cand_id: str
    cand_full_name: str
    cand_email: EmailStr
    cand_phone: Optional[str] = None
    cand_cv_url: Optional[str] = None
    cand_cover_letter_url: Optional[str] = None
    comp_id: str
    cand_created_at: datetime
    cand_updated_at: datetime
    # Rolled-up status across all of this candidate's job_candidates links.
    # None means the candidate has no link yet (profile-only).
    cand_status: Optional[CandidateRollupStatus] = None