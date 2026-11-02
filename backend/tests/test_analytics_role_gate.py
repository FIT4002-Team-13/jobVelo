"""Interview-consistency analytics is hiring-manager only.

The page exposes every interviewer's scores and bias flags, so the API must
refuse other roles itself - hiding the sidebar link isn't a gate.
Auth is faked via dependency overrides, same as test_auth_tenancy.py.
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import httpx
import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from dependencies import get_current_user
from main import app

URL = "/api/analytics/interview-consistency"


async def _aiter(items):
    for item in items:
        yield item


def _as(role):
    app.dependency_overrides[get_current_user] = lambda: {
        "_id": ObjectId(),
        "comp_id": ObjectId(),
        "role": role,
        "full_name": "Test User",
    }


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["admin", "interviewer", "recruiter"])
def test_other_roles_are_403_and_never_touch_the_db(client, role):
    _as(role)
    with patch("routes.analytics.get_db") as get_db:
        res = client.get(URL)

    assert res.status_code == 403
    assert "hiring_manager" in res.json()["detail"]
    get_db.assert_not_called()


def test_anonymous_is_401(client):
    assert client.get(URL).status_code == 401


def test_hiring_manager_is_allowed(client):
    _as("hiring_manager")
    db = MagicMock()
    db.jobs.find = MagicMock(return_value=_aiter([]))  # company with no jobs -> empty
    with patch("routes.analytics.get_db", return_value=db):
        res = client.get(URL)

    assert res.status_code == 200
    assert res.json()["interviewers"] == []


async def test_ratings_are_matched_to_each_interviews_cand_job_pair():
    """The job_candidates lookup is one batched query; each interview must
    still pick up the ratings for its own (cand_id, job_id) pair."""
    db = AsyncMongoMockClient()["testdb"]
    comp_id = ObjectId()
    job_a, job_b, cand_1, cand_2 = (str(ObjectId()) for _ in range(4))
    await db.jobs.insert_many(
        [
            {"_id": ObjectId(job_a), "comp_id": comp_id},
            {"_id": ObjectId(job_b), "comp_id": comp_id},
        ]
    )
    now = datetime.now(UTC)
    await db.interviews.insert_many(
        [
            {
                "cand_id": cand_1,
                "job_id": job_a,
                "intv_status": "completed",
                "intv_date_time": now,
            },
            {
                "cand_id": cand_2,
                "job_id": job_b,
                "intv_status": "completed",
                "intv_date_time": now,
            },
        ]
    )

    def _rated(score):
        return {"technical_skills": {"score": score}}

    await db.job_candidates.insert_many(
        [
            {"cand_id": cand_1, "job_id": job_a, "ratings": _rated(5)},
            # Decoys sharing only the candidate or only the job with the
            # unrated cand_2/job_b interview: neither may count for it.
            {"cand_id": cand_2, "job_id": job_a, "ratings": _rated(1)},
            {"cand_id": cand_1, "job_id": job_b, "ratings": _rated(3)},
        ]
    )
    app.dependency_overrides[get_current_user] = lambda: {
        "_id": ObjectId(),
        "comp_id": comp_id,
        "role": "hiring_manager",
    }
    with patch("routes.analytics.get_db", return_value=db):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            res = await client.get(URL)

    assert res.status_code == 200
    assert res.json()["kpis"]["evaluated_count"] == 1
