from typing import Literal

from pydantic import BaseModel


class SimilarQuestion(BaseModel):
    original_question: str
    category: Literal["technical", "behavioural"]


class SimilarQuestionResult(BaseModel):
    category: Literal["technical", "behavioural"]
    question: str
    reason: str


class SuggestedQuestion(BaseModel):
    category: Literal["technical", "behavioural"]
    question: str
    source: str
    reason: str


class SuggestedQuestionsList(BaseModel):
    questions: list[SuggestedQuestion]
