"""Job (job_post) model.

A job belongs to a company via `comp_id` and acts as the parent in the
N:N relationship with candidates (bridged by `job_candidates`).

ER mapping
----------
The team's job shape diverges from the original ER's `job_description /
job_start / job_end / job_type` fields in favour of UI-friendly names
(`title`, `description`, `recruitment_start`, `employment_type`...). Both
shapes carry the same information; the only deliberate addition is
`status`, `candidates_filled`, and `interviewers` which are server-managed
runtime fields rather than user-supplied.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    """Body for POST /api/jobs.

    comp_id is required so the job is scoped to the calling user's company.
    Once auth lands this should come from the session instead of the body.
    """

    comp_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=120)
    description: str = ""
    employment_type: list[str] = []
    recruitment_start: str
    recruitment_end: str
    candidates_total: int = Field(default=1, ge=1)
    salary: str = ""
    salary_type: str = ""


class JobUpdate(BaseModel):
    """Body for PUT /api/jobs/{job_id}. Every field optional - partial update.

    `comp_id` is deliberately NOT updatable; a job can't move between companies.
    """

    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    employment_type: list[str] | None = None
    recruitment_start: str | None = None
    recruitment_end: str | None = None
    candidates_total: int | None = Field(default=None, ge=1)
    salary: str | None = None
    salary_type: str | None = None
    status: str | None = None


class JobOut(BaseModel):
    """Safe public representation of a job document.

    Defaults are set on every field that could plausibly be missing on a
    legacy doc, so the serializer never raises on partial data.

    DERIVED fields (NOT stored on the jobs collection - computed live from
    the job_candidates link table by routes/jobs.py on every read):
      - candidates_filled : count of job_candidates rows for this job
      - interviewers      : distinct, non-empty interviewer names

    Default values (0 / []) only ever apply when the route forgets to
    inject the computed stats - keeping them avoids a hard crash.
    """

    id: str
    comp_id: str
    title: str
    description: str = ""
    employment_type: list[str] = []
    recruitment_start: str = ""
    recruitment_end: str = ""
    candidates_total: int = 1
    candidates_filled: int = 0           # derived; see class docstring
    salary: str = ""
    salary_type: str = ""
    status: str = "Pending"
    interviewers: list[str] = []         # derived; see class docstring
    job_created_at: datetime | None = None
    job_last_update_datetime: datetime | None = None
