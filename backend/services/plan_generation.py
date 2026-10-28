"""Background interview-plan generation shared by the candidate and
job-candidate routes."""

import json
import logging
from datetime import UTC, datetime

from bson import ObjectId

from services.openai_service import generate_interview_plan

logger = logging.getLogger(__name__)


async def generate_and_store_plan(
    db, jobcand_id: str, job_id: str, cand_id: str
) -> None:
    """Generate an interview plan for a job-candidate link and save it on the link.

    Meant for background tasks, so it never raises: failures are logged. `db` is
    passed in (routes call `get_db()`), which keeps this module free of global
    state. Does nothing when the link already has a plan, so a plan the user
    generated or edited first is never overwritten (or paid for twice).
    """
    try:
        job = (
            await db.jobs.find_one({"_id": ObjectId(job_id)})
            if ObjectId.is_valid(job_id)
            else None
        )
        cand = (
            await db.candidates.find_one({"_id": ObjectId(cand_id)})
            if ObjectId.is_valid(cand_id)
            else None
        )
        jc = (
            await db.job_candidates.find_one({"_id": ObjectId(jobcand_id)})
            if ObjectId.is_valid(jobcand_id)
            else None
        )

        # A plan already exists (e.g. the user hit "Generate Plan" before this
        # background task ran): don't pay for a second LLM call or overwrite it.
        if jc and jc.get("plan_sections"):
            return

        job_title = (job or {}).get("title", "the role")
        job_description = (job or {}).get("description")
        candidate_name = (cand or {}).get("cand_full_name", "the candidate")

        cv_analysis = None
        if jc:
            raw = jc.get("cv_analysis")
            if isinstance(raw, str):
                try:
                    cv_analysis = json.loads(raw)
                except json.JSONDecodeError:
                    pass
            elif isinstance(raw, dict):
                cv_analysis = raw

        sections = await generate_interview_plan(
            job_title, job_description, candidate_name, cv_analysis
        )
        if sections:
            await db.job_candidates.update_one(
                {"_id": ObjectId(jobcand_id)},
                {
                    "$set": {
                        "plan_sections": sections,
                        "updated_at": datetime.now(UTC),
                    }
                },
            )
    except Exception:
        logger.warning(
            "Interview plan generation failed for jobcand %s", jobcand_id, exc_info=True
        )
