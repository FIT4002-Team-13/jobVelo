from typing import Literal
from pydantic import BaseModel

class SuggestedQuestion(BaseModel):
    category: Literal["technical", "behavioural"]
    question: str
    source: str
    reason: str

class SuggestedQuestionsList(BaseModel):
    questions: list[SuggestedQuestion]