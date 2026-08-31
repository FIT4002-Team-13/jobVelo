"""Auth + multi-tenancy regression tests for the batch-1 security sweep.

Covers the endpoints that previously had no auth (or no tenant guard):
job-candidates flat list, interviews CRUD/complete/reports, cv-analysis,
interview-users, and create-for-job's job/candidate ownership checks.

Style matches test_cand.py: TestClient from conftest, `get_db` patched with
MagicMock/AsyncMock per route module, auth faked via dependency overrides.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from dependencies import get_current_user
from main import app

# ── helpers ──────────────────────────────────────────────────────────────────


async def _aiter(items):
    for item in items:
        yield item


def _cursor(items):
    """Mock for `collection.find(...).to_list(...)` call chains."""
    cur = MagicMock()
    cur.to_list = AsyncMock(return_value=items)
    return cur


def _interview_doc(job_id: str | None = None, status: str = "scheduled") -> dict:
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "cand_id": str(ObjectId()),
        "job_id": job_id or str(ObjectId()),
        "intv_date_time": None,
        "intv_location": None,
        "intv_transcript": None,
        "intv_status": status,
        "intv_duration_seconds": None,
        "intv_candidate_report": None,
        "intv_interviewer_report": None,
        "intv_created_at": now,
        "intv_updated_at": now,
    }


@pytest.fixture()
def authed(client):
    """Fake a logged-in interviewer. Overriding get_current_user (rather
    than get_current_comp_id) means role checks AND comp derivation both
    resolve, matching production wiring."""
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


# ── 1. Anonymous requests are rejected everywhere ────────────────────────────

_OID = str(ObjectId())

# (method, url, request kwargs) — every formerly-open endpoint.
_ANON_MATRIX = [
    ("get", "/api/job-candidates", {}),
    ("get", "/api/interviews", {}),
    ("get", f"/api/interviews/{_OID}", {}),
    ("patch", f"/api/interviews/{_OID}", {"json": {"intv_status": "scheduled"}}),
    (
        "post",
        "/api/interviews",
        {"json": {"cand_id": _OID, "job_id": _OID, "intv_date_time": "2026-01-01T10:00:00Z"}},
    ),
    ("post", f"/api/interviews/{_OID}/complete", {"json": {}}),
    ("get", f"/api/interviews/{_OID}/candidate-report", {}),
    ("get", f"/api/interviews/{_OID}/interviewer-report", {}),
    ("get", f"/api/cv-analysis/by-jobcand/{_OID}", {}),
    ("post", "/api/cv-analysis", {"data": {"jobcand_id": _OID}}),
    ("delete", f"/api/cv-analysis/{_OID}", {}),
    ("get", f"/api/interview-users/by-interview/{_OID}", {}),
    ("get", f"/api/interview-users/by-user/{_OID}", {}),
    ("get", f"/api/interview-users/{_OID}", {}),
    ("post", "/api/interview-users", {"json": {"user_id": _OID, "intv_id": _OID}}),
]


@pytest.mark.parametrize("method,url,kwargs", _ANON_MATRIX)
def test_anonymous_request_is_401(client, method, url, kwargs):
    response = getattr(client, method)(url, **kwargs)
    assert response.status_code == 401, f"{method.upper()} {url} -> {response.status_code}"


def test_garbage_bearer_token_is_401(client):
    """Rare case: a present-but-invalid token must not pass as anonymous-ok."""
    response = client.get(
        "/api/interviews", headers={"Authorization": "Bearer not-a-real-jwt"}
    )
    assert response.status_code == 401


def test_user_without_company_is_400(client):
    """Rare case: a legacy user doc with no comp_id can't use tenant-scoped
    routes (get_current_comp_id rejects it explicitly)."""
    app.dependency_overrides[get_current_user] = lambda: {
        "_id": ObjectId(),
        "role": "interviewer",
    }
    try:
        response = client.get("/api/interviews")
        assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()


# ── 2. Interviews: tenant guards ─────────────────────────────────────────────


def test_get_interview_cross_tenant_is_404(authed):
    """Interview exists but its job belongs to another company -> 404 (not
    403), so interview ids can't be probed. Also covers the orphan case
    where the job was deleted entirely."""
    _, client = authed
    doc = _interview_doc()

    mock_db = MagicMock()
    mock_db.interviews.find_one = AsyncMock(return_value=doc)
    mock_db.jobs.find_one = AsyncMock(return_value=None)  # comp filter excludes it

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.get(f"/api/interviews/{doc['_id']}")

    assert response.status_code == 404


def test_get_interview_owner_succeeds(authed):
    _, client = authed
    doc = _interview_doc()

    mock_db = MagicMock()
    mock_db.interviews.find_one = AsyncMock(return_value=doc)
    mock_db.jobs.find_one = AsyncMock(return_value={"_id": ObjectId(doc["job_id"])})

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.get(f"/api/interviews/{doc['_id']}")

    assert response.status_code == 200
    assert response.json()["intv_id"] == str(doc["_id"])


def test_get_interview_invalid_id_is_400(authed):
    _, client = authed
    with patch("routes.interview.get_db", return_value=MagicMock()):
        response = client.get("/api/interviews/not-an-objectid")
    assert response.status_code == 400


def test_patch_interview_cross_tenant_is_404(authed):
    _, client = authed
    doc = _interview_doc(status="completed")

    mock_db = MagicMock()
    mock_db.interviews.find_one = AsyncMock(return_value=doc)
    mock_db.jobs.find_one = AsyncMock(return_value=None)

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.patch(
            f"/api/interviews/{doc['_id']}", json={"intv_status": "scheduled"}
        )

    assert response.status_code == 404
    mock_db.interviews.update_one.assert_not_called()


def test_list_interviews_scopes_query_to_company_jobs(authed):
    """With no filters, the list must still be constrained to the caller's
    company's job ids — never a bare find({})."""
    _, client = authed
    job_id = str(ObjectId())

    mock_db = MagicMock()
    mock_db.jobs.find.return_value = _aiter([{"_id": ObjectId(job_id)}])
    mock_db.interviews.find.return_value = _cursor([_interview_doc(job_id=job_id)])

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.get("/api/interviews")

    assert response.status_code == 200
    assert len(response.json()) == 1
    query = mock_db.interviews.find.call_args.args[0]
    assert query["job_id"] == {"$in": [job_id]}


def test_list_interviews_foreign_job_filter_returns_empty(authed):
    """Rare case: explicitly asking for another company's job_id must yield
    an empty list, not that company's interviews."""
    _, client = authed
    company_job = str(ObjectId())
    foreign_job = str(ObjectId())

    mock_db = MagicMock()
    mock_db.jobs.find.return_value = _aiter([{"_id": ObjectId(company_job)}])
    mock_db.interviews.find.return_value = _cursor([])

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.get(f"/api/interviews?job_id={foreign_job}")

    assert response.status_code == 200
    assert response.json() == []
    query = mock_db.interviews.find.call_args.args[0]
    assert query["job_id"] == "__no_match__"


def test_create_interview_foreign_job_is_404(authed):
    _, client = authed
    mock_db = MagicMock()
    mock_db.jobs.find_one = AsyncMock(return_value=None)

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.post(
            "/api/interviews",
            json={
                "cand_id": str(ObjectId()),
                "job_id": str(ObjectId()),
                "intv_date_time": "2026-01-01T10:00:00Z",
            },
        )

    assert response.status_code == 404
    mock_db.interviews.insert_one.assert_not_called()


def test_create_interview_foreign_candidate_is_404(authed):
    """Edge: the job is ours but the candidate belongs to another company."""
    _, client = authed
    mock_db = MagicMock()
    mock_db.jobs.find_one = AsyncMock(return_value={"_id": ObjectId()})
    mock_db.candidates.find_one = AsyncMock(return_value=None)

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.post(
            "/api/interviews",
            json={
                "cand_id": str(ObjectId()),
                "job_id": str(ObjectId()),
                "intv_date_time": "2026-01-01T10:00:00Z",
            },
        )

    assert response.status_code == 404
    mock_db.interviews.insert_one.assert_not_called()


def test_complete_interview_cross_tenant_is_404_and_never_calls_llm(authed):
    """The critical one: an outside interviewer must not be able to feed a
    fabricated transcript to the LLM and score another company's candidate."""
    _, client = authed
    doc = _interview_doc()

    mock_db = MagicMock()
    mock_db.interviews.find_one = AsyncMock(return_value=doc)
    # The candidate/job/link lookups are all comp_id-scoped; an outside
    # interviewer's company owns none of them, so each returns None and the
    # endpoint 404s before any LLM call.
    mock_db.candidates.find_one = AsyncMock(return_value=None)
    mock_db.jobs.find_one = AsyncMock(return_value=None)
    mock_db.job_candidates.find_one = AsyncMock(return_value=None)

    with (
        patch("routes.interview.get_db", return_value=mock_db),
        patch("routes.interview.generate_interview_reports", new_callable=AsyncMock) as llm,
    ):
        response = client.post(
            f"/api/interviews/{doc['_id']}/complete",
            json={"transcript": [{"id": "1", "speaker": "A", "timestamp": "00:01", "text": "hi"}]},
        )

    assert response.status_code == 404
    llm.assert_not_called()


def test_report_download_cross_tenant_is_404(authed):
    _, client = authed
    doc = _interview_doc(status="completed")
    doc["intv_candidate_report"] = {"summary": "x", "strengths": {}, "improvements": {}}

    mock_db = MagicMock()
    mock_db.interviews.find_one = AsyncMock(return_value=doc)
    # Job exists but is stamped with a different company.
    mock_db.jobs.find_one = AsyncMock(
        return_value={"_id": ObjectId(doc["job_id"]), "comp_id": ObjectId(), "title": "X"}
    )

    with patch("routes.interview.get_db", return_value=mock_db):
        response = client.get(f"/api/interviews/{doc['_id']}/candidate-report")

    assert response.status_code == 404


# ── 3. CV analysis: tenant guards + orphan fallback ──────────────────────────


def test_cv_analysis_get_cross_tenant_is_404(authed):
    _, client = authed
    jobcand_id = str(ObjectId())

    mock_db = MagicMock()
    mock_db.job_candidates.find_one = AsyncMock(return_value={"job_id": str(ObjectId())})
    mock_db.jobs.find_one = AsyncMock(return_value=None)

    with patch("routes.cv_analysis.get_db", return_value=mock_db):
        response = client.get(f"/api/cv-analysis/by-jobcand/{jobcand_id}")

    assert response.status_code == 404


def test_cv_analysis_get_invalid_id_is_400(authed):
    _, client = authed
    with patch("routes.cv_analysis.get_db", return_value=MagicMock()):
        response = client.get("/api/cv-analysis/by-jobcand/not-an-objectid")
    assert response.status_code == 400


def test_cv_analysis_delete_orphan_falls_back_to_doc_comp_owner_ok(authed):
    """Rare case: the job-candidate link was deleted after the analysis was
    made (orphan). The owner can still clean it up via the comp_id stamped
    on the doc itself."""
    comp_id, client = authed
    doc = {
        "_id": ObjectId(),
        "jobcand_id": str(ObjectId()),
        "comp_id": str(comp_id),
        "cv_path": "cv_analyses/x-cv.pdf",
        "cover_letter_path": None,
    }

    mock_db = MagicMock()
    mock_db.cv_analyses.find_one = AsyncMock(return_value=doc)
    mock_db.job_candidates.find_one = AsyncMock(return_value=None)  # orphan
    mock_db.cv_analyses.delete_one = AsyncMock()

    with (
        patch("routes.cv_analysis.get_db", return_value=mock_db),
        patch("routes.cv_analysis.delete_upload") as fake_delete,
    ):
        response = client.delete(f"/api/cv-analysis/{doc['_id']}")

    assert response.status_code == 204
    mock_db.cv_analyses.delete_one.assert_awaited_once()
    fake_delete.assert_any_call("cv_analyses/x-cv.pdf")


def test_cv_analysis_delete_clears_candidate_document_links(authed):
    """Safe delete: when the candidate profile's cv/cover-letter URLs point
    at the files the analysis owned, deleting the analysis must clear those
    pointers too - otherwise the candidate page keeps rendering View/PDF
    buttons that 404 against the deleted files."""
    _, client = authed
    jobcand_id = ObjectId()
    cand_oid = ObjectId()
    doc = {
        "_id": ObjectId(),
        "jobcand_id": str(jobcand_id),
        "cv_path": "cv_analyses/x-cv.pdf",
        "cover_letter_path": "cv_analyses/x-cl.pdf",
    }
    link = {"_id": jobcand_id, "job_id": str(ObjectId()), "cand_id": str(cand_oid)}

    mock_db = MagicMock()
    mock_db.cv_analyses.find_one = AsyncMock(return_value=doc)
    mock_db.cv_analyses.delete_one = AsyncMock()
    mock_db.job_candidates.find_one = AsyncMock(return_value=link)
    mock_db.jobs.find_one = AsyncMock(return_value={"_id": ObjectId()})
    mock_db.candidates.find_one = AsyncMock(
        return_value={
            "_id": cand_oid,
            "cand_cv_url": "/api/files/cv_analyses/x-cv.pdf",
            # Externally-supplied URL - must NOT be touched.
            "cand_cover_letter_url": "https://example.com/their-own-letter.pdf",
        }
    )
    mock_db.candidates.update_one = AsyncMock()

    with (
        patch("routes.cv_analysis.get_db", return_value=mock_db),
        patch("routes.cv_analysis.delete_upload"),
    ):
        response = client.delete(f"/api/cv-analysis/{doc['_id']}")

    assert response.status_code == 204
    update = mock_db.candidates.update_one.call_args.args[1]
    # The dangling CV pointer is cleared; the external cover-letter URL,
    # which doesn't reference the deleted file, is left alone.
    assert update["$unset"] == {"cand_cv_url": ""}


def test_cv_analysis_delete_orphan_outsider_is_404(authed):
    """Same orphan, but stamped with someone else's comp -> 404, no delete."""
    _, client = authed
    doc = {
        "_id": ObjectId(),
        "jobcand_id": str(ObjectId()),
        "comp_id": str(ObjectId()),  # different company
        "cv_path": "cv_analyses/x-cv.pdf",
    }

    mock_db = MagicMock()
    mock_db.cv_analyses.find_one = AsyncMock(return_value=doc)
    mock_db.job_candidates.find_one = AsyncMock(return_value=None)
    mock_db.cv_analyses.delete_one = AsyncMock()

    with patch("routes.cv_analysis.get_db", return_value=mock_db):
        response = client.delete(f"/api/cv-analysis/{doc['_id']}")

    assert response.status_code == 404
    mock_db.cv_analyses.delete_one.assert_not_called()


# ── 4. Interview-users: tenant guards + the datetime regression ──────────────


def _interview_users_db(comp_ok: bool = True) -> MagicMock:
    """DB where the interview -> job -> comp walk succeeds (or not)."""
    mock_db = MagicMock()
    mock_db.interviews.find_one = AsyncMock(return_value={"job_id": str(ObjectId())})
    mock_db.jobs.find_one = AsyncMock(return_value={"_id": ObjectId()} if comp_ok else None)
    return mock_db


def test_interview_users_by_interview_cross_tenant_is_404(authed):
    _, client = authed
    mock_db = _interview_users_db(comp_ok=False)
    with patch("routes.user_interview.get_db", return_value=mock_db):
        response = client.get(f"/api/interview-users/by-interview/{ObjectId()}")
    assert response.status_code == 404


def test_interview_users_by_user_foreign_user_is_404(authed):
    _, client = authed
    mock_db = MagicMock()
    mock_db.users.find_one = AsyncMock(return_value=None)
    with patch("routes.user_interview.get_db", return_value=mock_db):
        response = client.get(f"/api/interview-users/by-user/{ObjectId()}")
    assert response.status_code == 404


def test_interview_users_create_duplicate_is_400(authed):
    _, client = authed
    mock_db = _interview_users_db()
    mock_db.users.find_one = AsyncMock(return_value={"_id": ObjectId()})
    mock_db.interview_users.find_one = AsyncMock(return_value={"_id": ObjectId()})

    with patch("routes.user_interview.get_db", return_value=mock_db):
        response = client.post(
            "/api/interview-users",
            json={"user_id": str(ObjectId()), "intv_id": str(ObjectId())},
        )

    assert response.status_code == 400
    mock_db.interview_users.insert_one.assert_not_called()


def test_interview_users_create_succeeds(authed):
    """Regression for the datetime.now(datetime.utc) crash: a valid create
    must reach 201, not 500."""
    _, client = authed
    now = datetime.now(timezone.utc)
    link_id = ObjectId()
    user_id, intv_id = str(ObjectId()), str(ObjectId())

    mock_db = _interview_users_db()
    mock_db.users.find_one = AsyncMock(return_value={"_id": ObjectId(user_id)})
    created = {
        "_id": link_id,
        "user_id": user_id,
        "intv_id": intv_id,
        "intvuser_created_at": now,
        "intvuser_updated_at": now,
    }
    # First find_one: duplicate check (None); second: read-back after insert.
    mock_db.interview_users.find_one = AsyncMock(side_effect=[None, created])
    insert_result = MagicMock()
    insert_result.inserted_id = link_id
    mock_db.interview_users.insert_one = AsyncMock(return_value=insert_result)

    with patch("routes.user_interview.get_db", return_value=mock_db):
        response = client.post(
            "/api/interview-users", json={"user_id": user_id, "intv_id": intv_id}
        )

    assert response.status_code == 201
    assert response.json()["intvuser_id"] == str(link_id)


# ── 5. Job-candidates flat list: JWT scope, client comp_id ignored ───────────


def test_job_candidates_flat_scoped_to_jwt_company(authed):
    """The old client-supplied ?comp_id let anyone enumerate any company.
    It must now be ignored entirely — scope comes from the JWT."""
    comp_id, client = authed
    job_id = ObjectId()
    cand_id = ObjectId()
    link = {
        "_id": ObjectId(),
        "job_id": str(job_id),
        "cand_id": str(cand_id),
        "status": None,
    }

    mock_db = MagicMock()
    mock_db.jobs.find.return_value = _cursor([{"_id": job_id, "title": "Dev"}])
    mock_db.job_candidates.find.return_value = _cursor([link])
    mock_db.candidates.find.return_value = _cursor(
        [{"_id": cand_id, "cand_full_name": "Jane"}]
    )
    mock_db.cv_analyses.find.return_value = _aiter([])

    with patch("routes.job_cand.get_db", return_value=mock_db):
        # Deliberately pass a FOREIGN comp_id param — it must have no effect.
        response = client.get(f"/api/job-candidates?comp_id={ObjectId()}")

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1 and rows[0]["cand_full_name"] == "Jane"
    # The jobs query used the JWT comp, not the query param.
    assert mock_db.jobs.find.call_args.args[0] == {"comp_id": comp_id}


# ── 6. create-for-job: job ownership validation ──────────────────────────────


def _create_for_job_payload(job_id: str) -> dict:
    return {
        "cand_full_name": "Jane Smith",
        "cand_email": "jane@example.com",
        "cand_phone": None,
        "cand_cv_url": None,
        "cand_cover_letter_url": None,
        "comp_id": "ignored-by-server",
        "job_id": job_id,
        "interviewer_user_id": None,
        "scheduled_at": None,
    }


def test_create_for_job_garbage_job_id_is_404(authed):
    _, client = authed
    with patch("routes.cand.get_db", return_value=MagicMock()):
        response = client.post(
            "/api/candidates/create-for-job",
            json=_create_for_job_payload("not-an-objectid"),
        )
    assert response.status_code == 404


def test_create_for_job_foreign_job_is_404(authed):
    _, client = authed
    mock_db = MagicMock()
    mock_db.jobs.find_one = AsyncMock(return_value=None)

    with patch("routes.cand.get_db", return_value=mock_db):
        response = client.post(
            "/api/candidates/create-for-job",
            json=_create_for_job_payload(str(ObjectId())),
        )

    assert response.status_code == 404
    mock_db.candidates.insert_one.assert_not_called()
