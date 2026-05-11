from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from security import validate_password_strength

UserType = Literal["admin", "interviewer", "hiring_manager"]


class _UserCredentials(BaseModel):
    """Fields shared by every signup path (admin + invited teammate)."""

    username: str = Field(
        ...,
        min_length=3,
        max_length=40,
        pattern=r"^[A-Za-z0-9_.\-]+$",
        description="Letters, digits, dot, underscore or hyphen.",
    )
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class UserCreate(_UserCredentials):
    """Payload for POST /api/auth/signup - the invited-teammate path.

    The invitation_code is validated server-side: it must exist and be active.
    On success, comp_id is inferred from the invitation (never trusted from
    the request body).
    """

    invitation_code: str = Field(..., min_length=1, max_length=80)
    position: str = Field(..., min_length=1, max_length=80)


class AdminCreate(_UserCredentials):
    """Admin half of the /api/auth/signup-company payload."""


class UserOut(BaseModel):
    """Safe public representation of a user - never includes the password hash.

    comp_id / user_type are optional only for backward compat with any user
    docs created before this schema landed; every new user has them set.
    """

    userid: str
    username: str
    email: EmailStr
    position: str | None = None
    comp_id: str | None = None
    user_type: UserType | None = None
    strengths: list[str] = []
    weaknesses: list[str] = []
    total_interview: int = 0
    average_score: float = 0.0
    created_at: datetime


class LoginRequest(BaseModel):
    """POST /api/auth/login payload - accept either username or email."""

    identifier: str = Field(..., min_length=3, max_length=120)
    password: str = Field(..., min_length=1, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
