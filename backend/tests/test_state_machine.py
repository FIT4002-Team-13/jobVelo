"""Phase-3 state-machine regression tests.

Covers: completed-interview immutability in create-for-job (3.3), delete
cascades for jobs and per-candidate removal (3.1), and the hardened
complete-interview endpoint (3.4): concurrency claim, LLM-output validation
with claim release, honest null scores on cached reads, and transcript
truncation.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from database import get_db
from dependencies import get_current_user
from main import app
from routes.interview import _TRANSCRIPT_CHAR_BUDGET, _transcript_to_text

# ── helpers ──────────────────────────────────────────────────────────────────


async def _aiter(items):
    for item in items:
        yield item


def _cursor(items):
    cur = MagicMock()
    cur.to_list = AsyncMock(return_value=items)
    return cur


NOW = datetime.now(timezone.utc)


def _interview_doc(status="scheduled", **extra):
    doc = {
        "_id": ObjectId(),
        "cand_id": str(ObjectId()),
        "job_id": str(ObjectId()),
        "intv_date_time": None,
        "intv_location": None,
        "intv_transcript": None,
        "intv_status": status,
        "intv_duration_seconds": None,
        "intv_candidate_report": None,
        "intv_interviewer_report": None,
        "intv_created_at": NOW,
        "intv_updated_at": NOW,
    }
    doc.update(extra)
    return doc


_TRANSCRIPT = [
    {
        "id": "1",
        "speaker": "Jamie",
        "timestamp": "00:01",
        "text": "Tell me about a project.",
    },
    {
        "id": "2",
        "speaker": "Sam",
        "timestamp": "00:10",
        "text": "I built a dashboard in React.",
    },
]


def _complete_db(interview_doc, claim_result="claimed"):
    """Mock DB wired for the complete endpoint's happy path up to the LLM.
    claim_result: "claimed" -> claim succeeds; None -> someone else holds it."""
    link_id = ObjectId()
    mock_db = MagicMock()
    mock_db.interviews.find_one = AsyncMock(return_value=interview_doc)
    mock_db.jobs.find_one = AsyncMock(
        return_value={
            "_id": ObjectId(interview_doc["job_id"]),
            "title": "Dev",
            "description": "",
        }
    )
    mock_db.job_candidates.find_one = AsyncMock(
        return_value={
            "_id": link_id,
            "cand_id": interview_doc["cand_id"],
            "job_id": interview_doc["job_id"],
        }
    )
    mock_db.candidates.find_one = AsyncMock(
        return_value={
            "_id": ObjectId(interview_doc["cand_id"]),
            "cand_full_name": "Test Candidate",
        }
    )
    mock_db.interview_users.find_one = AsyncMock(return_value=None)
    mock_db.cv_analyses.find_one = AsyncMock(return_value=None)
    mock_db.interviews.find_one_and_update = AsyncMock(
        return_value=interview_doc if claim_result == "claimed" else None
    )
    mock_db.interviews.update_one = AsyncMock()
    mock_db.job_candidates.update_one = AsyncMock()
    return mock_db


@pytest.fixture()
def authed(client):
    user = {
        "_id": ObjectId(),
        "comp_id": ObjectId(),
        "role": "interviewer",
        "full_name": "Test Interviewer",
    }
    app.dependency_overrides[get_current_user] = lambda: user
    yield user["comp_id"], client
    app.dependency_overrides.clear()


# ── 3.3 create-for-job: completed interviews are immutable ───────────────────


def test_create_for_job_leaves_completed_interview_untouched(authed):
    """Re-submitting the add-candidate popup for a candidate whose interview
    is COMPLETED must not reschedule it or replace its interviewer links."""
    comp_id, client = authed
    job_id = ObjectId()
    cand_id = ObjectId()
    candidate = {
        "_id": cand_id,
        "cand_full_name": "Jane Smith",
        "cand_email": "jane@example.com",
        "cand_phone": None,
        "comp_id": comp_id,
        "cand_created_at": NOW,
        "cand_updated_at": NOW,
    }
    link = {
        "_id": ObjectId(),
        "cand_id": str(cand_id),
        "job_id": str(job_id),
        "created_at": NOW,
        "updated_at": NOW,
    }

    mock_db = MagicMock()
    mock_db.jobs.find_one = AsyncMock(return_value={"_id": job_id})
    mock_db.candidates.find_one = AsyncMock(return_value=candidate)
    mock_db.job_candidates.find_one = AsyncMock(return_value=link)
    mock_db.interviews.find_one = AsyncMock(
        return_value=_interview_doc(status="completed")
    )
    mock_db.interviews.update_one = AsyncMock()
    mock_db.interview_users.delete_many = AsyncMock()
    mock_db.interview_users.insert_one = AsyncMock()

    with patch("routes.cand.get_db", return_value=mock_db):
        response = client.post(
            "/api/candidates/create-for-job",
            json={
                "cand_full_name": "Jane Smith",
                "cand_email": "jane@example.com",
                "cand_phone": None,
                "cand_cv_url": None,
                "cand_cover_letter_url": None,
                "comp_id": "ignored",
                "job_id": str(job_id),
                "interviewer_user_id": str(ObjectId()),
                "scheduled_at": "2030-01-01T10:00",
            },
        )

    assert response.status_code == 201
    mock_db.interviews.update_one.assert_not_called()
    mock_db.interview_users.delete_many.assert_not_called()
    mock_db.interview_users.insert_one.assert_not_called()


# ── 3.1 delete cascades ──────────────────────────────────────────────────────


def test_delete_job_cascades_interviews_links_and_analyses(authed):
    _, client = authed
    job_id = ObjectId()
    link_id, intv_id = ObjectId(), ObjectId()

    mock_db = MagicMock()
    mock_db.job_candidates.find.return_value = _aiter([{"_id": link_id}])
    mock_db.interviews.find.return_value = _aiter([{"_id": intv_id}])
    delete_result = MagicMock()
    delete_result.deleted_count = 1
    mock_db.jobs.delete_one = AsyncMock(return_value=delete_result)
    mock_db.job_candidates.delete_many = AsyncMock()
    mock_db.cv_analyses.find.return_value = _aiter(
        [{"cv_path": "cv_analyses/a-cv.pdf", "cover_letter_path": None}]
    )
    mock_db.cv_analyses.delete_many = AsyncMock()
    mock_db.interview_users.delete_many = AsyncMock()
    mock_db.interviews.delete_many = AsyncMock()

    app.dependency_overrides[get_db] = lambda: mock_db
    with patch("routes.jobs.delete_upload") as fake_delete:
        response = client.delete(f"/api/jobs/{job_id}")

    assert response.status_code == 204
    mock_db.job_candidates.delete_many.assert_awaited_once()
    mock_db.cv_analyses.delete_many.assert_awaited_once_with(
        {"jobcand_id": {"$in": [str(link_id)]}}
    )
    mock_db.interview_users.delete_many.assert_awaited_once_with(
        {"intv_id": {"$in": [str(intv_id)]}}
    )
    mock_db.interviews.delete_many.assert_awaited_once()
    fake_delete.assert_any_call("cv_analyses/a-cv.pdf")


def test_remove_candidate_from_job_cascades_cv_analysis(authed):
    _, client = authed
    job_id, link_id = ObjectId(), ObjectId()
    link = {"_id": link_id, "cand_id": str(ObjectId()), "job_id": str(job_id)}

    mock_db = MagicMock()
    mock_db.jobs.find_one = AsyncMock(return_value={"_id": job_id})
    mock_db.job_candidates.find_one = AsyncMock(return_value=link)
    mock_db.job_candidates.delete_one = AsyncMock()
    mock_db.cv_analyses.find.return_value = _aiter(
        [
            {
                "cv_path": "cv_analyses/b-cv.pdf",
                "cover_letter_path": "cv_analyses/b-cl.pdf",
            }
        ]
    )
    mock_db.cv_analyses.delete_many = AsyncMock()
    mock_db.interviews.find.return_value = _cursor([])

    app.dependency_overrides[get_db] = lambda: mock_db
    with patch("routes.jobs.delete_upload") as fake_delete:
        response = client.delete(f"/api/jobs/{job_id}/candidates/{link_id}")

    assert response.status_code == 204
    mock_db.cv_analyses.delete_many.assert_awaited_once_with(
        {"jobcand_id": {"$in": [str(link_id)]}}
    )
    fake_delete.assert_any_call("cv_analyses/b-cv.pdf")
    fake_delete.assert_any_call("cv_analyses/b-cl.pdf")


# ── 3.4 complete-interview hardening ─────────────────────────────────────────


def test_complete_conflicts_while_generation_in_progress(authed):
    """Second click while a run holds the claim -> 409, and the LLM is never
    invoked a second time."""
    _, client = authed
    doc = _interview_doc()
    mock_db = _complete_db(doc, claim_result=None)

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch(
            "routes.interview.generate_interview_reports", new_callable=AsyncMock
        ) as llm,
    ):
        response = client.post(
            f"/api/interviews/{doc['_id']}/complete", json={"transcript": _TRANSCRIPT}
        )

    assert response.status_code == 409
    llm.assert_not_called()


def test_complete_empty_llm_response_is_502_and_releases_claim(authed):
    """A refusal/empty `{}` from the model must NOT persist blank reports and
    0.0 scores (the old behaviour locked the interview to blanks forever).
    The claim is released so retry works."""
    _, client = authed
    doc = _interview_doc()
    mock_db = _complete_db(doc)

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch(
            "routes.interview.generate_interview_reports",
            new_callable=AsyncMock,
            return_value={},
        ),
    ):
        response = client.post(
            f"/api/interviews/{doc['_id']}/complete", json={"transcript": _TRANSCRIPT}
        )

    assert response.status_code == 502
    # Only the claim-release update ran - nothing was persisted as a report.
    assert mock_db.interviews.update_one.await_count == 1
    unset_call = mock_db.interviews.update_one.await_args.args[1]
    assert "$unset" in unset_call and "intv_report_state" in unset_call["$unset"]
    mock_db.job_candidates.update_one.assert_not_called()


def test_complete_mistyped_llm_section_is_502_not_500(authed):
    """Rare case: the model returns `"strengths": "good"` (wrong type). The
    Pydantic failure must surface as a clean 502 with the claim released,
    not an unhandled 500 after the paid call."""
    _, client = authed
    doc = _interview_doc()
    mock_db = _complete_db(doc)
    bad_result = {
        "scores": {"communication": 5, "skill": 5, "problem_solving": 5},
        "candidate_report": {"summary": "ok", "strengths": "good"},
        "interviewer_report": {"summary": "ok"},
    }

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch(
            "routes.interview.generate_interview_reports",
            new_callable=AsyncMock,
            return_value=bad_result,
        ),
    ):
        response = client.post(
            f"/api/interviews/{doc['_id']}/complete", json={"transcript": _TRANSCRIPT}
        )

    assert response.status_code == 502
    unset_call = mock_db.interviews.update_one.await_args.args[1]
    assert "$unset" in unset_call


def test_complete_cached_with_missing_link_returns_null_scores(authed):
    """Rare case: reports exist but the job_candidates link was deleted.
    The cached response must say scores=null, not fabricate 0.0/0.0/0.0."""
    _, client = authed
    report = {
        "summary": "fine",
        "strengths": {"items": ["x"]},
        "improvements": {"items": []},
    }
    doc = _interview_doc(
        status="completed",
        intv_candidate_report=report,
        intv_interviewer_report=report,
    )
    mock_db = _complete_db(doc)  # link find_one -> None

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch(
            "routes.interview.generate_interview_reports", new_callable=AsyncMock
        ) as llm,
    ):
        response = client.post(f"/api/interviews/{doc['_id']}/complete", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["cached"] is True
    assert body["scores"] is None
    llm.assert_not_called()


def test_transcript_truncation_keeps_most_recent_turns():
    """A transcript past the char budget drops the OLDEST lines and flags
    the truncation, so very long interviews can still be completed."""
    entries = [
        {"speaker": "S", "timestamp": "00:01", "text": f"line {i} " + "x" * 200}
        for i in range(1000)
    ]
    text = _transcript_to_text(entries)

    assert len(text) <= _TRANSCRIPT_CHAR_BUDGET + 100  # marker allowance
    assert text.startswith("[earlier transcript truncated")
    assert "line 999" in text  # newest kept
    assert "line 0 " not in text  # oldest dropped


def test_transcript_under_budget_is_untouched():
    entries = [{"speaker": "S", "timestamp": "00:01", "text": "short"}]
    assert _transcript_to_text(entries) == "[00:01] S: short"


# ── bias incidents: persisted and echoed in the completion report ────────────


def _skill(name):
    return {"skill": name, "score": 7.0, "explanation": None, "evidence": []}


def test_complete_echoes_stored_bias_incidents_on_cached_read(authed):
    """A re-completed interview (reports + ratings already stored) returns the
    persisted bias incidents without a second LLM run, so the full flagged
    list survives past the live banner's last-3 cap."""
    comp_id, client = authed
    cand_id, job_id = ObjectId(), ObjectId()
    empty_report = {
        "summary": "s",
        "strengths": {"items": []},
        "improvements": {"items": []},
    }
    bias = [
        {
            "quote": "Are you planning to have children soon?",
            "category": "Family status",
            "reason": "Touches a protected category.",
            "suggestion": "Ask about availability for the role's hours.",
            "timestamp": "04:12",
        }
    ]
    interview = _interview_doc(
        status="completed",
        cand_id=str(cand_id),
        job_id=str(job_id),
        intv_candidate_report=empty_report,
        intv_interviewer_report=empty_report,
        intv_bias_incidents=bias,
    )
    link = {
        "_id": ObjectId(),
        "cand_id": str(cand_id),
        "job_id": str(job_id),
        "ratings": {
            "technical_skills": _skill("Technical Skills"),
            "communication": _skill("Communication"),
            "problem_solving": _skill("Problem Solving"),
        },
    }

    mock_db = MagicMock()
    mock_db.interviews.find_one = AsyncMock(return_value=interview)
    mock_db.candidates.find_one = AsyncMock(
        return_value={"_id": cand_id, "comp_id": comp_id}
    )
    mock_db.jobs.find_one = AsyncMock(return_value={"_id": job_id, "comp_id": comp_id})
    mock_db.job_candidates.find_one = AsyncMock(return_value=link)

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch(
            "routes.interview.generate_interview_reports", new_callable=AsyncMock
        ) as gen,
    ):
        res = client.post(f"/api/interviews/{interview['_id']}/complete", json={})

    assert res.status_code == 200
    gen.assert_not_awaited()  # cached path: no LLM
    body = res.json()
    assert body["cached"] is True
    assert body["bias_incidents"] == bias
