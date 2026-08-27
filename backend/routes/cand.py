from __future__ import annotations

import uuid
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from database import get_db
from dependencies import get_current_comp_id
from models.candidate import (
    CandidateCreate,
    CandidateCreateForJob,
    CandidateOut,
    CandidateUpdate,
)
from services.file_storage import delete_upload, save_upload

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


def _comp_oid(comp_id: str) -> ObjectId:
    """Validate + cast a string comp_id to an ObjectId.

    Every collection stores `comp_id` as an ObjectId (matching auth.py +
    invitations.py + jobs.py), so a string from the request body or query
    param must be converted before insert/query, otherwise nothing matches.
    """
    if not ObjectId.is_valid(comp_id):
        raise HTTPException(status_code=400, detail="Invalid comp_id")
    return ObjectId(comp_id)


def candidate_helper(candidate: dict, cand_status: str | None = None) -> CandidateOut:
    """Convert a raw Mongo candidate document into the API response model.

    Tolerant of older / legacy doc shapes so a list query can't crash on
    a single misshaped record. Missing required fields fall back to safe
    placeholders rather than raising a KeyError that turns into a 500.

    `cand_status` is an optional rollup computed by the caller (see
    list_candidates). Single-candidate endpoints leave it None - the
    dashboard is the only place that needs it today.
    """

    now = datetime.now(timezone.utc)
    return CandidateOut(
        cand_id=str(candidate["_id"]),
        cand_full_name=candidate.get("cand_full_name")
        or candidate.get("name")
        or "Unknown",
        cand_email=candidate.get("cand_email") or "unknown@unknown.test",
        cand_phone=candidate.get("cand_phone"),
        cand_cv_url=candidate.get("cand_cv_url"),
        cand_cover_letter_url=candidate.get("cand_cover_letter_url"),
        comp_id=str(candidate.get("comp_id") or ""),
        cand_created_at=candidate.get("cand_created_at")
        or candidate.get("created_at")
        or now,
        cand_updated_at=candidate.get("cand_updated_at")
        or candidate.get("updated_at")
        or now,
        cand_status=cand_status,
    )


def job_candidate_helper(job_candidate: dict) -> dict:
    """Convert a raw Mongo job-candidate document into the API response model."""

    return {
        "jobcand_id": str(job_candidate["_id"]),
        "cand_id": str(job_candidate["cand_id"]),
        "job_id": str(job_candidate["job_id"]),
        "cv_analysis": job_candidate.get("cv_analysis"),
        "communication_score": job_candidate.get("communication_score"),
        "skill_score": job_candidate.get("skill_score"),
        "problem_solving_score": job_candidate.get("problem_solving_score"),
        "created_at": job_candidate["created_at"],
        "updated_at": job_candidate["updated_at"],
    }


@router.post("", response_model=CandidateOut, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    payload: CandidateCreate,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> CandidateOut:
    """Insert a candidate document into the caller's company.

    Any `comp_id` on the payload is IGNORED - we substitute the JWT one
    so a user can't create candidates in another company.

    Doesn't create any job link. Use /create-for-job when the popup
    should create the candidate and attach them to a job in one flow.
    """

    db = get_db()
    comp_oid = comp_id  # JWT-derived

    existing_candidate = await db.candidates.find_one(
        {
            "cand_email": payload.cand_email,
            "comp_id": comp_oid,
        }
    )
    if existing_candidate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate with this email already exists in this company.",
        )

    now = datetime.now(timezone.utc)

    candidate_doc = {
        "cand_full_name": payload.cand_full_name,
        "cand_email": payload.cand_email,
        "cand_phone": payload.cand_phone,
        "cand_cv_url": payload.cand_cv_url,
        "cand_cover_letter_url": payload.cand_cover_letter_url,
        "comp_id": comp_oid,
        "cand_created_at": now,
        "cand_updated_at": now,
    }

    result = await db.candidates.insert_one(candidate_doc)
    created_candidate = await db.candidates.find_one({"_id": result.inserted_id})

    if not created_candidate:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create candidate.",
        )

    return candidate_helper(created_candidate)


@router.post("/create-for-job", status_code=status.HTTP_201_CREATED)
async def create_candidate_for_job(
    payload: CandidateCreateForJob,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> dict:
    """Combined popup flow.

    Any `comp_id` on the payload is IGNORED in favour of the JWT one, so
    cross-tenant writes are impossible regardless of what the client sends.

    Behaviour:
      1. reuse candidate if cand_id is provided and valid
      2. otherwise try to find candidate by cand_email + comp_id
      3. if still not found, create the candidate
      4. create the job_candidates link unless it already exists
    """

    db = get_db()
    now = datetime.now(timezone.utc)
    comp_oid = comp_id  # JWT-derived

    candidate = None

    # 1. If a candidate id is supplied, prefer that exact candidate.
    if payload.cand_id:
        if not ObjectId.is_valid(payload.cand_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid candidate id.",
            )
        candidate = await db.candidates.find_one({"_id": ObjectId(payload.cand_id)})

    # 2. Fall back to matching by email within the same company.
    if not candidate:
        candidate = await db.candidates.find_one(
            {
                "cand_email": payload.cand_email,
                "comp_id": comp_oid,
            }
        )

    # 3. If no candidate found, create a new one.
    if not candidate:
        candidate_doc = {
            "cand_full_name": payload.cand_full_name,
            "cand_email": payload.cand_email,
            "cand_phone": payload.cand_phone,
            "cand_cv_url": payload.cand_cv_url,
            "cand_cover_letter_url": payload.cand_cover_letter_url,
            "comp_id": comp_oid,
            "cand_created_at": now,
            "cand_updated_at": now,
        }

        candidate_result = await db.candidates.insert_one(candidate_doc)
        candidate = await db.candidates.find_one({"_id": candidate_result.inserted_id})

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create candidate.",
            )

    # 4. Optionally refresh editable candidate fields with the newest popup data.
    else:
        candidate_updates = {}
        if payload.cand_full_name and payload.cand_full_name != candidate.get(
            "cand_full_name"
        ):
            candidate_updates["cand_full_name"] = payload.cand_full_name
        if payload.cand_phone is not None and payload.cand_phone != candidate.get(
            "cand_phone"
        ):
            candidate_updates["cand_phone"] = payload.cand_phone
        if payload.cand_cv_url is not None and payload.cand_cv_url != candidate.get(
            "cand_cv_url"
        ):
            candidate_updates["cand_cv_url"] = payload.cand_cv_url
        if (
            payload.cand_cover_letter_url is not None
            and payload.cand_cover_letter_url != candidate.get("cand_cover_letter_url")
        ):
            candidate_updates["cand_cover_letter_url"] = payload.cand_cover_letter_url

        if candidate_updates:
            candidate_updates["cand_updated_at"] = now
            await db.candidates.update_one(
                {"_id": candidate["_id"]},
                {"$set": candidate_updates},
            )
            candidate = await db.candidates.find_one({"_id": candidate["_id"]})

    # 5. Get or create the job-candidate link.
    cand_id_str = str(candidate["_id"])
    existing_job_candidate = await db.job_candidates.find_one(
        {
            "cand_id": cand_id_str,
            "job_id": payload.job_id,
        }
    )

    if existing_job_candidate:
        job_candidate = existing_job_candidate
        message = "Candidate already linked to this job."
    else:
        job_candidate_doc = {
            "cand_id": cand_id_str,
            "job_id": payload.job_id,
            "cv_analysis": None,
            "communication_score": None,
            "skill_score": None,
            "problem_solving_score": None,
            "created_at": now,
            "updated_at": now,
        }

        job_candidate_result = await db.job_candidates.insert_one(job_candidate_doc)
        job_candidate = await db.job_candidates.find_one(
            {"_id": job_candidate_result.inserted_id}
        )

        if not job_candidate:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create candidate-job link.",
            )

        message = "Candidate created and linked to job successfully."

    # 6. Create interview + interviewer link whenever a date or interviewer is assigned.
    scheduled_dt = None
    if payload.scheduled_at:
        try:
            scheduled_dt = datetime.fromisoformat(payload.scheduled_at)
        except ValueError:
            pass

    if scheduled_dt or payload.interviewer_user_id:
        intv_status = "scheduled" if scheduled_dt else "not_scheduled"

        existing_interview = await db.interviews.find_one(
            {"cand_id": cand_id_str, "job_id": payload.job_id}
        )

        if existing_interview:
            intv_id = str(existing_interview["_id"])
            await db.interviews.update_one(
                {"_id": existing_interview["_id"]},
                {
                    "$set": {
                        "intv_date_time": scheduled_dt,
                        "intv_status": intv_status,
                        "intv_updated_at": now,
                    }
                },
            )
        else:
            intv_result = await db.interviews.insert_one(
                {
                    "cand_id": cand_id_str,
                    "job_id": payload.job_id,
                    "intv_date_time": scheduled_dt,
                    "intv_location": None,
                    "intv_transcript": None,
                    "intv_status": intv_status,
                    "intv_candidate_report": None,
                    "intv_interviewer_report": None,
                    "intv_created_at": now,
                    "intv_updated_at": now,
                }
            )
            intv_id = str(intv_result.inserted_id)

        if payload.interviewer_user_id:
            await db.interview_users.delete_many({"intv_id": intv_id})
            await db.interview_users.insert_one(
                {
                    "user_id": payload.interviewer_user_id,
                    "intv_id": intv_id,
                    "intvuser_created_at": now,
                    "intvuser_updated_at": now,
                }
            )

    return {
        "message": message,
        "candidate": candidate_helper(candidate).model_dump(),
        "job_candidate": job_candidate_helper(job_candidate),
    }


@router.get("", response_model=list[CandidateOut])
async def list_candidates(
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[CandidateOut]:
    """List candidates in the caller's company.

    Each row also carries `cand_status`, a rollup over the candidate's
    interviews:
      - "SCHEDULED" if ANY interview is still SCHEDULED (something pending)
      - "EVALUATED"/"HIRED"/"REJECTED" otherwise, when at least one exists
      - None        if there's no interview at all (profile-only)
    The rollup makes the dashboard "candidates" panel actionable
    (status badge + filter) without N+1 fetches from the frontend.

    Tenant isolation: comp_id is sourced from the JWT.
    """
    db = get_db()

    candidates = await db.candidates.find({"comp_id": comp_id}).to_list(length=100)
    if not candidates:
        return []

    # Rollup status from job_candidates + interviews. The display priority is:
    #   SCHEDULED > EVALUATED / HIRED / REJECTED > NOT SCHEDULED > None
    # so the recruiter scanning the dashboard always sees the *most progressed*
    # state of any application the candidate is currently on.
    #
    # cand_id is stored as a STRING in both job_candidates and interviews.
    cand_ids = [str(c["_id"]) for c in candidates]

    # 1. Candidates with at least one job-candidate link default to
    #    "NOT SCHEDULED" - they're in the pipeline but no interview has been
    #    booked yet. Profile-only candidates (no link, no interview) stay None
    #    so the dashboard's "no application" filter drops them.
    linked_cand_ids: set[str] = set()
    async for jc in db.job_candidates.find(
        {"cand_id": {"$in": cand_ids}},
        {"cand_id": 1},
    ):
        cid = jc.get("cand_id")
        if cid:
            linked_cand_ids.add(cid)

    # 2. Interview-based statuses override the default. SCHEDULED wins over
    #    anything else; NOT SCHEDULED only sets if nothing better is recorded.
    interviews = await db.interviews.find(
        {"cand_id": {"$in": cand_ids}},
        {"cand_id": 1, "intv_status": 1},
    ).to_list(length=1000)
    statuses: dict[str, str] = {}
    for intv in interviews:
        cid = intv.get("cand_id")
        if not cid:
            continue
        # `not_scheduled` -> `NOT SCHEDULED`, `scheduled` -> `SCHEDULED`, etc.
        s = (intv.get("intv_status") or "").upper().replace("_", " ")
        if s == "SCHEDULED":
            statuses[cid] = "SCHEDULED"
        elif (
            s in ("EVALUATED", "HIRED", "REJECTED") and statuses.get(cid) != "SCHEDULED"
        ):
            statuses[cid] = s
        elif s == "NOT SCHEDULED" and cid not in statuses:
            statuses[cid] = "NOT SCHEDULED"

    # 3. Linked candidates that still have nothing in `statuses` get
    #    NOT SCHEDULED as the default - "they're applying, just not booked".
    for cid in linked_cand_ids:
        statuses.setdefault(cid, "NOT SCHEDULED")

    return [candidate_helper(c, statuses.get(str(c["_id"]))) for c in candidates]


@router.get("/{cand_id}", response_model=CandidateOut)
async def get_candidate(
    cand_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> CandidateOut:
    """Fetch a single candidate. 404s for candidates in another company."""
    db = get_db()

    if not ObjectId.is_valid(cand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid candidate id.",
        )

    candidate = await db.candidates.find_one(
        {"_id": ObjectId(cand_id), "comp_id": comp_id}
    )
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found.",
        )

    return candidate_helper(candidate)


@router.patch("/{cand_id}", response_model=CandidateOut)
async def update_candidate(
    cand_id: str,
    payload: CandidateUpdate,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> CandidateOut:
    """Patch a candidate. 404s if it isn't in the caller's company."""
    db = get_db()

    if not ObjectId.is_valid(cand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid candidate id.",
        )

    existing_candidate = await db.candidates.find_one(
        {"_id": ObjectId(cand_id), "comp_id": comp_id}
    )
    if not existing_candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        return candidate_helper(existing_candidate)

    # Email must remain unique within the same company.
    if "cand_email" in update_data:
        duplicate_candidate = await db.candidates.find_one(
            {
                "cand_email": update_data["cand_email"],
                "comp_id": existing_candidate["comp_id"],
                "_id": {"$ne": ObjectId(cand_id)},
            }
        )
        if duplicate_candidate:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate with this email already exists in this company.",
            )

    update_data["cand_updated_at"] = datetime.now(timezone.utc)

    await db.candidates.update_one(
        {"_id": ObjectId(cand_id)},
        {"$set": update_data},
    )

    updated_candidate = await db.candidates.find_one({"_id": ObjectId(cand_id)})
    if not updated_candidate:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update candidate.",
        )

    return candidate_helper(updated_candidate)


@router.post("/{cand_id}/cover-letter", response_model=CandidateOut)
async def upload_cover_letter(
    cand_id: str,
    cover_letter: UploadFile = File(..., description="Cover letter PDF"),
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> CandidateOut:
    """Attach (or replace) a candidate's cover letter as a standalone upload.

    The CV path goes through /api/cv-analysis because a CV always triggers an
    analysis; a cover letter on its own doesn't, so this endpoint just stores
    the file and points `cand_cover_letter_url` at it. When a CV and cover
    letter are uploaded together, the analysis route sets the URL instead.
    """
    db = get_db()

    if not ObjectId.is_valid(cand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid candidate id.",
        )

    candidate = await db.candidates.find_one(
        {"_id": ObjectId(cand_id), "comp_id": comp_id}
    )
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found.",
        )

    if cover_letter.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cover letter must be a PDF (got {cover_letter.content_type or 'unknown'}).",
        )

    path = await save_upload(
        cover_letter,
        subdir="candidate_docs",
        key=f"{cand_id}-cl-{uuid.uuid4().hex[:8]}",
    )

    # Best-effort cleanup of the previous standalone upload. Files under
    # cv_analyses/ are owned by an analysis document (deleted with it), so
    # only files this endpoint created (candidate_docs/) are removed here.
    old_url = candidate.get("cand_cover_letter_url") or ""
    old_prefix = "/api/files/candidate_docs/"
    if old_url.startswith(old_prefix):
        delete_upload(old_url.removeprefix("/api/files/"))

    now = datetime.now(timezone.utc)
    await db.candidates.update_one(
        {"_id": candidate["_id"]},
        {
            "$set": {
                "cand_cover_letter_url": f"/api/files/{path}",
                "cand_updated_at": now,
            }
        },
    )

    updated = await db.candidates.find_one({"_id": candidate["_id"]})
    return candidate_helper(updated)
