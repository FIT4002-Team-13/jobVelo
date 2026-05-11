from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

class CandidateCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=30)
    cv_url: Optional[str] = None
    cover_letter_url: Optional[str] = None
    comp_id: str = Field(..., min_length=1)

class CandidateCreateForJob(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=30)
    cv_url: Optional[str] = None
    cover_letter_url: Optional[str] = None
    comp_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)

class CandidateUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=30)
    cv_url: Optional[str] = None
    cover_letter_url: Optional[str] = None

class CandidateOut(BaseModel):
    id: str
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    cv_url: Optional[str] = None
    cover_letter_url: Optional[str] = None
    comp_id: str
    created_at: datetime
    updated_at: datetime