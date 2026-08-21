from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import PlainTextResponse

from database import get_db
from dependencies import get_current_comp_id
from models.interview import InterviewCreate, InterviewOut, InterviewUpdate

router = APIRouter(prefix="/api/interviews", tags=["interviews"])


async def _company_job_ids(db, comp_id: ObjectId) -> list[str]:
    """String ids of every job in the caller's company. Interviews reference
    job_id (string), so this is how we scope interview queries to a tenant."""
    return [str(j["_id"]) async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})]


async def _interview_in_company(db, interview: dict, comp_id: ObjectId) -> bool:
    """True if the interview's job belongs to the caller's company."""
    job_id = interview.get("job_id")
    if not job_id or not ObjectId.is_valid(job_id):
        return False
    return (
        await db.jobs.find_one(
            {"_id": ObjectId(job_id), "comp_id": comp_id}, {"_id": 1}
        )
        is not None
    )


def interview_helper(interview: dict) -> InterviewOut:
    """Convert a raw Mongo interview document into the API response model."""

    raw_status = interview["intv_status"]
    if raw_status == "EVALUATED":
        raw_status = "evaluated"

    return InterviewOut(
        intv_id=str(interview["_id"]),
        cand_id=str(interview["cand_id"]),
        job_id=str(interview["job_id"]),
        intv_date_time=interview["intv_date_time"],
        intv_location=interview.get("intv_location"),
        intv_transcript=interview.get("intv_transcript"),
        intv_status=raw_status,
        intv_candidate_report=interview.get("intv_candidate_report"),
        intv_interviewer_report=interview.get("intv_interviewer_report"),
        intv_created_at=interview["intv_created_at"],
        intv_updated_at=interview["intv_updated_at"],
    )


def _validate_oid(value: str, what: str) -> ObjectId:
    """Validate an incoming id string and convert it into a Mongo ObjectId."""

    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {what} id")
    return ObjectId(value)


def _feedback_to_text(title: str, report: dict | None) -> str:
    """Render a structured report object as a downloadable plain-text document."""

    if not report:
        return f"{title}\n\nNo report available."

    summary = report.get("summary") or "No summary available."

    strengths = report.get("strengths") or {}
    strength_items = strengths.get("items") or []
    strength_justification = (
        strengths.get("justification") or "No justification available."
    )

    improvements = report.get("improvements") or {}
    improvement_items = improvements.get("items") or []
    improvement_justification = (
        improvements.get("justification") or "No justification available."
    )

    strength_lines = (
        "\n".join(f"- {item}" for item in strength_items)
        if strength_items
        else "- None"
    )
    improvement_lines = (
        "\n".join(f"- {item}" for item in improvement_items)
        if improvement_items
        else "- None"
    )

    return (
        f"{title}\n\n"
        f"Summary:\n{summary}\n\n"
        f"Strengths:\n{strength_lines}\n\n"
        f"Strengths Justification:\n{strength_justification}\n\n"
        f"Improvements:\n{improvement_lines}\n\n"
        f"Improvements Justification:\n{improvement_justification}\n"
    )


@router.post("", response_model=InterviewOut, status_code=status.HTTP_201_CREATED)
async def create_interview(
    payload: InterviewCreate,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> InterviewOut:
    """Create a new interview document.

    The route checks that the candidate and job already exist AND belong to
    the caller's company before creating the interview, so broken or
    cross-tenant references are never stored.
    """
    db = get_db()

    cand_oid = _validate_oid(payload.cand_id, "candidate")
    job_oid = _validate_oid(payload.job_id, "job")

    candidate = await db.candidates.find_one({"_id": cand_oid, "comp_id": comp_id})
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")

    job = await db.jobs.find_one({"_id": job_oid, "comp_id": comp_id})
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    now = datetime.now(timezone.utc)

    interview_doc = {
        "cand_id": payload.cand_id,
        "job_id": payload.job_id,
        "intv_date_time": payload.intv_date_time,
        "intv_location": payload.intv_location,
        "intv_transcript": None,
        "intv_status": payload.intv_status,
        "intv_candidate_report": None,
        "intv_interviewer_report": None,
        "intv_created_at": now,
        "intv_updated_at": now,
    }

    result = await db.interviews.insert_one(interview_doc)
    created_interview = await db.interviews.find_one({"_id": result.inserted_id})

    if not created_interview:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create interview.",
        )

    return interview_helper(created_interview)


@router.get("", response_model=list[InterviewOut])
async def list_interviews(
    cand_id: str | None = None,
    job_id: str | None = None,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[InterviewOut]:
    """List interviews in the caller's company, optionally filtered by
    candidate or job. The base query is always restricted to the company's
    own job ids so a user can't read another company's interviews."""

    db = get_db()

    company_job_ids = await _company_job_ids(db, comp_id)
    if not company_job_ids:
        return []

    # If a specific job_id is requested, intersect it with the company set;
    # otherwise scope to all the company's jobs.
    if job_id:
        if job_id not in company_job_ids:
            return []
        query: dict = {"job_id": job_id}
    else:
        query = {"job_id": {"$in": company_job_ids}}
    if cand_id:
        query["cand_id"] = cand_id

    interviews = await db.interviews.find(query).to_list(length=100)
    return [interview_helper(doc) for doc in interviews]


@router.get("/{intv_id}", response_model=InterviewOut)
async def get_interview(
    intv_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> InterviewOut:
    """Return one interview by id (404 if not in the caller's company)."""

    db = get_db()
    oid = _validate_oid(intv_id, "interview")

    interview = await db.interviews.find_one({"_id": oid})
    if not interview or not await _interview_in_company(db, interview, comp_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found.",
        )

    return interview_helper(interview)


@router.patch("/{intv_id}", response_model=InterviewOut)
async def update_interview(
    intv_id: str,
    payload: InterviewUpdate,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> InterviewOut:
    """Update any mutable interview fields.

    Only the fields included in the request body are written back to Mongo so a
    partial update does not erase unrelated interview data.
    """

    db = get_db()
    oid = _validate_oid(intv_id, "interview")

    existing_interview = await db.interviews.find_one({"_id": oid})
    if not existing_interview or not await _interview_in_company(
        db, existing_interview, comp_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return interview_helper(existing_interview)

    update_data["intv_updated_at"] = datetime.now(timezone.utc)

    result = await db.interviews.find_one_and_update(
        {"_id": oid},
        {"$set": update_data},
        return_document=True,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update interview.",
        )

    return interview_helper(result)


@router.get("/{intv_id}/candidate-report")
async def download_candidate_report(
    intv_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> PlainTextResponse:
    """Return the candidate-facing report as a downloadable text file."""

    db = get_db()
    oid = _validate_oid(intv_id, "interview")

    interview = await db.interviews.find_one({"_id": oid})
    if not interview or not await _interview_in_company(db, interview, comp_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found.",
        )

    text = _feedback_to_text("Candidate Report", interview.get("intv_candidate_report"))

    return PlainTextResponse(
        content=text,
        headers={
            "Content-Disposition": f'attachment; filename="candidate-report-{intv_id}.txt"'
        },
    )


@router.get("/{intv_id}/interviewer-report")
async def download_interviewer_report(
    intv_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> PlainTextResponse:
    """Return the interviewer-facing report as a downloadable text file."""

    db = get_db()
    oid = _validate_oid(intv_id, "interview")

    interview = await db.interviews.find_one({"_id": oid})
    if not interview or not await _interview_in_company(db, interview, comp_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found.",
        )

    text = _feedback_to_text(
        "Interviewer Report", interview.get("intv_interviewer_report")
    )

    return PlainTextResponse(
        content=text,
        headers={
            "Content-Disposition": f'attachment; filename="interviewer-report-{intv_id}.txt"'
        },
    )
