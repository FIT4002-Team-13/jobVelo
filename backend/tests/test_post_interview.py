"""Integration tests for POST /api/interviews/{id}/complete.

TC-034 - AI ratings generated for predefined evaluation criteria
TC-036 - AI summary generated after session completion
TC-037 - AI summary accurately reflects actual interview content
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from dependencies import get_current_user
from main import app
from models.job_candidate import CandidateRatings, SkillRating

# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def authed(client):
    """Inject a fake interviewer so require_role("interviewer") passes."""
    comp_id = ObjectId()
    user = {
        "_id": ObjectId(),
        "comp_id": comp_id,
        "role": "interviewer",
        "full_name": "Test Interviewer",
    }
    app.dependency_overrides[get_current_user] = lambda: user
    yield comp_id, client
    app.dependency_overrides.clear()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_db(
    comp_id: ObjectId,
    interview_doc: dict,
    job_doc: dict,
    cand_doc: dict,
    link_doc: dict,
) -> MagicMock:
    """Return a MagicMock DB wired for the complete_interview happy path."""
    mock_db = MagicMock()
    mock_db.interviews.find_one = AsyncMock(return_value=interview_doc)
    mock_db.jobs.find_one = AsyncMock(return_value=job_doc)
    mock_db.candidates.find_one = AsyncMock(return_value=cand_doc)
    mock_db.job_candidates.find_one = AsyncMock(return_value=link_doc)
    # Concurrency claim: return the doc so we don't 409.
    mock_db.interviews.find_one_and_update = AsyncMock(return_value=interview_doc)
    # No CV analysis or interviewer link for simplicity.
    mock_db.cv_analyses.find_one = AsyncMock(return_value=None)
    mock_db.interview_users.find_one = AsyncMock(return_value=None)
    mock_db.users.find_one = AsyncMock(return_value=None)
    # Write-side calls.
    mock_db.job_candidates.update_one = AsyncMock()
    mock_db.interviews.update_one = AsyncMock()
    return mock_db


_FAKE_RATINGS = CandidateRatings(
    technical_skills=SkillRating(skill="Technical Skills", score=7.0, evidence=[]),
    communication=SkillRating(skill="Communication", score=8.0, evidence=[]),
    problem_solving=SkillRating(skill="Problem Solving", score=6.0, evidence=[]),
)

_FAKE_REPORTS = {
    "candidate_report": {
        "summary": "The candidate demonstrated strong communication skills.",
        "strengths": {"items": [], "justification": None},
        "improvements": {"items": [], "justification": None},
    },
    "interviewer_report": {
        "summary": "The interviewer asked clear, structured questions.",
        "strengths": {"items": [], "justification": None},
        "improvements": {"items": [], "justification": None},
    },
}


# ── TC-034: AI ratings generated ─────────────────────────────────────────────


def test_complete_with_empty_transcript_returns_zero_ratings(authed):
    """TC-034: completing an interview with no transcript yields 0.0 scores.

    The three evaluation criteria (communication, technical_skills,
    problem_solving) are still present in the response, all at 0, so the
    UI can render a consistent ratings section even without data.
    """
    comp_id, client = authed
    intv_id = ObjectId()
    job_id = str(ObjectId())
    cand_id = str(ObjectId())
    link_id = ObjectId()

    interview_doc = {
        "_id": intv_id,
        "cand_id": cand_id,
        "job_id": job_id,
        "intv_status": "in_progress",
        "intv_transcript": None,
        "intv_candidate_report": None,
        "intv_interviewer_report": None,
    }
    job_doc = {"_id": ObjectId(job_id), "comp_id": comp_id, "title": "Dev"}
    cand_doc = {"_id": ObjectId(cand_id), "comp_id": comp_id, "cand_full_name": "Jane"}
    link_doc = {"_id": link_id, "cand_id": cand_id, "job_id": job_id}

    mock_db = _make_db(comp_id, interview_doc, job_doc, cand_doc, link_doc)

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.post(
            f"/api/interviews/{intv_id}/complete",
            json={"transcript": []},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["intv_status"] == "completed"
    scores = body["scores"]
    assert scores["communication"] == 0.0
    assert scores["skill"] == 0.0
    assert scores["problem_solving"] == 0.0


def test_complete_with_transcript_generates_ai_ratings(authed):
    """TC-034: when a transcript is present, rate_candidate_skills is called
    and the returned ratings drive the scores in the response."""
    comp_id, client = authed
    intv_id = ObjectId()
    job_id = str(ObjectId())
    cand_id = str(ObjectId())
    link_id = ObjectId()

    interview_doc = {
        "_id": intv_id,
        "cand_id": cand_id,
        "job_id": job_id,
        "intv_status": "in_progress",
        "intv_transcript": None,
        "intv_candidate_report": None,
        "intv_interviewer_report": None,
    }
    job_doc = {"_id": ObjectId(job_id), "comp_id": comp_id, "title": "Dev"}
    cand_doc = {"_id": ObjectId(cand_id), "comp_id": comp_id, "cand_full_name": "Jane"}
    link_doc = {"_id": link_id, "cand_id": cand_id, "job_id": job_id}

    mock_db = _make_db(comp_id, interview_doc, job_doc, cand_doc, link_doc)

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch(
            "routes.interview.generate_interview_reports",
            new_callable=AsyncMock,
            return_value=_FAKE_REPORTS,
        ),
        patch(
            "routes.interview.rate_candidate_skills",
            new_callable=AsyncMock,
            return_value=_FAKE_RATINGS,
        ) as mock_rate,
    ):
        response = client.post(
            f"/api/interviews/{intv_id}/complete",
            json={
                "transcript": [
                    {
                        "id": "1",
                        "speaker": "Candidate",
                        "timestamp": "00:01",
                        "text": "I built microservices at my last role.",
                    },
                    {
                        "id": "2",
                        "speaker": "Interviewer",
                        "timestamp": "00:05",
                        "text": "Tell me about that experience.",
                    },
                ]
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["scores"]["communication"] == 8.0
    assert body["scores"]["skill"] == 7.0
    assert body["scores"]["problem_solving"] == 6.0
    mock_rate.assert_awaited_once()


# ── TC-036: AI summary generated ─────────────────────────────────────────────


def test_complete_with_transcript_returns_candidate_and_interviewer_reports(authed):
    """TC-036: POST /complete must return both a candidate and an interviewer
    feedback report, each with a non-empty summary field."""
    comp_id, client = authed
    intv_id = ObjectId()
    job_id = str(ObjectId())
    cand_id = str(ObjectId())
    link_id = ObjectId()

    interview_doc = {
        "_id": intv_id,
        "cand_id": cand_id,
        "job_id": job_id,
        "intv_status": "in_progress",
        "intv_transcript": None,
        "intv_candidate_report": None,
        "intv_interviewer_report": None,
    }
    job_doc = {"_id": ObjectId(job_id), "comp_id": comp_id, "title": "Dev"}
    cand_doc = {"_id": ObjectId(cand_id), "comp_id": comp_id, "cand_full_name": "Jane"}
    link_doc = {"_id": link_id, "cand_id": cand_id, "job_id": job_id}

    mock_db = _make_db(comp_id, interview_doc, job_doc, cand_doc, link_doc)

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch(
            "routes.interview.generate_interview_reports",
            new_callable=AsyncMock,
            return_value=_FAKE_REPORTS,
        ),
        patch(
            "routes.interview.rate_candidate_skills",
            new_callable=AsyncMock,
            return_value=_FAKE_RATINGS,
        ),
    ):
        response = client.post(
            f"/api/interviews/{intv_id}/complete",
            json={
                "transcript": [
                    {
                        "id": "1",
                        "speaker": "Candidate",
                        "timestamp": "00:01",
                        "text": "I have five years of Python experience.",
                    },
                ]
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["candidate_report"]["summary"] is not None
    assert len(body["candidate_report"]["summary"]) > 0
    assert body["interviewer_report"]["summary"] is not None
    assert len(body["interviewer_report"]["summary"]) > 0


def test_complete_empty_transcript_returns_no_data_summary(authed):
    """TC-036: when there is no transcript, the summary must explicitly state
    that no data was recorded rather than returning a fabricated result."""
    comp_id, client = authed
    intv_id = ObjectId()
    job_id = str(ObjectId())
    cand_id = str(ObjectId())
    link_id = ObjectId()

    interview_doc = {
        "_id": intv_id,
        "cand_id": cand_id,
        "job_id": job_id,
        "intv_status": "in_progress",
        "intv_transcript": None,
        "intv_candidate_report": None,
        "intv_interviewer_report": None,
    }
    job_doc = {"_id": ObjectId(job_id), "comp_id": comp_id, "title": "Dev"}
    cand_doc = {"_id": ObjectId(cand_id), "comp_id": comp_id, "cand_full_name": "Jane"}
    link_doc = {"_id": link_id, "cand_id": cand_id, "job_id": job_id}

    mock_db = _make_db(comp_id, interview_doc, job_doc, cand_doc, link_doc)

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.post(
            f"/api/interviews/{intv_id}/complete",
            json={"transcript": []},
        )

    assert response.status_code == 200
    candidate_summary = response.json()["candidate_report"]["summary"]
    assert (
        "No transcript" in candidate_summary
        or "no transcript" in candidate_summary.lower()
    )


# ── TC-037: AI summary reflects actual interview content ─────────────────────


def test_complete_passes_transcript_text_to_llm(authed):
    """TC-037: the transcript content is forwarded to the LLM so the generated
    summary can accurately reflect what was said in the interview."""
    comp_id, client = authed
    intv_id = ObjectId()
    job_id = str(ObjectId())
    cand_id = str(ObjectId())
    link_id = ObjectId()

    interview_doc = {
        "_id": intv_id,
        "cand_id": cand_id,
        "job_id": job_id,
        "intv_status": "in_progress",
        "intv_transcript": None,
        "intv_candidate_report": None,
        "intv_interviewer_report": None,
    }
    job_doc = {"_id": ObjectId(job_id), "comp_id": comp_id, "title": "Backend Engineer"}
    cand_doc = {"_id": ObjectId(cand_id), "comp_id": comp_id, "cand_full_name": "Alice"}
    link_doc = {"_id": link_id, "cand_id": cand_id, "job_id": job_id}

    mock_db = _make_db(comp_id, interview_doc, job_doc, cand_doc, link_doc)

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch(
            "routes.interview.generate_interview_reports",
            new_callable=AsyncMock,
            return_value=_FAKE_REPORTS,
        ) as mock_reports,
        patch(
            "routes.interview.rate_candidate_skills",
            new_callable=AsyncMock,
            return_value=_FAKE_RATINGS,
        ),
    ):
        response = client.post(
            f"/api/interviews/{intv_id}/complete",
            json={
                "transcript": [
                    {
                        "id": "1",
                        "speaker": "Candidate",
                        "timestamp": "00:01",
                        "text": "distributed systems",
                    },
                    {
                        "id": "2",
                        "speaker": "Interviewer",
                        "timestamp": "00:05",
                        "text": "Tell me more.",
                    },
                ]
            },
        )

    assert response.status_code == 200
    # The transcript text must have been passed to the LLM call.
    mock_reports.assert_awaited_once()
    transcript_arg = (
        mock_reports.call_args.kwargs.get("transcript")
        or mock_reports.call_args.args[0]
    )
    assert "distributed systems" in transcript_arg


# ── Cached response ───────────────────────────────────────────────────────────


def test_complete_returns_cached_reports_without_new_llm_call(authed):
    """Re-calling /complete on an already-completed interview must return the
    stored reports without triggering another LLM run (cached=True in body)."""
    comp_id, client = authed
    intv_id = ObjectId()
    job_id = str(ObjectId())
    cand_id = str(ObjectId())
    link_id = ObjectId()

    stored_report = {
        "summary": "Previously generated summary.",
        "strengths": {"items": [], "justification": None},
        "improvements": {"items": [], "justification": None},
    }
    interview_doc = {
        "_id": intv_id,
        "cand_id": cand_id,
        "job_id": job_id,
        "intv_status": "completed",
        "intv_transcript": [],
        "intv_candidate_report": stored_report,
        "intv_interviewer_report": stored_report,
    }
    job_doc = {"_id": ObjectId(job_id), "comp_id": comp_id, "title": "Dev"}
    cand_doc = {"_id": ObjectId(cand_id), "comp_id": comp_id, "cand_full_name": "Jane"}
    stored_ratings = {
        "technical_skills": {
            "skill": "Technical Skills",
            "score": 7.0,
            "explanation": None,
            "evidence": [],
        },
        "communication": {
            "skill": "Communication",
            "score": 8.0,
            "explanation": None,
            "evidence": [],
        },
        "problem_solving": {
            "skill": "Problem Solving",
            "score": 6.0,
            "explanation": None,
            "evidence": [],
        },
    }
    link_doc = {
        "_id": link_id,
        "cand_id": cand_id,
        "job_id": job_id,
        "ratings": stored_ratings,
    }

    mock_db = _make_db(comp_id, interview_doc, job_doc, cand_doc, link_doc)

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch(
            "routes.interview.generate_interview_reports",
            new_callable=AsyncMock,
        ) as mock_llm,
    ):
        response = client.post(
            f"/api/interviews/{intv_id}/complete",
            json={},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["cached"] is True
    assert body["candidate_report"]["summary"] == "Previously generated summary."
    mock_llm.assert_not_called()
