from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status

from database import get_db
from dependencies import get_current_comp_id, get_current_user, require_role
from models.interview import (
    InterviewCompleteOut,
    InterviewCompleteRequest,
    InterviewCreate,
    InterviewFeedback,
    InterviewFeedbackSection,
    InterviewOut,
    InterviewScores,
    InterviewUpdate,
    TranscriptEntry,
)
from services.openai_service import generate_interview_reports

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interviews", tags=["interviews"])

_VALID_STATUSES = {"not_scheduled", "scheduled", "in_progress", "completed", "cancelled"}


async def _job_in_company(db, job_id: str | None, comp_id: ObjectId) -> bool:
    """Tenant guard: an interview belongs to whichever company owns its job."""
    if not job_id or not ObjectId.is_valid(job_id):
        return False
    return (
        await db.jobs.find_one({"_id": ObjectId(job_id), "comp_id": comp_id}, {"_id": 1})
        is not None
    )


async def _get_interview_in_company(db, intv_id: str, comp_id: ObjectId) -> dict:
    """Fetch an interview, 404-ing when it doesn't exist OR belongs to a
    different company (404 rather than 403 so ids can't be probed)."""
    if not ObjectId.is_valid(intv_id):
        raise HTTPException(status_code=400, detail="Invalid interview id.")
    interview = await db.interviews.find_one({"_id": ObjectId(intv_id)})
    if not interview or not await _job_in_company(db, interview.get("job_id"), comp_id):
        raise HTTPException(status_code=404, detail="Interview not found.")
    return interview


def _safe_report(raw) -> InterviewFeedback | None:
    """Validate a stored report, tolerating legacy/partial shapes. A report
    that no longer matches the model (e.g. written before US28's evidence
    fields, or with a null section) must not 500 the whole read - we drop it
    to None and log, so the rest of the interview still loads."""
    if not raw or not isinstance(raw, dict):
        return None
    try:
        return InterviewFeedback(**raw)
    except Exception:  # any malformed shape falls back to None
        logger.warning("Dropping unparseable interview report", exc_info=True)
        return None


def _safe_transcript(raw) -> list[TranscriptEntry] | None:
    """Validate transcript entries one-by-one, skipping any malformed entry
    (missing id/speaker/timestamp/text) rather than failing the whole list."""
    if not isinstance(raw, list):
        return None
    out: list[TranscriptEntry] = []
    for entry in raw:
        try:
            out.append(TranscriptEntry(**entry))
        except Exception:
            continue
    return out


def interview_helper(interview: dict) -> InterviewOut:
    """Convert a raw Mongo interview document into the API response model.

    Defensive against legacy / partially-written documents: required
    timestamps fall back to each other (or now), an unknown status falls
    back to not_scheduled, and malformed reports/transcripts degrade to
    None/[] instead of raising - one bad historical doc shouldn't 500 an
    entire list query (this was the "failed to load candidate page" bug)."""
    now = datetime.now(timezone.utc)
    created = interview.get("intv_created_at")
    updated = interview.get("intv_updated_at")
    if not isinstance(created, datetime):
        created = updated if isinstance(updated, datetime) else now
    if not isinstance(updated, datetime):
        updated = created

    status_val = interview.get("intv_status")
    if status_val not in _VALID_STATUSES:
        status_val = "not_scheduled"

    return InterviewOut(
        intv_id=str(interview["_id"]),
        cand_id=str(interview.get("cand_id", "")),
        job_id=str(interview.get("job_id", "")),
        intv_date_time=interview.get("intv_date_time"),
        intv_location=interview.get("intv_location"),
        intv_transcript=_safe_transcript(interview.get("intv_transcript")),
        intv_status=status_val,
        intv_duration_seconds=interview.get("intv_duration_seconds"),
        intv_candidate_report=_safe_report(interview.get("intv_candidate_report")),
        intv_interviewer_report=_safe_report(interview.get("intv_interviewer_report")),
        intv_created_at=created,
        intv_updated_at=updated,
    )

@router.post(
    "",
    response_model=InterviewOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an interview session.",
)
async def create_interview(
    payload: InterviewCreate,
    _user: dict = Depends(require_role("interviewer")),
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> InterviewOut:
    """Insert a new interview document.

    The interview is created first, and interviewer-user links are created
    separately through /api/interview-users. Starting an interview is
    interviewer-only - other roles (admin, recruiter, hiring_manager) can
    still view interview data via the GET endpoints below, just not create
    a new session. Tenant guard: both the job and the candidate must belong
    to the caller's company.
    """
    db = get_db()

    if not await _job_in_company(db, payload.job_id, comp_id):
        raise HTTPException(status_code=404, detail="Job not found.")
    if not ObjectId.is_valid(payload.cand_id) or not await db.candidates.find_one(
        {"_id": ObjectId(payload.cand_id), "comp_id": comp_id}, {"_id": 1}
    ):
        raise HTTPException(status_code=404, detail="Candidate not found.")

    now = datetime.now(timezone.utc)

    interview_doc = {
        "cand_id": payload.cand_id,
        "job_id": payload.job_id,
        "intv_date_time": payload.intv_date_time,
        "intv_location": payload.intv_location,
        "intv_transcript": None,
        "intv_status": payload.intv_status,
        "intv_duration_seconds": None,
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

@router.get(
    "",
    response_model=list[InterviewOut],
    summary="List interviews, optionally filtered by candidate or job.",
)
async def list_interviews(
    cand_id: str | None = None,
    job_id: str | None = None,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> list[InterviewOut]:
    db = get_db()

    query = {}
    if cand_id:
        query["cand_id"] = cand_id
    if job_id:
        query["job_id"] = job_id

    # Tenant guard: only interviews whose job belongs to the caller's
    # company. A company's job set is small, so an $in filter is cheap and
    # keeps the response scoped even when no cand_id/job_id was given.
    company_job_ids = [
        str(j["_id"])
        async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})
    ]
    query["job_id"] = (
        job_id if job_id and job_id in company_job_ids
        else {"$in": company_job_ids} if not job_id
        else "__no_match__"  # asked for another company's job -> empty list
    )

    interviews = await db.interviews.find(query).to_list(length=100)
    return [interview_helper(doc) for doc in interviews]

@router.get(
    "/{intv_id}",
    response_model=InterviewOut,
    summary="Get one interview by id.",
)
async def get_interview(
    intv_id: str,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> InterviewOut:
    db = get_db()
    interview = await _get_interview_in_company(db, intv_id, comp_id)
    return interview_helper(interview)

# Cap what we send to the LLM: far below the model's context window, but
# enough for hours of conversation. Past the budget the OLDEST turns are
# dropped - the recent portion carries the most signal for scoring.
_TRANSCRIPT_CHAR_BUDGET = 60_000


def _transcript_to_text(entries: list[dict]) -> str:
    """Flatten transcript entries into "[mm:ss] Speaker: text" lines for
    the LLM. Skips empty lines and in-flight partials defensively, and
    truncates oldest-first past the char budget so an extremely long
    interview can still be completed instead of 502-ing forever."""
    lines = []
    for e in entries or []:
        text = (e.get("text") or "").strip()
        if not text:
            continue
        speaker = e.get("speaker") or "Unknown"
        timestamp = e.get("timestamp") or ""
        prefix = f"[{timestamp}] " if timestamp else ""
        lines.append(f"{prefix}{speaker}: {text}")

    full = "\n".join(lines)
    if len(full) <= _TRANSCRIPT_CHAR_BUDGET:
        return full

    kept: list[str] = []
    total = 0
    for line in reversed(lines):
        total += len(line) + 1
        if total > _TRANSCRIPT_CHAR_BUDGET:
            break
        kept.append(line)
    kept.reverse()
    return (
        "[earlier transcript truncated - showing the most recent portion]\n"
        + "\n".join(kept)
    )


def _has_non_interviewer_speech(entries: list[dict], interviewer_names: set[str]) -> bool:
    """True if at least one non-empty transcript line is attributed to
    someone other than the given interviewer label set (case-insensitive,
    stripped). False - conservatively - for empty/missing speakers; only an
    explicit non-interviewer label counts as candidate evidence.

    There's no real speaker diarization anywhere in this system - the
    frontend stamps whichever of two hardcoded audio channels a chunk
    arrived on, and the candidate channel silently never connects when
    there's no separate audio source (solo testing, in-person interviews
    sharing one mic, or getDisplayMedia falling back to video-only on
    macOS). When that happens every line - interviewer's and candidate's -
    ends up labeled with the interviewer's own name. This is used to detect
    that failure mode so the report doesn't hallucinate a candidate
    evaluation from text nobody but the interviewer said.
    """
    for e in entries or []:
        text = (e.get("text") or "").strip()
        if not text:
            continue
        speaker = (e.get("speaker") or "").strip()
        if speaker and speaker.casefold() not in interviewer_names:
            return True
    return False


def _clamp_score(value) -> float:
    try:
        return round(min(10.0, max(0.0, float(value))), 1)
    except (TypeError, ValueError):
        return 0.0


def _cv_analysis_to_text(doc: dict) -> str:
    """Condense a cv_analyses doc into a compact plain-text block for the
    report prompt: fit scores + bullet titles + suggested questions. The
    detail sentences are dropped - titles carry the hypotheses, and the
    transcript is the evidence."""
    lines: list[str] = []
    fit = doc.get("position_fit") or {}
    if fit:
        lines.append(
            "CV fit scores (0-10): "
            f"relevant experience {fit.get('relevant_experience', '?')}, "
            f"technical {fit.get('technical_fit', '?')}, "
            f"soft skills {fit.get('soft_skills', '?')}"
        )
    for label, key in (
        ("Strengths on paper", "key_strengths"),
        ("Flagged concerns", "improvements"),
        ("Inconsistencies", "inconsistencies"),
    ):
        titles = [b.get("title") for b in (doc.get(key) or []) if b.get("title")]
        if titles:
            lines.append(f"{label}: " + "; ".join(titles))
    questions = [
        q.get("question") for q in (doc.get("interview_questions") or []) if q.get("question")
    ]
    if questions:
        lines.append("Suggested questions to probe: " + " | ".join(questions))
    return "\n".join(lines)


async def _get_interviewer_name(db, intv_id: str) -> str | None:
    """Look up the interviewer's display name via interview_users -> users.

    Mirrors the frontend's own fallback (`user?.full_name || "Interviewer"`
    in InterviewPage.jsx) so the two agree on identity. Only considers the
    first linked interviewer - panel interviews with multiple interviewers
    using distinct transcript labels aren't handled here.
    """
    intv_user = await db.interview_users.find_one({"intv_id": intv_id})
    if intv_user and ObjectId.is_valid(intv_user.get("user_id") or ""):
        u = await db.users.find_one({"_id": ObjectId(intv_user["user_id"])})
        if u:
            return u.get("full_name") or u.get("username")
    return None


@router.post(
    "/{intv_id}/complete",
    response_model=InterviewCompleteOut,
    summary="Finish an interview: persist the transcript, generate both LLM reports, and score the candidate.",
)
async def complete_interview(
    intv_id: str,
    payload: InterviewCompleteRequest,
    _user: dict = Depends(require_role("interviewer")),
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> InterviewCompleteOut:
    """Called when the interviewer clicks Complete.

    1. Persists the final transcript + duration and marks the interview
       "completed".
    2. Runs one LLM pass over the transcript producing the candidate
       report (summary / strengths / improvements + three 0-10 ratings)
       and the interviewer coaching report (no ratings).
    3. Mirrors the ratings onto the job_candidates link (which also flips
       the application status to EVALUATED, same as the manual scores
       endpoint).

    Idempotent: re-calling on an interview that already has both reports
    returns the stored ones without another LLM run.
    """
    db = get_db()
    # Tenant guard: an interviewer can only complete interviews on their own
    # company's jobs - otherwise a fabricated transcript could write scores
    # onto another company's candidate.
    interview = await _get_interview_in_company(db, intv_id, comp_id)

    link = await db.job_candidates.find_one(
        {"cand_id": interview.get("cand_id"), "job_id": interview.get("job_id")}
    )

    # Re-entry: reports already generated -> serve them, no second LLM run.
    if interview.get("intv_candidate_report") and interview.get("intv_interviewer_report"):
        stored = [
            (link or {}).get("communication_score"),
            (link or {}).get("skill_score"),
            (link or {}).get("problem_solving_score"),
        ]
        return InterviewCompleteOut(
            intv_id=intv_id,
            intv_status="completed",
            # Only echo scores that actually exist on the link - a missing
            # link must not fabricate a 0.0/0.0/0.0 result.
            scores=(
                InterviewScores(
                    communication=_clamp_score(stored[0]),
                    skill=_clamp_score(stored[1]),
                    problem_solving=_clamp_score(stored[2]),
                )
                if all(v is not None for v in stored)
                else None
            ),
            candidate_report=InterviewFeedback(**interview["intv_candidate_report"]),
            interviewer_report=InterviewFeedback(**interview["intv_interviewer_report"]),
            cached=True,
        )

    # Prefer the transcript sent with the click (freshest); fall back to
    # what the periodic autosave stored.
    entries = (
        [e.model_dump() for e in payload.transcript]
        if payload.transcript is not None
        else (interview.get("intv_transcript") or [])
    )
    transcript_text = _transcript_to_text(entries)
    if not transcript_text:
        raise HTTPException(
            status_code=400,
            detail="No transcript recorded - nothing to analyse.",
        )

    # Context for the LLM: role title + JD (scoring yardstick), candidate
    # name, the pre-interview CV analysis (hypotheses to verify), and the
    # interview duration (confidence calibration).
    job = None
    candidate = None
    if ObjectId.is_valid(interview.get("job_id") or ""):
        job = await db.jobs.find_one({"_id": ObjectId(interview["job_id"])})
    if ObjectId.is_valid(interview.get("cand_id") or ""):
        candidate = await db.candidates.find_one({"_id": ObjectId(interview["cand_id"])})

    cv_context = None
    if link:
        analysis = await db.cv_analyses.find_one({"jobcand_id": str(link["_id"])})
        # Only a finished analysis is useful context; processing/failed docs
        # carry empty sections. Docs from before the status field are
        # complete by construction.
        if analysis and (analysis.get("status") or "completed") == "completed":
            cv_context = _cv_analysis_to_text(analysis) or None

    # Diarization guard: detect transcripts where every line is attributed
    # to the interviewer (the candidate's audio channel never connected -
    # see _has_non_interviewer_speech). When that's the case the candidate
    # report below is overridden with an honest "no data" result instead of
    # letting the LLM infer candidate behaviour from the interviewer's own
    # speech.
    interviewer_name = await _get_interviewer_name(db, intv_id)
    interviewer_label = interviewer_name or "Interviewer"
    interviewer_match_names = {"interviewer", interviewer_label.strip().casefold()}
    candidate_label = (candidate or {}).get("cand_full_name") or "Candidate"
    candidate_speech_detected = _has_non_interviewer_speech(entries, interviewer_match_names)

    # Concurrency guard: atomically claim generation so a double-click (or
    # an impatient retry) can't fire two parallel LLM runs whose results
    # then race each other into the database. A claim older than 5 minutes
    # is considered stale (server died mid-run) and can be re-taken.
    claim_now = datetime.now(timezone.utc)
    claim = await db.interviews.find_one_and_update(
        {
            "_id": interview["_id"],
            "$or": [
                {"intv_report_state": {"$ne": "generating"}},
                {"intv_report_claimed_at": {"$lt": claim_now - timedelta(minutes=5)}},
            ],
        },
        {"$set": {"intv_report_state": "generating", "intv_report_claimed_at": claim_now}},
    )
    if claim is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Report generation is already in progress - try again in a moment.",
        )

    try:
        result = await generate_interview_reports(
            transcript_text,
            job_title=(job or {}).get("title"),
            job_description=(job or {}).get("description"),
            candidate_name=(candidate or {}).get("cand_full_name"),
            cv_analysis_context=cv_context,
            duration_seconds=payload.duration_seconds or interview.get("intv_duration_seconds"),
            interviewer_speaker_label=interviewer_label,
            candidate_speaker_label=candidate_label,
            candidate_speech_detected=candidate_speech_detected,
        )

        # Validate BEFORE persisting anything. A refusal / empty JSON / a
        # mis-typed section (e.g. "strengths": "good") must fail the request
        # (releasing the claim so retry works) - the old code stored blank
        # reports + 0.0 scores, and the truthy-empty reports then satisfied
        # the cached check forever with no retry path.
        raw_scores = result.get("scores")
        if not isinstance(raw_scores, dict) or not all(
            key in raw_scores for key in ("communication", "skill", "problem_solving")
        ):
            raise ValueError("model response is missing the scores section")

        candidate_report = InterviewFeedback(**(result.get("candidate_report") or {}))
        interviewer_report = InterviewFeedback(**(result.get("interviewer_report") or {}))

        if not (
            interviewer_report.summary
            or interviewer_report.strengths.items
            or interviewer_report.improvements.items
        ):
            raise ValueError("model returned an empty interviewer report")
        # The candidate report only needs content when there was candidate
        # speech - otherwise the honest no-data override below replaces it.
        if candidate_speech_detected and not (
            candidate_report.summary
            or candidate_report.strengths.items
            or candidate_report.improvements.items
        ):
            raise ValueError("model returned an empty candidate report")
    except Exception as e:
        # Release the claim so the interviewer can retry immediately.
        await db.interviews.update_one(
            {"_id": interview["_id"]},
            {"$unset": {"intv_report_state": "", "intv_report_claimed_at": ""}},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Report generation failed: {e}",
        ) from e

    scores = InterviewScores(
        communication=_clamp_score(raw_scores.get("communication")),
        skill=_clamp_score(raw_scores.get("skill")),
        problem_solving=_clamp_score(raw_scores.get("problem_solving")),
    )

    # Hard override: no LLM-authored candidate_report/scores without
    # evidence. Runs unconditionally on the parsed result - it's an
    # authoritative replacement, not a fallback for malformed output, so it
    # can't be defeated by the model ignoring the prompt's instructions.
    if not candidate_speech_detected:
        scores = InterviewScores(communication=0.0, skill=0.0, problem_solving=0.0)
        candidate_report = InterviewFeedback(
            summary=(
                "No distinguishable candidate speech was found in this transcript. "
                f"Every line is attributed to the interviewer ({interviewer_label}), "
                "which happens when the candidate's audio channel never connects "
                "(solo testing, in-person interviews, or a screen-share that only "
                "captured video). This report cannot evaluate the candidate and "
                "was not generated by AI."
            ),
            strengths=InterviewFeedbackSection(items=[], justification=None),
            improvements=InterviewFeedbackSection(items=[], justification=None),
        )

    now = datetime.now(timezone.utc)
    interview_updates: dict = {
        "intv_status": "completed",
        "intv_candidate_report": candidate_report.model_dump(),
        "intv_interviewer_report": interviewer_report.model_dump(),
        "intv_updated_at": now,
    }
    if payload.transcript is not None:
        interview_updates["intv_transcript"] = entries
    if payload.duration_seconds is not None:
        interview_updates["intv_duration_seconds"] = payload.duration_seconds
    await db.interviews.update_one(
        {"_id": ObjectId(intv_id)},
        {
            "$set": interview_updates,
            # Success: release the generation claim.
            "$unset": {"intv_report_state": "", "intv_report_claimed_at": ""},
        },
    )

    # Mirror the ratings onto the application link. Same side-effect as the
    # manual PATCH /job-candidates/{id}/scores: recording scores flips the
    # application to EVALUATED. Skipped when no candidate speech was found -
    # writing 0.0 scores would be indistinguishable from a genuinely bad
    # evaluation, and flipping to EVALUATED would hide this candidate from
    # any "needs evaluation" queue when nothing was actually evaluated.
    if link and candidate_speech_detected:
        await db.job_candidates.update_one(
            {"_id": link["_id"]},
            {
                "$set": {
                    "communication_score": scores.communication,
                    "skill_score": scores.skill,
                    "problem_solving_score": scores.problem_solving,
                    "status": "EVALUATED",
                    "updated_at": now,
                }
            },
        )

    return InterviewCompleteOut(
        intv_id=intv_id,
        intv_status="completed",
        scores=scores,
        candidate_report=candidate_report,
        interviewer_report=interviewer_report,
        cached=False,
    )


async def _report_pdf_response(intv_id: str, kind: str, user: dict) -> Response:
    """Shared implementation for the two report-download endpoints.

    Auth: any logged-in user of the interview's company (walked via the
    job's comp_id). 404 (not 403) outside the tenant so ids can't be probed.
    """
    from services.report_pdf import build_interview_report_pdf

    if not ObjectId.is_valid(intv_id):
        raise HTTPException(status_code=400, detail="Invalid interview id.")

    db = get_db()
    interview = await db.interviews.find_one({"_id": ObjectId(intv_id)})
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found.")

    job = None
    if ObjectId.is_valid(interview.get("job_id") or ""):
        job = await db.jobs.find_one({"_id": ObjectId(interview["job_id"])})
    if not job or str(job.get("comp_id") or "") != str(user.get("comp_id") or ""):
        raise HTTPException(status_code=404, detail="Interview not found.")

    report = interview.get(f"intv_{kind}_report")
    if not report:
        raise HTTPException(
            status_code=404,
            detail=f"No {kind} report has been generated for this interview yet.",
        )

    candidate = None
    if ObjectId.is_valid(interview.get("cand_id") or ""):
        candidate = await db.candidates.find_one({"_id": ObjectId(interview["cand_id"])})

    link = await db.job_candidates.find_one(
        {"cand_id": interview.get("cand_id"), "job_id": interview.get("job_id")}
    )
    scores = (
        {
            "communication": (link or {}).get("communication_score"),
            "skill": (link or {}).get("skill_score"),
            "problem_solving": (link or {}).get("problem_solving_score"),
        }
        if kind == "candidate"
        else None
    )

    interviewer_name = await _get_interviewer_name(db, intv_id)

    pdf_bytes = build_interview_report_pdf(
        kind=kind,
        report=report,
        candidate_name=(candidate or {}).get("cand_full_name"),
        job_title=job.get("title"),
        interviewer_name=interviewer_name,
        interview_datetime=interview.get("intv_date_time"),
        duration_seconds=interview.get("intv_duration_seconds"),
        status=interview.get("intv_status"),
        scores=scores,
        transcript=interview.get("intv_transcript") or [],
    )

    safe_name = "".join(
        c if c.isalnum() or c in "-_" else "-"
        for c in ((candidate or {}).get("cand_full_name") or "interview")
    ).strip("-").lower() or "interview"
    # Stamp with the interview's datetime (fallback: today) so a folder of
    # downloads sorts naturally and repeat interviews don't overwrite.
    when = interview.get("intv_date_time")
    stamp = (when or datetime.now(timezone.utc)).strftime("%Y-%m-%d-%H%M")
    filename = f"{kind}-report-{safe_name}-{stamp}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{intv_id}/candidate-report",
    summary="Download the candidate report as a PDF.",
)
async def download_candidate_report(
    intv_id: str,
    user: dict = Depends(get_current_user),
) -> Response:
    return await _report_pdf_response(intv_id, "candidate", user)


@router.get(
    "/{intv_id}/interviewer-report",
    summary="Download the interviewer report as a PDF.",
)
async def download_interviewer_report(
    intv_id: str,
    user: dict = Depends(get_current_user),
) -> Response:
    return await _report_pdf_response(intv_id, "interviewer", user)


@router.patch(
    "/{intv_id}",
    response_model=InterviewOut,
    summary="Update mutable interview fields.",
)
async def update_interview(
    intv_id: str,
    payload: InterviewUpdate,
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> InterviewOut:
    db = get_db()
    existing_interview = await _get_interview_in_company(db, intv_id, comp_id)

    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        return interview_helper(existing_interview)

    update_data["intv_updated_at"] = datetime.now(timezone.utc)

    await db.interviews.update_one(
        {"_id": ObjectId(intv_id)},
        {"$set": update_data},
    )

    updated_interview = await db.interviews.find_one({"_id": ObjectId(intv_id)})
    if not updated_interview:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update interview.",
        )

    return interview_helper(updated_interview)
