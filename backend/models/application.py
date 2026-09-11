"""Application (job-candidate) models.

An "application" is the same underlying `job_candidates` link document, but
presented as a flat candidate + job + interview + interviewer + CV-analysis
row for the Applications table and the Schedules calendar.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ApplicationRowOut(BaseModel):
    """One row of GET /api/applications.

    Every scalar is validated; `ratings` stays a loose dict so a legacy
    link with a partial ratings blob can't 500 the list.
    """

    application_id: str
    cand_id: str
    candidate_name: str
    email: str = ""
    phone: str = ""
    job_id: str
    job_title: str = ""
    # When the candidate profile was created - the dashboard admin summary
    # uses it for the "+N this month" delta.
    cand_created_at: datetime | None = None
    status: str
    cv_url: str | None = None
    cover_letter_url: str | None = None
    # None when no analysis exists for this application yet.
    cv_analysis_status: str | None = None
    score: float | None = None
    interview_datetime: datetime | None = None
    interviewer: str | None = None
    interviewer_user_id: str | None = None
    intv_id: str | None = None
    ratings: dict | None = None


class ApplicationUpdate(BaseModel):
    """Body for PATCH /api/applications/{application_id}."""

    job_id: str
    interviewer_user_id: str | None = None
    scheduled_at: str | None = None
