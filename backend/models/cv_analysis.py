"""CV-analysis models.

Each `cv_analyses` document is keyed by a job-candidate link (`jobcand_id`)
and stores the LLM's analysis output PLUS the file paths so we can re-render
the result page without re-running the LLM.

The (jobcand_id) → (analysis) relationship is one-to-one, enforced by a
unique index on `jobcand_id`. The cache check in the route uses this to
short-circuit when an analysis already exists - no Gemini call, no PDF
re-upload required, just retrieve and serve.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CvAnalysisBullet(BaseModel):
    """One row in the strengths / improvements / inconsistencies lists."""

    title: str
    detail: str


class CvAnalysisPositionFit(BaseModel):
    """Three 0-10 scores rendered as the Position Fit Summary bars."""

    relevant_experience: float = 0.0
    technical_fit:       float = 0.0
    soft_skills:         float = 0.0


class CvAnalysisOut(BaseModel):
    """Public response model used by every CV-analysis endpoint."""

    analysis_id:       str
    jobcand_id:        str
    candidate_name:    Optional[str] = None
    position_title:    str
    position_fit:      CvAnalysisPositionFit
    key_strengths:     list[CvAnalysisBullet] = []
    improvements:      list[CvAnalysisBullet] = []
    inconsistencies:   list[CvAnalysisBullet] = []
    # Storage paths so the frontend can preview the PDFs via /api/files.
    cv_path:           str
    cover_letter_path: Optional[str] = None
    created_at:        datetime
    # True when the response came from the cache (existing record) instead
    # of from a fresh LLM call. Lets the frontend show a subtle "cached"
    # indicator if it wants - cosmetic only.
    cached:            bool = False
