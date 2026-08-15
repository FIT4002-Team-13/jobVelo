from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db
from models.interview_question import (
    SimilarQuestion,
    SimilarQuestionResult,
    SuggestedQuestionsList,
)
from services.openai_service import (
    generate_interview_questions,
    generate_similar_question,
)

router = APIRouter(prefix="/api/interview-questions", tags=["interview_questions"])

@router.post("/{job_id}", response_model=SuggestedQuestionsList,)

async def suggest_questions(job_id: str, db: AsyncIOMotorDatabase = Depends(get_db),) -> SuggestedQuestionsList:

    # check if the job ID is a valid object
    if not ObjectId.is_valid(job_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid job ID",
        )

    job = await db.jobs.find_one(
        {"_id": ObjectId(job_id)}
    )

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    description = job.get("description", "").strip()

    try:
        return await generate_interview_questions(
            job_title=job.get("title", ""),
            job_description=description,
        )

    except RuntimeError as error:
        #missing OpenAI API key
        raise HTTPException(
            status_code=503,
            detail=str(error),
        ) from error

    except Exception as error:
        # Invalid AI output or request failures
        print("QUESTION GENERATION ERROR:", repr(error))
        raise HTTPException(
            status_code=502,
            detail=f"Question generation failed: {error}",
        ) from error

@router.post("/{job_id}/similar", response_model=SimilarQuestionResult)

async def create_similar_question(job_id: str, request: SimilarQuestion, db: AsyncIOMotorDatabase = Depends(get_db)):

    if not ObjectId.is_valid(job_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid job ID",
        )

    job = await db.jobs.find_one({"_id": ObjectId(job_id)})

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )

    description = job.get("description", "").strip()

    if not description:
        raise HTTPException(
            status_code=400,
            detail="Job description is missing"
        )

    try:
        return await generate_similar_question(
            job_title=job.get("title", ""),
            job_description=description,
            original_question=request.original_question,
            category=request.category,
        )

    except Exception as error:
        print("SIMILAR QUESTION ERROR:", repr(error))

        raise HTTPException(
            status_code=502,
            detail=f"Could not generate similar question: {error}",
        ) from error