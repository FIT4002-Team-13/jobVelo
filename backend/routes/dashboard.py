"""Dashboard summary endpoint.

Computes the today / completed / upcoming counters from the
`interviews` collection. That's where the live status + datetime fields
actually live - `job_candidates.status` was a legacy field that's
effectively dead (set to None on every row) and `job_candidates.scheduled_at`
isn't populated in the new flow at all.

The dashboard's candidate list itself is fetched from the real
/api/candidates endpoint (cand.py) - this file only owns the summary.
"""

import asyncio
from datetime import UTC, datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db
from dependencies import get_current_comp_id, get_current_user
from routes._scoping import assigned_interview_ids, company_job_ids

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(
    user: dict = Depends(get_current_user),
    comp_id: ObjectId = Depends(get_current_comp_id),
):
    """Return the three counters shown on the dashboard summary cards.

    Definitions (matches the labels the user sees on the cards):
      - today:     interviews whose intv_date_time falls in today (UTC) AND
                   are still active (scheduled or in_progress, not done /
                   cancelled). Both "happening now" and "scheduled later
                   today" feel like "today's load" to the recruiter.
      - completed: interviews with intv_status in {evaluated, completed}.
                   Both mean the interview itself has finished; evaluated
                   means scoring was also recorded.
      - upcoming:  interviews scheduled strictly after today (UTC) with
                   intv_status == 'scheduled' - the future pipeline.

    intv_date_time is stored as a native Python datetime (UTC) so we use
    `$gte` / `$lt` range queries rather than string regex tricks.

    Tenant + personal scope: every count is restricted to interviews where
      (a) the job belongs to the caller's company, AND
      (b) the caller is the assigned interviewer (via interview_users).
    This matches what the /candidates page (ApplicationsPage) shows, so the
    summary cards and the candidates panel below them read the same set of
    interviews - they're "my pipeline" stats, not "company-wide" stats.

    Today is taken in UTC for now - swap to the company's timezone once
    that becomes a stored field on the company document.
    """
    db = get_db()
    user_id_str = str(user["_id"])

    # 1 + 2 run concurrently - neither depends on the other's result, and
    # each is its own round trip to Mongo. Sequentially awaiting them (the
    # old code did) just adds their latencies together for no reason.
    assigned_intv_ids, comp_job_ids = await asyncio.gather(
        assigned_interview_ids(db, user_id_str),
        company_job_ids(db, comp_id),
    )

    # Short-circuit when either set is empty - nothing the user can see.
    if not assigned_intv_ids or not comp_job_ids:
        return {
            "today_interviews": 0,
            "completed_interviews": 0,
            "upcoming_interviews": 0,
        }

    # Day window in UTC: [today 00:00:00, tomorrow 00:00:00)
    now = datetime.now(UTC)
    today_start = datetime(now.year, now.month, now.day, tzinfo=UTC)
    tomorrow_start = today_start + timedelta(days=1)

    base_scope = {
        "_id": {"$in": assigned_intv_ids},
        "job_id": {"$in": comp_job_ids},
    }

    today_count, completed_count, upcoming_count = await _gather(
        db,
        today_query={
            **base_scope,
            "intv_date_time": {"$gte": today_start, "$lt": tomorrow_start},
            # Count anything that's still on the board for today, not just
            # ones in "scheduled" state - an in_progress interview is also
            # part of today's load.
            "intv_status": {"$in": ["scheduled", "in_progress"]},
        },
        completed_query={
            **base_scope,
            # Both `evaluated` (scored) and `completed` (finished but not
            # yet scored) read as "completed" on the dashboard card.
            "intv_status": {"$in": ["evaluated", "completed"]},
        },
        upcoming_query={
            **base_scope,
            "intv_date_time": {"$gte": tomorrow_start},
            "intv_status": "scheduled",
        },
    )

    return {
        "today_interviews": today_count,
        "completed_interviews": completed_count,
        "upcoming_interviews": upcoming_count,
    }


async def _gather(
    db: AsyncIOMotorDatabase,
    *,
    today_query: dict,
    completed_query: dict,
    upcoming_query: dict,
) -> tuple[int, int, int]:
    """Run the three count queries concurrently - pulled out so the route
    body stays readable. All three hit `interviews` and are independent, so
    there's no reason to pay for their round trips one after another."""
    return await asyncio.gather(
        db.interviews.count_documents(today_query),
        db.interviews.count_documents(completed_query),
        db.interviews.count_documents(upcoming_query),
    )
