"""Password hashing, strength validation, and JWT helpers.

We use bcrypt directly rather than passlib - fewer moving parts, no deprecation
noise, and it's the industry-standard adaptive hash for passwords.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from config import settings

# --- Strength rules ---------------------------------------------------------
# At least one uppercase letter, one digit, one special character.
# Length lower bound enforced separately via Pydantic Field(min_length=8).

_UPPERCASE = re.compile(r"[A-Z]")
_DIGIT = re.compile(r"\d")
# Anything that isn't a letter, digit or whitespace counts as "special".
_SPECIAL = re.compile(r"[^A-Za-z0-9\s]")


def validate_password_strength(password: str) -> None:
    """Raise ValueError if the password is too weak."""
    if not _UPPERCASE.search(password):
        raise ValueError("Password must include at least one uppercase letter.")
    if not _DIGIT.search(password):
        raise ValueError("Password must include at least one number.")
    if not _SPECIAL.search(password):
        raise ValueError("Password must include at least one special character.")


# --- Hashing ----------------------------------------------------------------
# bcrypt rounds=12 is a sensible default: ~250ms per hash on commodity hardware.
# Increase later if you measure faster machines.

_BCRYPT_ROUNDS = 12


def hash_password(plain: str) -> str:
    """Return a bcrypt hash safe to store in the database."""
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True iff `plain` matches the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed hash - fail closed.
        return False


# --- JWT --------------------------------------------------------------------


class TokenError(Exception):
    """Raised when a JWT can't be decoded or has expired."""


def create_access_token(
    *,
    subject: str,
    extra_claims: dict[str, Any] | None = None,
    expires_minutes: int | None = None,
) -> str:
    """Mint a signed JWT.

    `subject` is the user id (string). Anything else goes into `extra_claims`.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=expires_minutes or settings.jwt_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as e:
        raise TokenError("Token has expired") from e
    except jwt.InvalidTokenError as e:
        raise TokenError("Invalid token") from e
