"""Dashboard summary endpoint.

Computes the today / completed / upcoming counters from the real
candidates collection. There's no mock data anymore - when the
candidates collection is empty, this returns zeros and the frontend
shows the empty state.

The dashboard's candidate list itself is fetched from the real
/api/candidates endpoint (cand.py) - this file only owns the summary.
"""

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Return the three counters shown on the dashboard summary cards.

    Right now we just return totals (today/completed/upcoming = total count).
    Once interview scheduling lands, this should filter by interview status
    + date so the cards actually reflect today's load.
    """
    total = await db.candidates.count_documents({})
    return {
        "today_interviews": 0,        # TODO: filter by interview_date == today
        "completed_interviews": 0,    # TODO: filter by status == "evaluated"
        "upcoming_interviews": total, # placeholder: total candidates
    }
