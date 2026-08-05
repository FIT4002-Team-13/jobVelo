"""Dashboard summary endpoint.

Computes the today / completed / upcoming counters from the
`interviews` collection. That's where the live status + datetime fields
actually live - `job_candidates.status` was a legacy field that's
effectively dead (set to None on every row) and `job_candidates.scheduled_at`
isn't populated in the new flow at all.

The dashboard's candidate list itself is fetched from the real
/api/candidates endpoint (cand.py) - this file only owns the summary.
"""

from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db
from dependencies import get_current_comp_id, get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(
    db: AsyncIOMotorDatabase = Depends(get_db),
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
    user_id_str = str(user["_id"])

    # 1. Interviews this user is assigned to (via interview_users links).
    assigned_intv_ids: list[ObjectId] = []
    async for link in db.interview_users.find(
        {"user_id": user_id_str}, {"intv_id": 1}
    ):
        intv_id = link.get("intv_id")
        if intv_id and ObjectId.is_valid(intv_id):
            assigned_intv_ids.append(ObjectId(intv_id))

    # 2. Company's job ids (interviews don't carry comp_id directly).
    company_job_ids = [
        str(j["_id"])
        async for j in db.jobs.find({"comp_id": comp_id}, {"_id": 1})
    ]

    # Short-circuit when either set is empty - nothing the user can see.
    if not assigned_intv_ids or not company_job_ids:
        return {
            "today_interviews":     0,
            "completed_interviews": 0,
            "upcoming_interviews":  0,
        }

    # Day window in UTC: [today 00:00:00, tomorrow 00:00:00)
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    tomorrow_start = today_start + timedelta(days=1)

    base_scope = {
        "_id":    {"$in": assigned_intv_ids},
        "job_id": {"$in": company_job_ids},
    }

    today_count, completed_count, upcoming_count = await _gather(
        db,
        today_query={
            **base_scope,
            "intv_date_time": {"$gte": today_start, "$lt": tomorrow_start},
            # Count anything that's still on the board for today, not just
            # ones in "scheduled" state - an in_progress interview is also
            # part of today's load.
            "intv_status":    {"$in": ["scheduled", "in_progress"]},
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
            "intv_status":    "scheduled",
        },
    )

    return {
        "today_interviews":     today_count,
        "completed_interviews": completed_count,
        "upcoming_interviews":  upcoming_count,
    }


async def _gather(db, *, today_query, completed_query, upcoming_query) -> tuple[int, int, int]:
    """Run the three count queries. Pulled out so the route body stays
    readable - all three hit `interviews`, all three are independent."""
    today_count     = await db.interviews.count_documents(today_query)
    completed_count = await db.interviews.count_documents(completed_query)
    upcoming_count  = await db.interviews.count_documents(upcoming_query)
    return today_count, completed_count, upcoming_count
