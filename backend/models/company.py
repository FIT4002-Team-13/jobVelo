from __future__ import annotations

from datetime import datetime
from typing import Optional
from typing_extensions import Literal

from pydantic import BaseModel, EmailStr, Field, HttpUrl, field_validator

from security import validate_password_strength

class CompanyCreate(BaseModel):

    name: str = Field(..., min_length=1, max_length=120)
    industry: str = Field(..., min_length=1, max_length=80)
    logo_url: Optional[HttpUrl] = None
    description: Optional[str] = Field(default=None, max_length=1000)
    contact_email: Optional[str] = Field(default=None, max_length=120)
    contact_phone: Optional[str] = Field(default=None, max_length=30)

class CompanyUpdate(BaseModel):

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    industry: Optional[str] = Field(default=None, min_length=1, max_length=80)
    logo_url: Optional[HttpUrl] = None
    description: Optional[str] = Field(default=None, max_length=1000)
    contact_email: Optional[str] = Field(default=None, max_length=120)
    contact_phone: Optional[str] = Field(default=None, max_length=30)

class CompanyOut(BaseModel):

    id: str
    name: str
    industry: str
    logo_url: Optional[HttpUrl] = None
    description: Optional[str] = Field(default=None, max_length=1000)
    contact_email: Optional[str] = Field(default=None, max_length=120)
    contact_phone: Optional[str] = Field(default=None, max_length=30)
    creation_date: datetime
    update_date: datetime