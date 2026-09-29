from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from dependencies import get_current_comp_id
from models.interview_question import (
    ReactiveQuestionsResult,
    SimilarQuestion,
    SimilarQuestionResult,
    SuggestedQuestionsList,
)
from services.openai_service import (
    generate_interview_questions,
    generate_reactive_questions,
    generate_similar_question,
)


class ReactiveQuestionRequest(BaseModel):
    candidate_response: str
    interview_context: str = ""
    # The interview section the interviewer is currently in (name + short
    # description), so the suggestion can be steered to fit where they are.
    section_context: str = ""


router = APIRouter(prefix="/api/interview-questions", tags=["interview_questions"])


@router.post(
    "/{job_id}",
    response_model=SuggestedQuestionsList,
)
async def suggest_questions(
    job_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> SuggestedQuestionsList:
    db = get_db()
    # check if the job ID is a valid object
    if not ObjectId.is_valid(job_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid job ID",
        )

    job = await db.jobs.find_one({"_id": ObjectId(job_id), "comp_id": comp_id})

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
        # missing OpenAI API key
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


@router.post("/{job_id}/reactive", response_model=ReactiveQuestionsResult)
async def create_reactive_questions(
    job_id: str,
    request: ReactiveQuestionRequest,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> ReactiveQuestionsResult:
    db = get_db()
    if not ObjectId.is_valid(job_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid job ID",
        )

    job = await db.jobs.find_one({"_id": ObjectId(job_id), "comp_id": comp_id})

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    description = job.get("description", "").strip()

    if not description:
        raise HTTPException(
            status_code=400,
            detail="Job description is missing",
        )

    if not request.candidate_response.strip():
        raise HTTPException(
            status_code=400,
            detail="Candidate response is missing",
        )

    try:
        return await generate_reactive_questions(
            job_title=job.get("title", ""),
            job_description=description,
            transcript=(
                f"{request.interview_context}\nCandidate: {request.candidate_response}"
            ).strip(),
            candidate_response=request.candidate_response.strip(),
            section_context=request.section_context.strip(),
        )

    except RuntimeError as error:
        raise HTTPException(
            status_code=503,
            detail=str(error),
        ) from error

    except Exception as error:
        print("REACTIVE QUESTION ERROR:", repr(error))

        raise HTTPException(
            status_code=502,
            detail=f"Could not generate questions: {error}",
        ) from error


@router.post("/{job_id}/similar", response_model=SimilarQuestionResult)
async def create_similar_question(
    job_id: str,
    request: SimilarQuestion,
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    db = get_db()
    if not ObjectId.is_valid(job_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid job ID",
        )

    job = await db.jobs.find_one({"_id": ObjectId(job_id), "comp_id": comp_id})

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    description = job.get("description", "").strip()

    if not description:
        raise HTTPException(status_code=400, detail="Job description is missing")

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
