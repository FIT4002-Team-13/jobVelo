"""Interviewer performance statistics (US35).

Total interviews conducted and average candidate score for the caller's
own "My Profile" page, plus a 6-month score trend and a PDF export of the
same numbers.

Endpoints:
  GET /api/interviewer-stats         - the stats shown on the profile card
  GET /api/interviewer-stats/report  - the same stats as a PDF download
"""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db
from dependencies import get_current_comp_id, get_current_user

router = APIRouter(prefix="/api/interviewer-stats", tags=["interviewer-stats"])

# Trailing window (including the current month) shown on the score-trend chart.
_TREND_MONTHS = 6


def _session_score(ratings: dict | None) -> float | None:
    """Average of the three candidate ratings for one interview - same
    averaging used by jobs_candidates.py's list_candidates_for_job and
    interview.py's _report_pdf_response."""
    ratings = ratings or {}
    scores = [
        (ratings.get("communication") or {}).get("score"),
        (ratings.get("technical_skills") or {}).get("score"),
        (ratings.get("problem_solving") or {}).get("score"),
    ]
    scores = [s for s in scores if isinstance(s, (int, float))]
    return sum(scores) / len(scores) if scores else None


def _month_key(dt: datetime) -> tuple[int, int]:
    return (dt.year, dt.month)


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = (year * 12 + (month - 1)) + delta
    return idx // 12, idx % 12 + 1


def _pct_change(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def _as_utc(dt: datetime) -> datetime:
    """Mongo/motor here returns naive datetimes (no tz_aware client option),
    but every stored value is UTC - so a naive read needs a UTC tzinfo before
    it can be compared against an aware `datetime.now(timezone.utc)`. Same
    fix as cv_analysis.py's `_status_of`."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


async def _assigned_interview_ids(db: AsyncIOMotorDatabase, user_id_str: str) -> list[ObjectId]:
    ids: list[ObjectId] = []
    async for link in db.interview_users.find({"user_id": user_id_str}, {"intv_id": 1}):
        intv_id = link.get("intv_id")
        if intv_id and ObjectId.is_valid(intv_id):
            ids.append(ObjectId(intv_id))
    return ids


async def _company_job_ids(db: AsyncIOMotorDatabase, comp_id: ObjectId) -> list[str]:
    return [str(j["_id"]) async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})]


async def _compute_interviewer_stats(
    db: AsyncIOMotorDatabase, user: dict, comp_id: ObjectId
) -> dict:
    """The numbers shown on the profile stats card, plus its 6-month trend.

    Scope matches dashboard.py / interviewer_feedback.py: interviews the
    caller is assigned to (via interview_users) whose job belongs to the
    caller's company, restricted to completed ones (`evaluated`/`completed`).
    """
    user_id_str = str(user["_id"])
    assigned_ids, company_job_ids = (
        await _assigned_interview_ids(db, user_id_str),
        await _company_job_ids(db, comp_id),
    )

    empty = {
        "total_interviews": 0,
        "total_interviews_delta_pct": None,
        "average_candidate_score": None,
        "average_candidate_score_delta_pct": None,
        "score_trend": [],
    }
    if not assigned_ids or not company_job_ids:
        return empty

    interviews = await db.interviews.find(
        {
            "_id": {"$in": assigned_ids},
            "job_id": {"$in": company_job_ids},
            "intv_status": {"$in": ["evaluated", "completed"]},
        }
    ).sort("intv_date_time", 1).to_list(length=2000)

    if not interviews:
        return empty

    # Resolve each interview's job_candidates link (same lookup as
    # interview.py's _report_pdf_response) to get its rating scores.
    cand_job_pairs = [
        (iv.get("cand_id"), iv.get("job_id")) for iv in interviews if iv.get("cand_id")
    ]
    links = await db.job_candidates.find(
        {"cand_id": {"$in": [p[0] for p in cand_job_pairs]}}
    ).to_list(length=2000)
    link_by_pair = {(lnk.get("cand_id"), lnk.get("job_id")): lnk for lnk in links}

    sessions: list[dict] = []  # {when, score}
    for iv in interviews:
        when = iv.get("intv_date_time") or iv.get("intv_updated_at")
        if when is None:
            continue
        when = _as_utc(when)
        link = link_by_pair.get((iv.get("cand_id"), iv.get("job_id")))
        score = _session_score((link or {}).get("ratings"))
        sessions.append({"when": when, "score": score})

    total_interviews = len(interviews)
    scored = [s for s in sessions if s["score"] is not None]

    average_candidate_score = (
        round(sum(s["score"] for s in scored) / len(scored), 1) if scored else None
    )

    # --- Total interviews delta: now vs. 7 days ago, over the same completed set.
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    total_7d_ago = sum(
        1
        for iv in interviews
        if _as_utc(iv.get("intv_date_time") or iv.get("intv_updated_at") or now) <= week_ago
    )
    total_interviews_delta_pct = _pct_change(total_interviews, total_7d_ago)

    # --- Average score delta: this calendar month vs. last calendar month.
    this_month = _month_key(now)
    last_month = _add_months(now.year, now.month, -1)
    this_month_scores = [s["score"] for s in scored if _month_key(s["when"]) == this_month]
    last_month_scores = [s["score"] for s in scored if _month_key(s["when"]) == last_month]
    average_candidate_score_delta_pct = None
    if this_month_scores and last_month_scores:
        average_candidate_score_delta_pct = _pct_change(
            sum(this_month_scores) / len(this_month_scores),
            sum(last_month_scores) / len(last_month_scores),
        )

    # --- 6-month score trend, oldest -> newest, current month labeled "Now".
    score_trend = []
    for i in range(_TREND_MONTHS - 1, -1, -1):
        y, m = _add_months(now.year, now.month, -i)
        month_scores = [s["score"] for s in scored if _month_key(s["when"]) == (y, m)]
        label = "Now" if i == 0 else calendar.month_abbr[m]
        score_trend.append(
            {
                "label": label,
                "avg_score": round(sum(month_scores) / len(month_scores), 1)
                if month_scores
                else None,
            }
        )

    return {
        "total_interviews": total_interviews,
        "total_interviews_delta_pct": total_interviews_delta_pct,
        "average_candidate_score": average_candidate_score,
        "average_candidate_score_delta_pct": average_candidate_score_delta_pct,
        "score_trend": score_trend,
    }


@router.get("")
async def get_interviewer_stats(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    return await _compute_interviewer_stats(db, user, comp_id)


@router.get("/report")
async def get_interviewer_stats_report(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
    comp_id: ObjectId = Depends(get_current_comp_id),
) -> Response:
    from services.report_pdf import build_interviewer_stats_pdf

    stats = await _compute_interviewer_stats(db, user, comp_id)
    interviewer_name = (
        user.get("full_name") or user.get("username") or user.get("email") or "Interviewer"
    )
    pdf_bytes = build_interviewer_stats_pdf(interviewer_name=interviewer_name, stats=stats)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    filename = f"interview-stats-{stamp}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
