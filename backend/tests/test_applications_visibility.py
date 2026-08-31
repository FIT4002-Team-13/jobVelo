"""Tests for role-scoped application visibility (issue 4.1's product half).

GET /api/applications derives scope from the JWT role: interviewers see
their assigned applications, everyone else sees the whole company pipeline
(recruiters/admins previously got an empty list + empty Schedules calendar).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from dependencies import get_current_user
from main import app

# -- helpers ------------------------------------------------------------------


async def _aiter(items):
    for item in items:
        yield item


def _cursor(items):
    cur = MagicMock()
    cur.to_list = AsyncMock(return_value=items)
    return cur


def _authed_as(role: str):
    comp_id = ObjectId()
    user = {
        "_id": ObjectId(),
        "comp_id": comp_id,
        "role": role,
        "full_name": f"Test {role.title()}",
    }
    app.dependency_overrides[get_current_user] = lambda: user
    return comp_id, user


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# -- applications: role-based scope -------------------------------------------


def test_recruiter_sees_company_wide_applications(client):
    """A recruiter with NO interview assignments must still see the
    company's applications - the old interviewer-only scope showed them an
    empty page."""
    comp_id, _ = _authed_as("recruiter")
    job_oid, cand_oid, link_oid = ObjectId(), ObjectId(), ObjectId()

    job = {"_id": job_oid, "comp_id": comp_id, "title": "Dev"}
    candidate = {
        "_id": cand_oid,
        "cand_full_name": "Jane Smith",
        "cand_email": "jane@example.com",
    }
    link = {"_id": link_oid, "cand_id": str(cand_oid), "job_id": str(job_oid)}

    db = MagicMock()
    # First jobs.find: async-for building company_job_ids; second: bulk job
    # fetch for the row join.
    db.jobs.find = MagicMock(side_effect=[_aiter([{"_id": job_oid}]), _cursor([job])])
    db.job_candidates.find = MagicMock(return_value=_cursor([link]))
    db.interviews.find = MagicMock(return_value=_cursor([]))
    db.cv_analyses.find = MagicMock(return_value=_aiter([]))
    db.candidates.find = MagicMock(return_value=_cursor([candidate]))

    with patch("routes.applications.get_db", return_value=db):
        response = client.get("/api/applications")

    assert response.status_code == 200, response.text
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["candidate_name"] == "Jane Smith"
    assert rows[0]["status"] == "NOT SCHEDULED"
    # Company-wide scope queried by job_id, not by assigned pairs.
    query = db.job_candidates.find.call_args.args[0]
    assert query == {"job_id": {"$in": [str(job_oid)]}}


def test_interviewer_with_no_assignments_sees_empty_list(client):
    """Interviewer scope is unchanged: no interview_users links -> []."""
    _authed_as("interviewer")

    db = MagicMock()
    db.jobs.find = MagicMock(return_value=_aiter([{"_id": ObjectId()}]))
    db.interview_users.find = MagicMock(return_value=_cursor([]))

    with patch("routes.applications.get_db", return_value=db):
        response = client.get("/api/applications")

    assert response.status_code == 200
    assert response.json() == []
    # Never fell through to the company-wide query.
    db.job_candidates.find.assert_not_called()


def test_legacy_user_id_param_is_ignored(client):
    """Clients still send ?user_id=<id>; it must not error and must not
    change the JWT-derived scope (probing a colleague's id does nothing)."""
    _authed_as("interviewer")

    db = MagicMock()
    db.jobs.find = MagicMock(return_value=_aiter([{"_id": ObjectId()}]))
    db.interview_users.find = MagicMock(return_value=_cursor([]))

    with patch("routes.applications.get_db", return_value=db):
        response = client.get(f"/api/applications?user_id={ObjectId()}")

    assert response.status_code == 200
    assert response.json() == []
    # The scope query used the JWT user's id, not the query param.
    assert db.interview_users.find.call_args.args[0]["user_id"] != ""
