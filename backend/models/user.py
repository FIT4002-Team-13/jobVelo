from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from security import validate_password_strength

# Every user has one role. "admin" is reserved for the user who creates the
# company; invited teammates pick one of the other three on signup.
Role = Literal["admin", "recruiter", "interviewer", "hiring_manager"]
NonAdminRole = Literal["recruiter", "interviewer", "hiring_manager"]


class _UserCredentials(BaseModel):
    """Identity fields shared by every signup path (admin + invited teammate).

    role is NOT here on purpose — admins have role forced server-side,
    invitees pick their role from a dropdown. See UserCreate for the
    invited-teammate version.
    """

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

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class UserCreate(_UserCredentials):
    """Invited-teammate signup. Both comp_id AND role are taken from the
    matched invitation server-side - the admin chose the role at invite
    generation, so it's NOT a field on this payload."""

    invitation_code: str = Field(..., min_length=1, max_length=80)


class AdminCreate(_UserCredentials):
    """Admin half of /api/auth/signup-company. role is forced to 'admin'
    server-side regardless of what the client sends."""


class UserOut(BaseModel):
    """Safe public representation of a user — never includes the password hash.

    Interview metrics (average_score, total_interview) and insights
    (strengths, weaknesses) are deliberately NOT stored here — they're
    aggregated on demand from the interviews collection.
    """

    userid: str
    username: str
    full_name: str
    email: EmailStr
    role: Role
    comp_id: str | None = None
    created_at: datetime


class LoginRequest(BaseModel):
    """POST /api/auth/login payload — accept either username or email."""

    identifier: str = Field(..., min_length=3, max_length=120)
    password: str = Field(..., min_length=1, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
