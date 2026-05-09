from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError

from database import get_db
from dependencies import get_current_user
from models.user import LoginRequest, LoginResponse, UserCreate, UserOut
from security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _serialize(doc: dict) -> UserOut:
    return UserOut(
        userid=str(doc["_id"]),
        username=doc["username"],
        email=doc["email"],
        position=doc["position"],
        strengths=doc.get("strengths", []),
        weaknesses=doc.get("weaknesses", []),
        total_interview=doc.get("total_interview", 0),
        average_score=doc.get("average_score", 0.0),
        created_at=doc["created_at"],
    )


@router.post(
    "/signup",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user account",
)
async def signup(payload: UserCreate) -> UserOut:
    """Create a new user.

    Password rules (validated server-side via the User model):
      - at least 8 characters
      - at least one uppercase letter
      - at least one number
      - at least one special character
    """
    db = get_db()

    doc = {
        "username": payload.username.strip(),
        "email": payload.email.lower(),
        "position": payload.position.strip(),
        "password_hash": hash_password(payload.password),
        "strengths": [],
        "weaknesses": [],
        "total_interview": 0,
        "average_score": 0.0,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        result = await db.users.insert_one(doc)
    except DuplicateKeyError as e:
        msg = str(e).lower()
        if "email" in msg:
            raise HTTPException(status_code=409, detail="Email already registered")
        if "username" in msg:
            raise HTTPException(status_code=409, detail="Username already taken")
        raise HTTPException(status_code=409, detail="User already exists")

    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Exchange username/email + password for a JWT",
)
async def login(payload: LoginRequest) -> LoginResponse:
    db = get_db()
    identifier = payload.identifier.strip()

    # Allow login by email or username - single Mongo query with $or.
    user = await db.users.find_one(
        {"$or": [{"email": identifier.lower()}, {"username": identifier}]}
    )

    # Always run verify_password (even on a dummy hash) to keep response
    # timing roughly constant whether or not the user exists. This is a
    # cheap defence against username enumeration via timing.
    DUMMY_HASH = "$2b$12$abcdefghijklmnopqrstuuPj0ZILcQ4N3WVrxEYJhOQEAa7DpL7Tq"
    stored_hash = user["password_hash"] if user else DUMMY_HASH
    ok = verify_password(payload.password, stored_hash)

    if not user or not ok:
        # Generic message - don't reveal whether the identifier or password failed.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username/email or password",
        )

    token = create_access_token(
        subject=str(user["_id"]),
        extra_claims={"username": user["username"]},
    )
    return LoginResponse(access_token=token, user=_serialize(user))


@router.get(
    "/me",
    response_model=UserOut,
    summary="Return the currently authenticated user",
)
async def me(current=Depends(get_current_user)) -> UserOut:
    return _serialize(current)
