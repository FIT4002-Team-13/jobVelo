from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Interview cycle for scheduling + running + post-interview state.
InterviewStatus = Literal["not_scheduled", "scheduled", "in_progress", "completed", "cancelled"]


class TranscriptEntry(BaseModel):
    id: str
    speaker: str
    timestamp: str
    text: str
    comment: str | None = None


class EvidenceRef(BaseModel):
    """One timestamped transcript quote backing a feedback point (US28).

    `timestamp` is the minutes:seconds marker from the transcript entry the
    quote came from; `quote` is a short verbatim snippet of the candidate's
    own words. The frontend hides these behind a per-point disclosure so the
    report stays scannable but every claim is auditable.
    """

    timestamp: str = ""
    quote: str


class FeedbackPoint(BaseModel):
    """A single strength/improvement point plus 0-2 pieces of transcript
    evidence.

    Backward compatibility: reports generated before US28 stored each item
    as a plain string, so the section validator below coerces a bare string
    into `FeedbackPoint(point=<string>, evidence=[])` - old documents (and
    any LLM run that still emits strings) keep loading without a migration.
    """

    point: str
    evidence: list[EvidenceRef] = Field(default_factory=list)


class InterviewFeedbackSection(BaseModel):
    """
    Create/update payload for one section of the interview feedback report.
    """

    items: list[FeedbackPoint] = Field(default_factory=list)
    # Kept for backward compatibility with pre-US28 reports; the per-point
    # evidence has superseded it, so new reports leave it null.
    justification: str | None = None

    @field_validator("items", mode="before")
    @classmethod
    def _coerce_items(cls, value):
        """Accept the legacy list[str] shape as well as list[FeedbackPoint]."""
        if not isinstance(value, list):
            return value
        return [
            {"point": item, "evidence": []} if isinstance(item, str) else item
            for item in value
        ]


class RequirementMapping(BaseModel):
    """One job requirement matched against the candidate's answers.

    There's no structured requirements list on a job (just a free-text
    `description`), so `requirement` is itself LLM-extracted from that
    description/title at report-generation time - see US28. `evidence`
    carries the timestamped candidate quotes that show the requirement was
    addressed (empty when it wasn't).
    """

    requirement: str
    addressed: bool
    justification: str = ""
    evidence: list[EvidenceRef] = Field(default_factory=list)


class InterviewFeedback(BaseModel):
    """
    Create/update payload for an interview feedback report.
    """

    summary: str | None = None
    strengths: InterviewFeedbackSection = Field(default_factory=InterviewFeedbackSection)
    improvements: InterviewFeedbackSection = Field(default_factory=InterviewFeedbackSection)
    # Only meaningful on the candidate report - stays empty on the
    # interviewer report, which isn't evaluated against job requirements.
    requirements_mapping: list[RequirementMapping] = Field(default_factory=list)


class InterviewScores(BaseModel):
    """The three 0-10 interview ratings, mirrored onto the job_candidates
    link (communication_score / skill_score / problem_solving_score)."""

    communication: float = Field(..., ge=0, le=10)
    skill: float = Field(..., ge=0, le=10)
    problem_solving: float = Field(..., ge=0, le=10)


class InterviewCompleteRequest(BaseModel):
    """Payload for POST /{intv_id}/complete. The transcript is optional -
    when omitted the server uses whatever the periodic autosave stored."""

    transcript: list[TranscriptEntry] | None = None
    duration_seconds: int | None = Field(default=None, ge=0)


class InterviewCompleteOut(BaseModel):
    """Everything the post-interview report popup renders."""

    intv_id: str
    intv_status: InterviewStatus
    scores: InterviewScores
    candidate_report: InterviewFeedback
    interviewer_report: InterviewFeedback
    # True when the reports came from a previous completion (no new LLM run).
    cached: bool = False


class InterviewCreate(BaseModel):
    """Base payload for creating an interview session.

    An interview belongs to one candidate and one job. Interviewers are linked
    separately through the interview_user collection so one interview can have
    one or more interviewers.
    """

    cand_id: str = Field(..., min_length=1)
    job_id: str = Field(..., min_length=1)
    intv_date_time: datetime
    intv_location: str | None = Field(default=None, max_length=200)
    intv_status: InterviewStatus = "scheduled"


class InterviewUpdate(BaseModel):
    """Patch payload for updating mutable interview fields."""

    intv_date_time: datetime | None = None
    intv_location: str | None = Field(default=None, max_length=200)
    intv_transcript: list[TranscriptEntry] | None = None
    intv_status: InterviewStatus | None = None
    intv_duration_seconds: int | None = None
    intv_candidate_report: InterviewFeedback | None = None
    intv_interviewer_report: InterviewFeedback | None = None


class InterviewOut(BaseModel):
    """Public representation of an interview document."""

    intv_id: str
    cand_id: str
    job_id: str
    # None for interviews that exist but haven't been scheduled yet - an
    # interviewer can be assigned before a date is picked (intv_status
    # "not_scheduled"), and both cand.py and applications.py store None.
    intv_date_time: datetime | None = None
    intv_location: str | None = None
    intv_transcript: list[TranscriptEntry] | None = None
    intv_status: InterviewStatus
    intv_duration_seconds: int | None = None
    intv_candidate_report: InterviewFeedback | None = None
    intv_interviewer_report: InterviewFeedback | None = None
    intv_created_at: datetime
    intv_updated_at: datetime
