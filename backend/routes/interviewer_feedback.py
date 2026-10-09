"""Interviewer performance feedback (US34).

Append-only snapshots of AI-synthesised strengths / improvements about how the
caller conducts interviews. The profile reads the latest snapshot; "Regenerate"
writes a new one (older snapshots stay as the interviewer's performance
history). Each item carries the user's acknowledgement + reflection note, edited
in place so they persist with that snapshot.

Endpoints:
  GET   /api/interviewer-feedback                         - latest snapshot
  POST  /api/interviewer-feedback/regenerate              - build a new snapshot
  PATCH /api/interviewer-feedback/{id}/items/{item_id}    - acknowledge / note
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db
from dependencies import get_current_comp_id, get_current_user
from models.interviewer_feedback import FeedbackItemUpdate
from services.gemini_service import generate_interviewer_feedback

router = APIRouter(prefix="/api/interviewer-feedback", tags=["interviewer-feedback"])

# Synthesise from the most recent N completed interviews so the token cost is
# bounded no matter how prolific the interviewer is.
_MAX_SESSIONS = 8
# Per-session transcript excerpt cap (chars) - keeps each block small.
_TRANSCRIPT_CAP = 2500
# Max items kept per section after a merge, so the list can't grow forever.
# Engaged (noted/acknowledged) items are always kept first, so notes are never
# dropped to honour this cap.
_SECTION_CAP = 8

_EMPTY = {"feedback_id": None, "generated_at": None, "strengths": [], "improvements": []}


def _engaged_items(items: list | None) -> list[dict]:
    """Items the user has interacted with (acknowledged or noted) - the ones
    whose reflections must survive a regenerate. Returned verbatim so their id,
    note and acknowledgement carry into the next snapshot."""
    return [it for it in (items or []) if it.get("acknowledged") or it.get("note")]


def _title_words(text: str | None) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))


def _is_duplicate(category: str, title: str, existing: list[dict]) -> bool:
    """True when a freshly generated point restates one already in `existing`
    (same category + strongly overlapping title). Cheap Jaccard on title words -
    good enough to avoid obvious repeats without embeddings."""
    words = _title_words(title)
    if not words:
        return False
    for item in existing:
        if item.get("category") != category:
            continue
        other = _title_words(item.get("title"))
        if other and len(words & other) / len(words | other) >= 0.5:
            return True
    return False


def _merge_points(kept: list[dict], fresh_points) -> list[dict]:
    """Engaged items first (notes intact), then new non-duplicate points, up to
    the per-section cap."""
    merged = list(kept)
    for p in fresh_points:
        if len(merged) >= _SECTION_CAP:
            break
        if _is_duplicate(p.category, p.title, merged):
            continue
        merged.append(
            {
                "id": uuid.uuid4().hex,
                "category": p.category,
                "title": p.title,
                "detail": p.detail,
                "examples": list(p.examples or []),
                "acknowledged": False,
                "note": None,
            }
        )
    return merged


def _serialise(doc: dict) -> dict:
    return {
        "feedback_id": str(doc["_id"]),
        "generated_at": doc.get("generated_at"),
        "strengths": doc.get("strengths", []),
        "improvements": doc.get("improvements", []),
    }


def _build_session_block(iv: dict) -> str:
    """One evidence block per interview: date, duration, bias flags, transcript
    excerpt. Deterministic + compact so the LLM only phrases the narrative."""
    parts: list[str] = []

    when = iv.get("intv_date_time") or iv.get("intv_updated_at")
    if when is not None:
        parts.append(f"Session date: {when.date().isoformat()}")

    dur = iv.get("intv_duration_seconds")
    if isinstance(dur, (int, float)) and dur > 0:
        parts.append(f"Duration: {round(dur / 60)} min")

    bias = iv.get("intv_bias_incidents") or []
    if bias:
        flags = "; ".join(
            f"[{b.get('category') or 'flag'}] \"{(b.get('quote') or '')[:160]}\""
            for b in bias[:5]
        )
        parts.append(f"Bias flags ({len(bias)}): {flags}")
    else:
        parts.append("Bias flags: none")

    transcript = iv.get("intv_transcript") or []
    lines = []
    for e in transcript:
        text = (e.get("text") or "").strip()
        if text:
            lines.append(f"{e.get('speaker') or '?'}: {text}")
    joined = "\n".join(lines)
    if len(joined) > _TRANSCRIPT_CAP:
        joined = joined[:_TRANSCRIPT_CAP] + " …[truncated]"
    parts.append("Transcript:\n" + (joined or "(no transcript recorded)"))

    return "\n".join(parts)


async def _recent_completed_interviews(
    db: AsyncIOMotorDatabase, user: dict, comp_id: ObjectId
) -> list[dict]:
    """The caller's most recent completed interviews, newest first, capped."""
    user_id_str = str(user["_id"])

    assigned: list[ObjectId] = []
    async for link in db.interview_users.find({"user_id": user_id_str}, {"intv_id": 1}):
        intv_id = link.get("intv_id")
        if intv_id and ObjectId.is_valid(intv_id):
            assigned.append(ObjectId(intv_id))

    company_job_ids = [
        str(j["_id"]) async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})
    ]
    if not assigned or not company_job_ids:
        return []

    return (
        await db.interviews.find(
            {
                "_id": {"$in": assigned},
                "job_id": {"$in": company_job_ids},
                "intv_status": {"$in": ["evaluated", "completed"]},
            }
        )
        .sort("intv_updated_at", -1)
        .to_list(length=_MAX_SESSIONS)
    )


@router.get("")
async def get_latest_feedback(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Return the caller's latest feedback snapshot (or an empty shell)."""
    doc = await db.interviewer_feedback.find_one(
        {"user_id": str(user["_id"])}, sort=[("generated_at", -1)]
    )
    return _serialise(doc) if doc else _EMPTY


@router.post("/regenerate")
async def regenerate_feedback(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Build a new feedback snapshot from the caller's recent interviews."""
    interviews = await _recent_completed_interviews(db, user, comp_id)
    if not interviews:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No completed interviews to generate feedback from yet.",
        )

    sessions = [_build_session_block(iv) for iv in interviews]
    interviewer_name = (
        user.get("full_name") or user.get("username") or user.get("email") or "you"
    )

    try:
        generated = await generate_interviewer_feedback(interviewer_name, sessions)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Feedback generation failed: {e}"
        ) from e

    # Carry forward the items the user has engaged with (their notes +
    # acknowledgements) from the latest snapshot; refresh the rest and append
    # only genuinely new points.
    prev = await db.interviewer_feedback.find_one(
        {"user_id": str(user["_id"])}, sort=[("generated_at", -1)]
    )
    kept_strengths = _engaged_items((prev or {}).get("strengths"))
    kept_improvements = _engaged_items((prev or {}).get("improvements"))

    now = datetime.now(timezone.utc)
    doc = {
        "user_id": str(user["_id"]),
        "comp_id": str(comp_id),
        "generated_at": now,
        "strengths": _merge_points(kept_strengths, generated.strengths),
        "improvements": _merge_points(kept_improvements, generated.improvements),
    }
    result = await db.interviewer_feedback.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialise(doc)


@router.patch("/{feedback_id}/items/{item_id}")
async def update_feedback_item(
    feedback_id: str,
    item_id: str,
    payload: FeedbackItemUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Acknowledge an item and/or save a reflection note, in place on the
    snapshot it belongs to (so it stays with the interviewer's history)."""
    if not ObjectId.is_valid(feedback_id):
        raise HTTPException(status_code=400, detail="Invalid feedback id")

    doc = await db.interviewer_feedback.find_one(
        {"_id": ObjectId(feedback_id), "user_id": str(user["_id"])}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Feedback not found")

    now = datetime.now(timezone.utc)
    found = False
    for key in ("strengths", "improvements"):
        for item in doc.get(key, []):
            if item.get("id") == item_id:
                if payload.acknowledged is not None:
                    item["acknowledged"] = payload.acknowledged
                if payload.note is not None:
                    item["note"] = payload.note.strip() or None
                    item["note_updated_at"] = now
                found = True
    if not found:
        raise HTTPException(status_code=404, detail="Feedback item not found")

    await db.interviewer_feedback.update_one(
        {"_id": doc["_id"]},
        {
            "$set": {
                "strengths": doc["strengths"],
                "improvements": doc["improvements"],
                "updated_at": now,
            }
        },
    )
    return _serialise(doc)
