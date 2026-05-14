"""Dashboard summary endpoint.

Computes the today / completed / upcoming counters from the
job_candidates collection (where every interview-scheduling field
actually lives). There's no mock data anymore - when there are no
links, this returns zeros and the frontend shows the empty state.

The dashboard's candidate list itself is fetched from the real
/api/candidates endpoint (cand.py) - this file only owns the summary.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Return the three counters shown on the dashboard summary cards.

    Definitions (matches the labels the user sees on the cards):
      - today:     SCHEDULED links whose scheduled_at falls on today's date
      - completed: links whose status is EVALUATED (scoring done)
      - upcoming:  SCHEDULED links whose scheduled_at is strictly after today

    scheduled_at is stored as an ISO-ish string ("YYYY-MM-DDTHH:MM") because
    that's what the <input type="datetime-local"> on the AddCandidate modal
    emits. ISO strings sort lexicographically, so we can use a date-prefix
    regex for "today" and a string `$gt` for "upcoming" without parsing.

    Today is taken in UTC for now - swap to the company's timezone once
    that becomes a stored field on the company document.
    """
    today_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Anything strictly later than the last second of today (lexicographic
    # compare on ISO-prefixed strings works because of how the format sorts).
    end_of_today = f"{today_prefix}T23:59:59"

    today_count, completed_count, upcoming_count = await _gather(
        db,
        today_query={
            "status":       "SCHEDULED",
            "scheduled_at": {"$regex": f"^{today_prefix}"},
        },
        completed_query={"status": "EVALUATED"},
        upcoming_query={
            "status":       "SCHEDULED",
            "scheduled_at": {"$gt": end_of_today},
        },
    )

    return {
        "today_interviews":     today_count,
        "completed_interviews": completed_count,
        "upcoming_interviews":  upcoming_count,
    }


async def _gather(db, *, today_query, completed_query, upcoming_query) -> tuple[int, int, int]:
    """Run the three count queries. Pulled out so the route body stays
    readable - all three hit `job_candidates`, all three are independent."""
    today_count     = await db.job_candidates.count_documents(today_query)
    completed_count = await db.job_candidates.count_documents(completed_query)
    upcoming_count  = await db.job_candidates.count_documents(upcoming_query)
    return today_count, completed_count, upcoming_count
