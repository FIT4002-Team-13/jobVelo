from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status

from database import get_db
from models.candidate import (
    CandidateCreate,
    CandidateCreateForJob,
    CandidateOut,
    CandidateUpdate,
)

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


def candidate_helper(candidate: dict) -> CandidateOut:
    """Convert a raw Mongo candidate document into the API response model.

    Tolerant of older / legacy doc shapes so a list query can't crash on
    a single misshaped record. Missing required fields fall back to safe
    placeholders rather than raising a KeyError that turns into a 500.
    """

    now = datetime.now(timezone.utc)
    return CandidateOut(
        cand_id=str(candidate["_id"]),
        cand_full_name=candidate.get("cand_full_name") or candidate.get("name") or "Unknown",
        cand_email=candidate.get("cand_email") or "unknown@unknown.test",
        cand_phone=candidate.get("cand_phone"),
        cand_cv_url=candidate.get("cand_cv_url"),
        cand_cover_letter_url=candidate.get("cand_cover_letter_url"),
        comp_id=str(candidate.get("comp_id") or ""),
        cand_created_at=candidate.get("cand_created_at") or candidate.get("created_at") or now,
        cand_updated_at=candidate.get("cand_updated_at") or candidate.get("updated_at") or now,
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
async def create_candidate(payload: CandidateCreate) -> CandidateOut:
    """Insert a candidate document only.

    Doesn't create any job link. Use /create-for-job when the popup
    should create the candidate and attach them to a job in one flow.
    """

    db = get_db()
    comp_oid = _comp_oid(payload.comp_id)

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
async def create_candidate_for_job(payload: CandidateCreateForJob) -> dict:
    """Combined popup flow.

    Behaviour:
      1. reuse candidate if cand_id is provided and valid
      2. otherwise try to find candidate by cand_email + comp_id
      3. if still not found, create the candidate
      4. create the job_candidates link unless it already exists
    """

    db = get_db()
    now = datetime.now(timezone.utc)
    comp_oid = _comp_oid(payload.comp_id)

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
        if payload.cand_full_name and payload.cand_full_name != candidate.get("cand_full_name"):
            candidate_updates["cand_full_name"] = payload.cand_full_name
        if payload.cand_phone is not None and payload.cand_phone != candidate.get("cand_phone"):
            candidate_updates["cand_phone"] = payload.cand_phone
        if payload.cand_cv_url is not None and payload.cand_cv_url != candidate.get("cand_cv_url"):
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

    # 5. Prevent duplicate candidate-job links.
    existing_job_candidate = await db.job_candidates.find_one(
        {
            "cand_id": str(candidate["_id"]),
            "job_id": payload.job_id,
        }
    )

    if existing_job_candidate:
        return {
            "message": "Candidate already linked to this job.",
            "candidate": candidate_helper(candidate).model_dump(),
            "job_candidate": job_candidate_helper(existing_job_candidate),
        }

    # 6. Create the job-specific candidate link.
    job_candidate_doc = {
        "cand_id": str(candidate["_id"]),
        "job_id": payload.job_id,
        "cv_analysis": None,
        "communication_score": None,
        "skill_score": None,
        "problem_solving_score": None,
        "created_at": now,
        "updated_at": now,
    }

    job_candidate_result = await db.job_candidates.insert_one(job_candidate_doc)
    created_job_candidate = await db.job_candidates.find_one(
        {"_id": job_candidate_result.inserted_id}
    )

    if not created_job_candidate:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create candidate-job link.",
        )

    return {
        "message": "Candidate created and linked to job successfully.",
        "candidate": candidate_helper(candidate).model_dump(),
        "job_candidate": job_candidate_helper(created_job_candidate),
    }


@router.get("", response_model=list[CandidateOut])
async def list_candidates(comp_id: str | None = None) -> list[CandidateOut]:
    db = get_db()

    query: dict = {}
    if comp_id:
        query["comp_id"] = _comp_oid(comp_id)

    candidates = await db.candidates.find(query).to_list(length=100)
    return [candidate_helper(candidate) for candidate in candidates]


@router.get("/{cand_id}", response_model=CandidateOut)
async def get_candidate(cand_id: str) -> CandidateOut:
    db = get_db()

    if not ObjectId.is_valid(cand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid candidate id.",
        )

    candidate = await db.candidates.find_one({"_id": ObjectId(cand_id)})
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found.",
        )

    return candidate_helper(candidate)


@router.patch("/{cand_id}", response_model=CandidateOut)
async def update_candidate(cand_id: str, payload: CandidateUpdate) -> CandidateOut:
    db = get_db()

    if not ObjectId.is_valid(cand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid candidate id.",
        )

    existing_candidate = await db.candidates.find_one({"_id": ObjectId(cand_id)})
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