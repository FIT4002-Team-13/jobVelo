from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class BehaviouralSuggestion(BaseModel):
    id: str | None = None
    title: str = Field(..., description="Short, concrete label (<= 8 words).")
    detail: str = Field(..., description="1-2 sentences explaining the pattern.")
    examples: list[str] = Field(default_factory=list, description="0-3 example follow up phrase or observed moments.",)
    acknowledged: bool = False
    note: str | None = None


class BehaviouralSuggestionsOut(BaseModel):
    suggestions: list[BehaviouralSuggestion] = Field(default_factory=list)
    generated_at: datetime | None = None
    session_count: int = 0


class BehaviouralSuggestionsResult(BaseModel):
    suggestions: list[BehaviouralSuggestion]


class BehaviouralSuggestionUpdate(BaseModel):
    acknowledged: bool | None = None
    note: str | None = Field(default=None, max_length=2000)
