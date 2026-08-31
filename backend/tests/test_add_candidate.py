"""Contract tests for POST /api/jobs/{job_id}/candidates (issue 2.5).

The Jobs-page Add Candidate modal used to send `interviewer: "<name>"`,
which Pydantic silently dropped - no interview was ever created and the
response hardcoded status "SCHEDULED". The endpoint now keys off
`interviewer_user_id`, validates it against the caller's company, creates
the interview + interview_users link, and returns the same flat row shape
as GET /{job_id}/candidates so the optimistic table row matches a refresh.

jobs.py resolves the DB via Depends(get_db), so these tests override the
dependency instead of patching the module attribute.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from database import get_db
from dependencies import get_current_user
from main import app

# -- helpers ------------------------------------------------------------------


async def _aiter(items):
    for item in items:
        yield item


def _cursor(items):
    """Mock for `collection.find(...).to_list(...)` call chains."""
    cur = MagicMock()
    cur.to_list = AsyncMock(return_value=items)
    return cur


def _insert_result(oid: ObjectId) -> MagicMock:
    result = MagicMock()
    result.inserted_id = oid
    return result


@pytest.fixture()
def authed(client):
    comp_id = ObjectId()
    user = {
        "_id": ObjectId(),
        "comp_id": comp_id,
        "role": "recruiter",
        "full_name": "Test Recruiter",
    }
    app.dependency_overrides[get_current_user] = lambda: user
    yield comp_id, client
    app.dependency_overrides.clear()


def _payload(**overrides) -> dict:
    body = {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "phone": None,
        "cv_url": None,
        "cover_letter_url": None,
        "interviewer_user_id": None,
        "scheduled_at": None,
    }
    body.update(overrides)
    return body


def _base_db(comp_id: ObjectId, job_oid: ObjectId):
    """DB primed for the create-new-candidate, create-new-link happy path."""
    now = datetime.now(timezone.utc)
    cand_oid, link_oid, intv_oid = ObjectId(), ObjectId(), ObjectId()

    job = {"_id": job_oid, "comp_id": comp_id, "title": "Dev", "status": "Pending"}
    new_link = {
        "_id": link_oid,
        "cand_id": str(cand_oid),
        "job_id": str(job_oid),
        "score": None,
        "communication_score": None,
        "skill_score": None,
        "problem_solving_score": None,
        "created_at": now,
        "updated_at": now,
    }

    db = MagicMock()
    db.jobs.find_one = AsyncMock(return_value=job)
    db.jobs.find_one_and_update = AsyncMock(return_value=job)
    db.candidates.find_one = AsyncMock(return_value=None)  # no email reuse
    db.candidates.insert_one = AsyncMock(return_value=_insert_result(cand_oid))
    # First find_one: existing-link check (None); second: read-back of the row.
    db.job_candidates.find_one = AsyncMock(side_effect=[None, new_link])
    db.job_candidates.insert_one = AsyncMock(return_value=_insert_result(link_oid))
    db.job_candidates.count_documents = AsyncMock(return_value=1)
    db.job_candidates.aggregate.return_value = _aiter([])
    db.interviews.insert_one = AsyncMock(return_value=_insert_result(intv_oid))
    db.interview_users.insert_one = AsyncMock()
    return db, {"cand": cand_oid, "link": link_oid, "intv": intv_oid}


# -- the interviewer path actually creates the interview now ------------------


def test_add_with_interviewer_creates_interview_and_returns_real_status(authed):
    comp_id, client = authed
    job_oid = ObjectId()
    interviewer_oid = ObjectId()
    db, ids = _base_db(comp_id, job_oid)

    interviewer = {
        "_id": interviewer_oid,
        "comp_id": comp_id,
        "full_name": "Ivy Interviewer",
    }
    # Called twice: the up-front company check + the name lookup in _link_row.
    db.users.find_one = AsyncMock(return_value=interviewer)

    scheduled_interview = {
        "_id": ids["intv"],
        "cand_id": str(ids["cand"]),
        "job_id": str(job_oid),
        "intv_status": "scheduled",
        "intv_date_time": datetime.fromisoformat("2030-01-01T10:00"),
    }
    # First interviews.find: _job_stats (empty -> early return);
    # second: _link_row picking up the freshly created interview.
    db.interviews.find = MagicMock(
        side_effect=[_cursor([]), _cursor([scheduled_interview])]
    )
    db.interview_users.find_one = AsyncMock(
        return_value={"intv_id": str(ids["intv"]), "user_id": str(interviewer_oid)}
    )

    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.post(
            f"/api/jobs/{job_oid}/candidates",
            json=_payload(
                interviewer_user_id=str(interviewer_oid),
                scheduled_at="2030-01-01T10:00",
            ),
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 201, response.text
    row = response.json()["candidate"]
    # GET-shaped row, not the old hardcoded stub:
    assert row["status"] == "SCHEDULED"
    assert row["interviewer"] == "Ivy Interviewer"
    assert row["intv_completed"] is False
    assert row["scheduled_at"] is not None
    # The interview + interviewer link were really created.
    intv_doc = db.interviews.insert_one.call_args.args[0]
    assert intv_doc["intv_status"] == "scheduled"
    assert intv_doc["intv_date_time"] == datetime.fromisoformat("2030-01-01T10:00")
    iu_doc = db.interview_users.insert_one.call_args.args[0]
    assert iu_doc["user_id"] == str(interviewer_oid)
    assert iu_doc["intv_id"] == str(ids["intv"])


def test_add_without_interviewer_is_not_scheduled_and_creates_no_interview(authed):
    comp_id, client = authed
    job_oid = ObjectId()
    db, _ = _base_db(comp_id, job_oid)
    db.interviews.find = MagicMock(side_effect=[_cursor([]), _cursor([])])

    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.post(f"/api/jobs/{job_oid}/candidates", json=_payload())
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 201, response.text
    row = response.json()["candidate"]
    assert row["status"] == "NOT SCHEDULED"
    assert row["interviewer"] is None
    db.interviews.insert_one.assert_not_called()
    db.interview_users.insert_one.assert_not_called()


# -- interviewer validation happens before anything is created ----------------


def test_add_with_garbage_interviewer_id_is_400_and_creates_nothing(authed):
    comp_id, client = authed
    job_oid = ObjectId()
    db, _ = _base_db(comp_id, job_oid)

    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.post(
            f"/api/jobs/{job_oid}/candidates",
            json=_payload(interviewer_user_id="not-an-objectid"),
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 400
    db.candidates.insert_one.assert_not_called()
    db.job_candidates.insert_one.assert_not_called()
    db.interviews.insert_one.assert_not_called()


def test_add_with_foreign_interviewer_is_404_and_creates_nothing(authed):
    """The id parses but belongs to no user in the caller's company -
    another company's user id must not be attachable to our interview."""
    comp_id, client = authed
    job_oid = ObjectId()
    db, _ = _base_db(comp_id, job_oid)
    db.users.find_one = AsyncMock(return_value=None)  # comp filter excludes them

    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.post(
            f"/api/jobs/{job_oid}/candidates",
            json=_payload(interviewer_user_id=str(ObjectId())),
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 404
    db.candidates.insert_one.assert_not_called()
    db.job_candidates.insert_one.assert_not_called()
    db.interviews.insert_one.assert_not_called()


# -- re-adding an already-linked candidate reports its real state -------------


def test_add_existing_link_returns_current_status_not_hardcoded_scheduled(authed):
    """Rare case: adding a candidate who is already on the job. The old code
    answered status "SCHEDULED" no matter what; it must reflect reality
    (here: a completed interview)."""
    comp_id, client = authed
    job_oid, cand_oid, link_oid, intv_oid = (
        ObjectId(), ObjectId(), ObjectId(), ObjectId(),
    )

    job = {"_id": job_oid, "comp_id": comp_id, "title": "Dev", "status": "Pending"}
    candidate = {
        "_id": cand_oid,
        "comp_id": comp_id,
        "cand_full_name": "Jane Smith",
        "cand_email": "jane@example.com",
    }
    link = {"_id": link_oid, "cand_id": str(cand_oid), "job_id": str(job_oid)}
    completed = {
        "_id": intv_oid,
        "cand_id": str(cand_oid),
        "job_id": str(job_oid),
        "intv_status": "completed",
        "intv_date_time": datetime.fromisoformat("2026-01-01T10:00"),
    }

    db = MagicMock()
    db.jobs.find_one = AsyncMock(return_value=job)
    db.candidates.find_one = AsyncMock(return_value=candidate)
    db.candidates.update_one = AsyncMock()
    db.job_candidates.find_one = AsyncMock(return_value=link)
    db.interviews.find = MagicMock(return_value=_cursor([completed]))
    db.interview_users.find_one = AsyncMock(return_value=None)

    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.post(f"/api/jobs/{job_oid}/candidates", json=_payload())
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 201, response.text
    row = response.json()["candidate"]
    assert row["status"] == "COMPLETED"
    assert row["intv_completed"] is True
    assert row["intv_id"] == str(intv_oid)
    # No duplicate link or interview was created.
    db.job_candidates.insert_one.assert_not_called()
    db.interviews.insert_one.assert_not_called()
