"""Auth routes.

Two signup paths exist:
  POST /api/auth/signup-company  - creates a company AND its first admin, auto-logs them in.
  POST /api/auth/signup          - the invited-teammate path; requires a valid invitation code.

Plus the usual login + me endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, EmailStr, ValidationError
from pymongo.errors import (
    ConfigurationError,
    DuplicateKeyError,
    PyMongoError,
    ServerSelectionTimeoutError,
)

from database import get_db
from dependencies import get_current_user
from models.company import CompanyOut
from models.user import AdminCreate, LoginRequest, LoginResponse, UserCreate, UserOut
from security import create_access_token, hash_password, verify_password
from services.file_storage import delete_upload, save_upload

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------- serializers --------------------------------------------------


_ALLOWED_ROLES = {"admin", "recruiter", "interviewer", "hiring_manager"}


def _user_out(doc: dict) -> UserOut:
    """Build a UserOut from a Mongo user doc, tolerant of older schema versions.

    The codebase has shipped three user shapes during development:
      v1 - position / strengths / weaknesses / total_interview / average_score
      v2 - user_type field (renamed during the role refactor)
      v3 - current: full_name + role + comp_id

    Old test accounts lack newer fields, so we fall back rather than crash.
    A fresh database wipe is the proper fix, but for dev convenience this
    keeps everyone's existing logins working.
    """
    # role: prefer 'role' (v3), then 'user_type' (v2), then default. Validate
    # against the allowed set so Pydantic doesn't reject an unexpected value.
    role = doc.get("role") or doc.get("user_type") or "interviewer"
    if role not in _ALLOWED_ROLES:
        role = "interviewer"

    return UserOut(
        userid=str(doc["_id"]),
        username=doc["username"],
        full_name=doc.get("full_name") or doc["username"],
        email=doc["email"],
        role=role,
        comp_id=str(doc["comp_id"]) if doc.get("comp_id") else None,
        created_at=doc.get("created_at") or datetime.now(timezone.utc),
    )


def _company_out(doc: dict) -> CompanyOut:
    return CompanyOut(
        comp_id=str(doc["_id"]),
        comp_name=doc["comp_name"],
        comp_email=doc["comp_email"],
        comp_industry=doc["comp_industry"],
        comp_contact=doc["comp_contact"],
        comp_website=doc.get("comp_website"),
        comp_description=doc.get("comp_description"),
        comp_logo=doc.get("comp_logo"),
        created_at=doc["created_at"],
    )


def _mint_token(user_doc: dict) -> str:
    return create_access_token(
        subject=str(user_doc["_id"]),
        extra_claims={
            "username": user_doc["username"],
            "role": user_doc.get("role"),
        },
    )


# ---------- response models ---------------------------------------------


class SignupCompanyResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    company: CompanyOut


class CheckCodeResponse(BaseModel):
    """Returned by /api/auth/check-code/{code}.

    comp_name is shown to the candidate ("You're about to join Acme
    Recruiting") so they know which company the code is for before they
    fill in the form. `role` is the role the admin attached to the
    invitation - shown read-only on the signup form since the invitee no
    longer picks their own role.
    """

    valid: bool
    comp_name: str | None = None
    role: str | None = None


# ---------- company signup (creates company + first admin) --------------


@router.post(
    "/signup-company",
    response_model=SignupCompanyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a brand-new company and its first admin in one step.",
)
async def signup_company(
    # Company fields
    comp_name: Annotated[str, Form(min_length=1, max_length=120)],
    comp_email: Annotated[EmailStr, Form()],
    comp_industry: Annotated[str, Form(min_length=1, max_length=80)],
    comp_contact: Annotated[str, Form(min_length=1, max_length=40)],
    comp_logo: Annotated[UploadFile, File(description="Company logo (png/jpg/webp)")],
    # Admin fields
    username: Annotated[str, Form(min_length=3, max_length=40)],
    full_name: Annotated[str, Form(min_length=1, max_length=100)],
    email: Annotated[EmailStr, Form()],
    password: Annotated[str, Form(min_length=8, max_length=128)],
    # Optional company fields
    comp_website: Annotated[str | None, Form()] = None,
    comp_description: Annotated[str | None, Form(max_length=2000)] = None,
) -> SignupCompanyResponse:
    """Insert company → save logo → insert admin. Pydantic models are still
    used for validation (just constructed manually since multipart can't bind
    a full BaseModel directly)."""
    db = get_db()
    now = datetime.now(timezone.utc)

    # Validate admin half via the Pydantic model so password strength + email
    # format are enforced consistently with the rest of the codebase.
    try:
        admin_payload = AdminCreate(
            username=username,
            full_name=full_name,
            email=email,
            password=password,
        )
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    # 1. Insert the company doc (without logo path yet).
    company_doc = {
        "comp_name": comp_name.strip(),
        "comp_email": str(comp_email).lower(),
        "comp_industry": comp_industry.strip(),
        "comp_contact": comp_contact.strip(),
        "comp_website": comp_website.strip() if comp_website else None,
        "comp_description": comp_description.strip() if comp_description else None,
        "comp_logo": None,
        "created_at": now,
    }
    try:
        comp_res = await db.companies.insert_one(company_doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=409, detail="A company with that email is already registered"
        )
    company_doc["_id"] = comp_res.inserted_id

    # 2. Save the logo, keyed by the freshly-minted company id.
    try:
        logo_path = await save_upload(
            comp_logo, subdir="company_logos", key=str(comp_res.inserted_id)
        )
    except HTTPException:
        # Roll back the orphan company if the upload failed validation.
        await db.companies.delete_one({"_id": comp_res.inserted_id})
        raise
    company_doc["comp_logo"] = logo_path
    await db.companies.update_one(
        {"_id": comp_res.inserted_id},
        {"$set": {"comp_logo": logo_path}},
    )

    # 3. Insert the admin user pointing at the new company.
    user_doc = {
        "username": admin_payload.username.strip(),
        "full_name": admin_payload.full_name.strip(),
        "email": admin_payload.email.lower(),
        "password_hash": hash_password(admin_payload.password),
        "comp_id": comp_res.inserted_id,
        "role": "admin",
        "created_at": now,
    }
    try:
        user_res = await db.users.insert_one(user_doc)
    except DuplicateKeyError as e:
        # Best-effort rollback - drop the orphan company + logo file.
        # delete_upload is async under GridFS - without the await the
        # coroutine was created and thrown away, so the logo lingered.
        await db.companies.delete_one({"_id": comp_res.inserted_id})
        await delete_upload(logo_path)
        msg = str(e).lower()
        if "email" in msg:
            raise HTTPException(status_code=409, detail="Email already registered")
        if "username" in msg:
            raise HTTPException(status_code=409, detail="Username already taken")
        raise HTTPException(status_code=409, detail="User already exists")

    user_doc["_id"] = user_res.inserted_id
    return SignupCompanyResponse(
        access_token=_mint_token(user_doc),
        user=_user_out(user_doc),
        company=_company_out(company_doc),
    )


# ---------- invitation code lookup (used before showing signup form) ----


@router.get(
    "/check-code/{code}",
    response_model=CheckCodeResponse,
    summary="Validate an invitation code before showing the signup form.",
)
async def check_code(code: str) -> CheckCodeResponse:
    db = get_db()
    inv = await db.invitations.find_one({"code": code.strip(), "status": "active"})
    if not inv:
        return CheckCodeResponse(valid=False)
    company = await db.companies.find_one({"_id": inv["comp_id"]})
    if not company:
        return CheckCodeResponse(valid=False)
    # `role` falls back to "interviewer" for legacy invitations created
    # before the role-on-invite refactor (same fallback as InvitationOut).
    return CheckCodeResponse(
        valid=True,
        comp_name=company["comp_name"],
        role=inv.get("role") or "interviewer",
    )


# ---------- invited user signup (requires invitation code) --------------


@router.post(
    "/signup",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user account using an invitation code.",
)
async def signup(payload: UserCreate) -> UserOut:
    """Invited-teammate signup.

    Atomicity-ish: we first claim the invitation (active -> used) with a
    conditional update so two simultaneous signups with the same code can't
    both succeed. Only then do we insert the user. If user creation fails,
    we release the invitation back to active.

    Both comp_id AND role are taken from the matched invitation - never
    from the request body. The admin chose the role when they generated
    the code, so the invitee can't promote themselves.
    """
    db = get_db()
    code = payload.invitation_code.strip()

    inv = await db.invitations.find_one_and_update(
        {"code": code, "status": "active"},
        {"$set": {"status": "used", "used_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    if not inv:
        raise HTTPException(
            status_code=400, detail="Invalid or already-used invitation code"
        )

    # Role is sourced from the invitation. The fallback handles legacy
    # invitations created before the role-on-invite refactor.
    doc = {
        "username": payload.username.strip(),
        "full_name": payload.full_name.strip(),
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "comp_id": inv["comp_id"],
        "role": inv.get("role") or "interviewer",
        "created_at": datetime.now(timezone.utc),
    }
    try:
        result = await db.users.insert_one(doc)
    except DuplicateKeyError as e:
        # Release the invitation so it can be tried again.
        await db.invitations.update_one(
            {"_id": inv["_id"]},
            {"$set": {"status": "active"}, "$unset": {"used_at": ""}},
        )
        msg = str(e).lower()
        if "email" in msg:
            raise HTTPException(status_code=409, detail="Email already registered")
        if "username" in msg:
            raise HTTPException(status_code=409, detail="Username already taken")
        raise HTTPException(status_code=409, detail="User already exists")

    # Link invitation -> user for the admin dashboard's "who used this code".
    await db.invitations.update_one(
        {"_id": inv["_id"]},
        {"$set": {"user_id": result.inserted_id}},
    )

    doc["_id"] = result.inserted_id
    return _user_out(doc)


# ---------- login + me ---------------------------------------------------


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Exchange username/email + password for a JWT",
)
async def login(payload: LoginRequest) -> LoginResponse:
    try:
        db = get_db()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from exc

    identifier = payload.identifier.strip()

    try:
        user = await db.users.find_one(
            {"$or": [{"email": identifier.lower()}, {"username": identifier}]}
        )
    except (ConfigurationError, ServerSelectionTimeoutError, PyMongoError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from exc

    # Constant-time-ish: always verify even when the user doesn't exist.
    DUMMY_HASH = "$2b$12$abcdefghijklmnopqrstuuPj0ZILcQ4N3WVrxEYJhOQEAa7DpL7Tq"
    stored_hash = user["password_hash"] if user else DUMMY_HASH
    ok = verify_password(payload.password, stored_hash)

    if not user or not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username/email or password",
        )

    return LoginResponse(access_token=_mint_token(user), user=_user_out(user))


@router.get(
    "/me",
    response_model=UserOut,
    summary="Return the currently authenticated user",
)
async def me(current=Depends(get_current_user)) -> UserOut:
    return _user_out(current)
