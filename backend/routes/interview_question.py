from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from models.interview_question import SuggestedQuestionsList
from services.openai_service import generate_interview_questions

from database import get_db

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
        question = await generate_interview_questions(
            job_title=job.get("title", ""),
            job_description=description,
        )

        return SuggestedQuestionsList.model_validate(question)

    except RuntimeError as error:
        #missing OpenAI API key
        raise HTTPException(
            status_code=503,
            detail=str(error),
        ) from error

    except Exception as error:
        # Invalid AI output or request failures
        raise HTTPException(
            status_code=502,
            detail="Question generation failed",
        ) from error