from __future__ import annotations

import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from dependencies import get_current_user
from models.behavioural_suggestion import (
    BehaviouralSuggestion,
    BehaviouralSuggestionsOut,
)
from services.openai_service import generate_behavioural_suggestions

router = APIRouter(prefix="/api/behavioural-suggestions", tags=["behavioural_suggestions"])
logger = logging.getLogger(__name__)

# How many recent interviews to feed the model
_MAX_SESSIONS = 5

async def _recent_completed_interview_ids(db, user_id: str) -> list[str]:

    links = (await db.interview_users.find({"user_id": user_id}, {"intv_id": 1}) .to_list(length=200))
    intv_ids = [link["intv_id"] for link in links if link.get("intv_id")]

    if not intv_ids:
        return []

    oids = [ObjectId(i) for i in intv_ids if ObjectId.is_valid(i)]

    if not oids:
        return []

    completed = (
        await db.interviews.find(
            {"_id": {"$in": oids}, "intv_status": "completed"},
            {"_id": 1, "intv_updated_at": 1, "intv_created_at": 1}
        ).to_list(length=200)
    )

    completed.sort(key=lambda d: d.get("intv_updated_at") or d.get("intv_created_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return [str(d["_id"]) for d in completed[:_MAX_SESSIONS]]


def _transcript_to_text(entries: list[dict] | None) -> str:

    if not entries:
        return ""

    lines = []
    for e in entries:
        speaker = (e.get("speaker") or "Speaker").strip()
        text = (e.get("text") or "").strip()
        if text:
            lines.append(f"{speaker}: {text}")

    return "\n".join(lines)


async def _build_session_block(db, intv_id: str) -> str | None:

    interview = await db.interviews.find_one({"_id": ObjectId(intv_id)})

    if not interview:
        return None

    transcript = _transcript_to_text(interview.get("intv_transcript"))
    if not transcript:
        return None

    when = interview.get("intv_date_time") or interview.get("intv_updated_at")
    header = f"[Interview {intv_id} on {when}]\n" if when else f"[Interview {intv_id}]\n"

    return header + transcript


def _serialise(doc: dict | None) -> BehaviouralSuggestionsOut:
    if not doc:
        return BehaviouralSuggestionsOut()

    return BehaviouralSuggestionsOut(
        suggestions=[BehaviouralSuggestion(**s) for s in (doc.get("suggestions") or [])],
        generated_at=doc.get("generated_at"),
        session_count=doc.get("session_count") or 0
    )


@router.get("", response_model=BehaviouralSuggestionsOut)
async def get_latest_suggestions(user: dict = Depends(get_current_user)) -> BehaviouralSuggestionsOut:
    db = get_db()
    doc = await db.behavioural_suggestions.find_one({"user_id": str(user["_id"])})
    return _serialise(doc)


@router.post("/regenerate", response_model=BehaviouralSuggestionsOut)
async def regenerate_suggestions(user: dict = Depends(get_current_user)) -> BehaviouralSuggestionsOut:
    db = get_db()
    user_id = str(user["_id"])

    intv_ids = await _recent_completed_interview_ids(db, user_id)
    if not intv_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No completed interviews to generate suggestions from yet.")

    sessions: list[str] = []

    for intv_id in intv_ids:
        block = await _build_session_block(db, intv_id)
        if block:
            sessions.append(block)

    if not sessions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=(
                "Your recent completed interviews don't have usable transcripts"
                " to analyse yet."
            ))

    try:
        result = await generate_behavioural_suggestions(sessions)
    except Exception as e:
        logger.exception("Behavioural suggestion generation failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not generate suggestions right now. Please try again.") from e

    suggestions = [s.model_dump() for s in result.suggestions]
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "suggestions": suggestions,
        "generated_at": now,
        "session_count": len(sessions)
    }

    await db.behavioural_suggestions.replace_one({"user_id": user_id}, doc, upsert=True)
    return _serialise(doc)
