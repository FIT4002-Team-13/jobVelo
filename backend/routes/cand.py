from __future__ import annotations

from datetime import datetime, UTC

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status

from database import get_db
from models.candidate import CandidateCreate, CandidateCreateForJob, CandidateOut, CandidateUpdate

router = APIRouter(prefix="/api/candidates", tags=["candidates"])

def candidate_helper(candidate: dict) -> CandidateOut:
    return CandidateOut(
        id=str(candidate["_id"]),
        full_name=candidate["full_name"],
        email=candidate["email"],
        phone=candidate.get("phone"),
        cv_url=candidate.get("cv_url"),
        cover_letter_url=candidate.get("cover_letter_url"),
        comp_id=str(candidate["comp_id"]),
        created_at=candidate["created_at"],
        updated_at=candidate["updated_at"],
    )

def job_candidate_helper(job_candidate: dict) -> dict:
    return {
        "id": str(job_candidate["_id"]),
        "candidate_id": str(job_candidate["candidate_id"]),
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
    db = get_db()

    existing_candidate = await db.candidates.find_one(
        {
            "email": payload.email,
            "comp_id": payload.comp_id,
        }
    )
    if existing_candidate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate with this email already exists in this company.",
        )

    now = datetime.now(UTC)

    candidate_doc = {
        "full_name": payload.full_name,
        "email": payload.email,
        "phone": payload.phone,
        "cv_url": payload.cv_url,
        "cover_letter_url": payload.cover_letter_url,
        "comp_id": payload.comp_id,
        "created_at": now,
        "updated_at": now,
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
    db = get_db()
    now = datetime.now(UTC)

    candidate = await db.candidates.find_one(
        {
            "email": payload.email,
            "comp_id": payload.comp_id,
        }
    )

    if not candidate:
        candidate_doc = {
            "full_name": payload.full_name,
            "email": payload.email,
            "phone": payload.phone,
            "cv_url": payload.cv_url,
            "cover_letter_url": payload.cover_letter_url,
            "comp_id": payload.comp_id,
            "created_at": now,
            "updated_at": now,
        }

        candidate_result = await db.candidates.insert_one(candidate_doc)
        candidate = await db.candidates.find_one({"_id": candidate_result.inserted_id})

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create candidate.",
            )
    else:
        candidate_updates = {}
        if payload.full_name and payload.full_name != candidate.get("full_name"):
            candidate_updates["full_name"] = payload.full_name
        if payload.phone is not None and payload.phone != candidate.get("phone"):
            candidate_updates["phone"] = payload.phone
        if payload.cv_url is not None and payload.cv_url != candidate.get("cv_url"):
            candidate_updates["cv_url"] = payload.cv_url
        if (
            payload.cover_letter_url is not None
            and payload.cover_letter_url != candidate.get("cover_letter_url")
        ):
            candidate_updates["cover_letter_url"] = payload.cover_letter_url

        if candidate_updates:
            candidate_updates["updated_at"] = now
            await db.candidates.update_one(
                {"_id": candidate["_id"]},
                {"$set": candidate_updates},
            )
            candidate = await db.candidates.find_one({"_id": candidate["_id"]})

    existing_job_candidate = await db.job_candidates.find_one(
        {
            "candidate_id": str(candidate["_id"]),
            "job_id": payload.job_id,
        }
    )

    if existing_job_candidate:
        return {
            "message": "Candidate already linked to this job.",
            "candidate": candidate_helper(candidate).model_dump(),
            "job_candidate": job_candidate_helper(existing_job_candidate),
        }

    job_candidate_doc = {
        "candidate_id": str(candidate["_id"]),
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

    query = {}
    if comp_id:
        query["comp_id"] = comp_id

    candidates = await db.candidates.find(query).to_list(length=100)
    return [candidate_helper(candidate) for candidate in candidates]


@router.get("/{candidate_id}", response_model=CandidateOut)
async def get_candidate(candidate_id: str) -> CandidateOut:
    db = get_db()

    if not ObjectId.is_valid(candidate_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid candidate id.",
        )

    candidate = await db.candidates.find_one({"_id": ObjectId(candidate_id)})
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found.",
        )

    return candidate_helper(candidate)

@router.patch("/{candidate_id}", response_model=CandidateOut)
async def update_candidate(candidate_id: str, payload: CandidateUpdate) -> CandidateOut:
    db = get_db()

    if not ObjectId.is_valid(candidate_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid candidate id.",
        )

    existing_candidate = await db.candidates.find_one({"_id": ObjectId(candidate_id)})
    if not existing_candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        return candidate_helper(existing_candidate)

    if "email" in update_data:
        duplicate_candidate = await db.candidates.find_one(
            {
                "email": update_data["email"],
                "comp_id": existing_candidate["comp_id"],
                "_id": {"$ne": ObjectId(candidate_id)},
            }
        )
        if duplicate_candidate:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate with this email already exists in this company.",
            )

    update_data["updated_at"] = datetime.now(UTC)

    await db.candidates.update_one(
        {"_id": ObjectId(candidate_id)},
        {"$set": update_data},
    )

    updated_candidate = await db.candidates.find_one({"_id": ObjectId(candidate_id)})
    if not updated_candidate:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update candidate.",
        )

    return candidate_helper(updated_candidate)