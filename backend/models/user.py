from __future__ import annotations

from datetime import datetime
from typing_extensions import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from security import validate_password_strength


class UserCreate(BaseModel):
    """Payload accepted by POST /api/auth/signup."""

    username: str = Field(
        ...,
        min_length=3,
        max_length=40,
        pattern=r"^[A-Za-z0-9_.\-]+$",
        description="Letters, digits, dot, underscore or hyphen.",
    )
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: Literal["recruiter", "interviewer", "hiring_manager", "admin"]

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class UserOut(BaseModel):
    """Safe public representation of a user - never includes the password hash."""

    id: str
    username: str
    email: EmailStr
    role: Literal["recruiter", "interviewer", "hiring_manager", "admin"]
    total_interview: int
    company_id: str | None = None
    full_name: str
    creation_date: datetime

    #maybe make the below fields into separate models?
    strengths: list[str]
    weaknesses: list[str]
    average_score: float
    created_at: datetime


class LoginRequest(BaseModel):
    """POST /api/auth/login payload - accept either username or email."""

    identifier: str = Field(..., min_length=3, max_length=120)
    password: str = Field(..., min_length=1, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
