"""Interviewer performance feedback (US34).

The interviewer profile shows AI-synthesised strengths and improvements about
how the user CONDUCTS interviews - questioning, neutrality/bias, interruption,
and time management. Each generation is saved as an append-only snapshot so
the interviewer's acknowledgements and reflection notes persist as history.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# The four themes the feedback is organised around.
FeedbackCategory = Literal["questioning", "bias", "interruption", "time_management"]


class GeneratedFeedbackItem(BaseModel):
    """One strength/improvement point returned by the LLM."""

    category: FeedbackCategory
    title: str
    detail: str
    examples: list[str] = Field(default_factory=list)


class GeneratedInterviewerFeedback(BaseModel):
    """Structured LLM output: the strengths + improvements sets."""

    strengths: list[GeneratedFeedbackItem]
    improvements: list[GeneratedFeedbackItem]


class FeedbackItemUpdate(BaseModel):
    """PATCH body for acknowledging an item and/or attaching a reflection note.

    Both fields optional so the frontend can toggle the acknowledgement and
    save the note independently.
    """

    acknowledged: bool | None = None
    note: str | None = Field(default=None, max_length=2000)
