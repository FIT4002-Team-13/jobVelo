"""Interviewer performance statistics (US35).

Total interviews conducted and average candidate score for the caller's
own "My Profile" page, plus a score trend chart (with a selectable range
and a paging offset for browsing history) and a PDF export of the summary
numbers.

Endpoints:
  GET /api/interviewer-stats         - the stats shown on the profile card
  GET /api/interviewer-stats/report  - the same summary stats as a PDF download
"""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, Query, Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db
from dependencies import get_current_comp_id, get_current_user

router = APIRouter(prefix="/api/interviewer-stats", tags=["interviewer-stats"])

StatRange = Literal["month", "6months", "year"]
# How many periods (months, for 6months/year) one "page" of history covers.
_RANGE_SPAN_MONTHS = {"6months": 6, "year": 12}


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


def _month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    ny, nm = _add_months(year, month, 1)
    return start, datetime(ny, nm, 1, tzinfo=timezone.utc)


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


def _bucket_avg(sessions: list[dict], start: datetime, end: datetime) -> float | None:
    values = [s["score"] for s in sessions if start <= s["when"] < end]
    return round(sum(values) / len(values), 1) if values else None


def _build_score_trend(
    sessions: list[dict], now: datetime, stat_range: StatRange, offset: int
) -> tuple[list[dict], str]:
    """Buckets for the score-trend chart, plus a human label for the whole
    window (e.g. "October 2025 - March 2026") so the UI can show what
    period the paging arrows have landed on.

    `offset` pages backwards in units of one period of the selected range
    (a month for "month", 6 months for "6months", 12 months for "year") -
    offset 0 is the current period.

    Every bucket carries a short axis `label`, a human `tooltip_label`
    (always spelling out the month + year, per US35's hover requirement),
    and `avg_score` (None when nothing was scored that bucket, so the axis
    still renders and can be hovered even with no data).
    """
    if stat_range == "month":
        y, m = _add_months(now.year, now.month, -offset)
        last_day = calendar.monthrange(y, m)[1]
        points = []
        day = 1
        week_no = 1
        while day <= last_day:
            week_end_day = min(day + 6, last_day)
            start = datetime(y, m, day, tzinfo=timezone.utc)
            end = datetime(y, m, week_end_day, tzinfo=timezone.utc) + timedelta(days=1)
            points.append(
                {
                    "label": f"W{week_no}",
                    "tooltip_label": f"{calendar.month_abbr[m]} {day}-{week_end_day}, {y}",
                    "avg_score": _bucket_avg(sessions, start, end),
                }
            )
            day += 7
            week_no += 1
        return points, f"{calendar.month_name[m]} {y}"

    span = _RANGE_SPAN_MONTHS[stat_range]
    anchor_y, anchor_m = _add_months(now.year, now.month, -offset * span)
    points = []
    for i in range(span - 1, -1, -1):
        y, m = _add_months(anchor_y, anchor_m, -i)
        start, end = _month_bounds(y, m)
        is_now = offset == 0 and i == 0
        points.append(
            {
                "label": "Now" if is_now else calendar.month_abbr[m],
                "tooltip_label": f"{calendar.month_name[m]} {y}",
                "avg_score": _bucket_avg(sessions, start, end),
            }
        )
    first, last = points[0]["tooltip_label"], points[-1]["tooltip_label"]
    range_label = first if first == last else f"{first} - {last}"
    return points, range_label


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
    db: AsyncIOMotorDatabase,
    user: dict,
    comp_id: ObjectId,
    *,
    stat_range: StatRange = "6months",
    offset: int = 0,
) -> dict:
    """The numbers shown on the profile stats card, plus its score trend.

    Scope matches dashboard.py / interviewer_feedback.py: interviews the
    caller is assigned to (via interview_users) whose job belongs to the
    caller's company, restricted to completed ones (`evaluated`/`completed`).
    """
    user_id_str = str(user["_id"])
    assigned_ids, company_job_ids = (
        await _assigned_interview_ids(db, user_id_str),
        await _company_job_ids(db, comp_id),
    )

    now = datetime.now(timezone.utc)
    interviews: list[dict] = []
    sessions: list[dict] = []  # {when, score}

    if assigned_ids and company_job_ids:
        interviews = (
            await db.interviews.find(
                {
                    "_id": {"$in": assigned_ids},
                    "job_id": {"$in": company_job_ids},
                    "intv_status": {"$in": ["evaluated", "completed"]},
                }
            )
            .sort("intv_date_time", 1)
            .to_list(length=2000)
        )

    if interviews:
        # Resolve each interview's job_candidates link (same lookup as
        # interview.py's _report_pdf_response) to get its rating scores.
        cand_ids = [iv.get("cand_id") for iv in interviews if iv.get("cand_id")]
        links = await db.job_candidates.find({"cand_id": {"$in": cand_ids}}).to_list(
            length=2000
        )
        link_by_pair = {(lnk.get("cand_id"), lnk.get("job_id")): lnk for lnk in links}

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

    score_trend, score_trend_range_label = _build_score_trend(scored, now, stat_range, offset)

    return {
        "total_interviews": total_interviews,
        "total_interviews_delta_pct": total_interviews_delta_pct,
        "average_candidate_score": average_candidate_score,
        "average_candidate_score_delta_pct": average_candidate_score_delta_pct,
        "score_trend": score_trend,
        "score_trend_range_label": score_trend_range_label,
    }


@router.get("")
async def get_interviewer_stats(
    range: StatRange = Query("6months", alias="range"),
    offset: int = Query(0, ge=0, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    return await _compute_interviewer_stats(db, user, comp_id, stat_range=range, offset=offset)


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
