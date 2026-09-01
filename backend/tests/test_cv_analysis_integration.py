"""Integration tests for CV analysis routes.

TC-015 - CV analysis generated for candidate with uploaded resume
TC-016 - CV analysis page handles missing resume
TC-017 - Pre-interview questions suggested based on CV
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

import database as db_module
from main import app


@pytest.fixture
async def db_client():
    mock_db = AsyncMongoMockClient()["testdb"]
    with patch.object(db_module.mongo, "db", mock_db):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as c:
            yield c, mock_db
    app.dependency_overrides.clear()


async def _seed_context(db) -> str:
    """Seed candidates, jobs, and job_candidates so the route can resolve
    the chain. Returns the jobcand_id string the route expects."""
    comp_id = ObjectId()
    cand_id = ObjectId()
    job_id = ObjectId()

    await db.candidates.insert_one(
        {
            "_id": cand_id,
            "cand_full_name": "Alex Brown",
            "cand_email": "alex@example.com",
            "comp_id": comp_id,
            "cand_created_at": datetime.now(timezone.utc),
            "cand_updated_at": datetime.now(timezone.utc),
        }
    )
    await db.jobs.insert_one(
        {
            "_id": job_id,
            "comp_id": comp_id,
            "title": "Software Engineer",
            "description": "Build great things",
        }
    )
    link = await db.job_candidates.insert_one(
        {
            "cand_id": str(cand_id),
            "job_id": str(job_id),
        }
    )
    return str(link.inserted_id)


_FAKE_ANALYSIS_RESULT = {
    "position_fit": {
        "relevant_experience": 7.0,
        "technical_fit": 8.0,
        "soft_skills": 6.0,
    },
    "key_strengths": [{"title": "Python", "detail": "Strong Python fundamentals"}],
    "improvements": [],
    "inconsistencies": [],
    "interview_questions": [
        {
            "category": "technical",
            "question": "Walk me through a FastAPI project you have built.",
            "rationale": "FastAPI listed prominently on CV",
        }
    ],
}


# ── TC-015 ─────────────────────────────────────────────────────────────────────


async def test_cv_analysis_generated_for_candidate_with_resume(db_client):
    """POST /api/cv-analysis with a valid PDF creates an analysis doc."""
    client, db = db_client
    jobcand_id = await _seed_context(db)

    with (
        patch("routes.cv_analysis.save_upload", new_callable=AsyncMock) as mock_save,
        patch("routes.cv_analysis.analyse_cv", new_callable=AsyncMock) as mock_analyse,
    ):
        mock_save.return_value = "cv_analyses/fake-cv.pdf"
        mock_analyse.return_value = _FAKE_ANALYSIS_RESULT

        response = await client.post(
            "/api/cv-analysis",
            data={"jobcand_id": jobcand_id},
            files={"cv": ("resume.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "processing"
    assert body["jobcand_id"] == jobcand_id

    # Background task runs before client.post() returns, so the doc is
    # already flipped to completed by the time we query here.
    doc = await db.cv_analyses.find_one({"jobcand_id": jobcand_id})
    assert doc is not None
    assert doc["status"] == "completed"


# ── TC-016 ─────────────────────────────────────────────────────────────────────


async def test_cv_analysis_returns_400_when_no_resume_and_no_existing_analysis(
    db_client,
):
    """POST /api/cv-analysis without a CV file and no cached result must return 400."""
    client, _db = db_client

    response = await client.post(
        "/api/cv-analysis",
        data={"jobcand_id": str(ObjectId())},
    )

    assert response.status_code == 400
    assert "Upload a CV PDF" in response.json()["detail"]


# ── TC-017 ─────────────────────────────────────────────────────────────────────


async def test_interview_questions_returned_from_completed_cv_analysis(db_client):
    """GET /api/cv-analysis/by-jobcand returns suggested questions for a completed analysis."""
    client, db = db_client
    jobcand_id = str(ObjectId())

    await db.cv_analyses.insert_one(
        {
            "jobcand_id": jobcand_id,
            "status": "completed",
            "candidate_name": "Alex Brown",
            "position_title": "Software Engineer",
            "position_fit": {
                "relevant_experience": 7.0,
                "technical_fit": 8.0,
                "soft_skills": 6.0,
            },
            "key_strengths": [],
            "improvements": [],
            "inconsistencies": [],
            "interview_questions": [
                {
                    "category": "technical",
                    "question": "Walk me through a FastAPI project you have built.",
                    "rationale": "FastAPI listed prominently on CV",
                }
            ],
            "cv_path": "cv_analyses/fake-cv.pdf",
            "cover_letter_path": None,
            "created_at": datetime.now(timezone.utc),
        }
    )

    response = await client.get(f"/api/cv-analysis/by-jobcand/{jobcand_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    questions = body["interview_questions"]
    assert len(questions) == 1
    assert questions[0]["category"] == "technical"
    assert "FastAPI" in questions[0]["question"]
