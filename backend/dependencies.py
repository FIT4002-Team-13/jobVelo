"""FastAPI dependencies shared across routes."""

from __future__ import annotations

from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from database import get_db
from security import TokenError, decode_access_token

# tokenUrl is purely informational here - Swagger uses it for the "Authorize" button.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> dict:
    """Resolve the bearer token to a user document.

    Raises 401 if the token is missing, malformed, expired, or the user
    no longer exists.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(token)
    except TokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return user


def require_role(*allowed: str):
    """Build a dependency that 403s unless the current user has one of `allowed`
    roles. Use as `Depends(require_role("admin"))` on admin-only routes.

    Returns the user dict so the route can also accept it directly:
        user = Depends(require_role("admin"))
    """
    async def _checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("user_type") not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(allowed)}",
            )
        return user

    return _checker
