"""CV-analysis reuse + retry semantics.

Reuse = a fileless POST /api/cv-analysis for a candidate who already has a CV
on file (added to another job earlier). The key regression here: a fileless
POST over a FAILED analysis must RE-RUN it (e.g. after a since-fixed Gemini
model outage), not keep returning the cached failure - otherwise a failed
reuse can never recover without a manual re-upload.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from dependencies import get_current_user
from main import app


@pytest.fixture()
def authed(client):
    comp_id = ObjectId()
    user = {"_id": ObjectId(), "comp_id": comp_id, "role": "interviewer", "full_name": "T"}
    app.dependency_overrides[get_current_user] = lambda: user
    yield comp_id, client
    app.dependency_overrides.clear()


def _context(comp_id, *, cv_url):
    """Build a consistent link/job/candidate trio that satisfies both
    _assert_jobcand_in_company and _lookup_jobcand_context."""
    link_id, job_oid, cand_oid = ObjectId(), ObjectId(), ObjectId()
    link = {"_id": link_id, "job_id": str(job_oid), "cand_id": str(cand_oid)}
    job = {"_id": job_oid, "comp_id": comp_id, "title": "Senior DB", "description": "d"}
    candidate = {
        "_id": cand_oid,
        "comp_id": comp_id,
        "cand_full_name": "zoe",
        "cand_cv_url": cv_url,
        "cand_cover_letter_url": None,
    }
    return link, job, candidate


def test_fileless_post_over_failed_analysis_reruns(authed):
    comp_id, client = authed
    cv_url = "/api/files/cv_analyses/stored-cv.pdf"
    link, job, candidate = _context(comp_id, cv_url=cv_url)

    failed = {
        "_id": ObjectId(),
        "jobcand_id": str(link["_id"]),
        "status": "failed",
        "error": "404 model retired",
        "cv_path": "cv_analyses/stored-cv.pdf",  # same file the candidate points at
        "cover_letter_path": None,
    }

    mock_db = MagicMock()
    mock_db.job_candidates.find_one = AsyncMock(return_value=link)
    mock_db.jobs.find_one = AsyncMock(return_value=job)
    mock_db.candidates.find_one = AsyncMock(return_value=candidate)
    mock_db.cv_analyses.find_one = AsyncMock(return_value=failed)
    mock_db.cv_analyses.delete_one = AsyncMock()
    mock_db.cv_analyses.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
    mock_db.candidates.update_one = AsyncMock()

    async def fake_read(path):
        return b"%PDF-1.4 fake" if path == "cv_analyses/stored-cv.pdf" else None

    async def fake_save(*_a, **_k):
        return "cv_analyses/fresh-cv.pdf"

    with (
        patch("routes.cv_analysis.get_db", return_value=mock_db),
        patch("routes.cv_analysis.read_bytes", new=fake_read),
        patch("routes.cv_analysis.save_bytes", new=fake_save),
        patch("routes.cv_analysis.delete_upload", new_callable=AsyncMock) as fake_delete,
        patch("routes.cv_analysis._run_analysis", new_callable=AsyncMock),
    ):
        res = client.post("/api/cv-analysis", data={"jobcand_id": str(link["_id"])})

    assert res.status_code == 200, res.text
    body = res.json()
    # A fresh run, not the cached failure.
    assert body["status"] == "processing"
    assert body["cached"] is False
    # Old doc torn down, new one inserted.
    mock_db.cv_analyses.delete_one.assert_awaited_once()
    mock_db.cv_analyses.insert_one.assert_awaited_once()
    # The reused file (candidate's CV, == failed doc's cv_path) is NOT deleted.
    for call in fake_delete.await_args_list:
        assert call.args[0] != "cv_analyses/stored-cv.pdf"


def test_fileless_post_over_completed_analysis_is_cached_read(authed):
    """A completed analysis with no upload must NOT re-run - it's a cheap
    cached read (this is what keeps the candidate page's poll fast)."""
    comp_id, client = authed
    link, job, _cand = _context(comp_id, cv_url="/api/files/cv_analyses/x.pdf")

    completed = {
        "_id": ObjectId(),
        "jobcand_id": str(link["_id"]),
        "status": "completed",
        "position_fit": {},
        "cv_path": "cv_analyses/x.pdf",
        "cover_letter_path": None,
        "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc),
    }

    mock_db = MagicMock()
    mock_db.job_candidates.find_one = AsyncMock(return_value=link)
    mock_db.jobs.find_one = AsyncMock(return_value=job)
    mock_db.cv_analyses.find_one = AsyncMock(return_value=completed)
    mock_db.cv_analyses.delete_one = AsyncMock()
    mock_db.cv_analyses.insert_one = AsyncMock()

    with (
        patch("routes.cv_analysis.get_db", return_value=mock_db),
        patch("routes.cv_analysis._run_analysis", new_callable=AsyncMock) as fake_run,
    ):
        res = client.post("/api/cv-analysis", data={"jobcand_id": str(link["_id"])})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cached"] is True
    # No re-run, no teardown.
    mock_db.cv_analyses.delete_one.assert_not_awaited()
    mock_db.cv_analyses.insert_one.assert_not_awaited()
    fake_run.assert_not_awaited()
