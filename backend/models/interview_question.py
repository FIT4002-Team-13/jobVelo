from typing import Literal

from pydantic import BaseModel


class SimilarQuestion(BaseModel):
    original_question: str
    category: Literal["technical", "behavioural", "experience"]


class SimilarQuestionResult(BaseModel):
    category: Literal["technical", "behavioural", "experience"]
    question: str
    reason: str


class SuggestedQuestion(BaseModel):
    category: Literal["technical", "behavioural", "experience"]
    question: str
    source: str
    reason: str


class SuggestedQuestionsList(BaseModel):
    questions: list[SuggestedQuestion]


class ReactiveQuestion(BaseModel):
    # "follow_up" = the candidate's answer was ambiguous and needs clarifying.
    # "general" = they touched a job-description topic worth a fresh question.
    kind: Literal["follow_up", "general"]
    category: Literal["technical", "behavioural", "experience"]
    question: str
    reason: str


class ReactiveQuestionsResult(BaseModel):
    # 0 to N questions - empty when the answer was clear and off-scope.
    questions: list[ReactiveQuestion]
