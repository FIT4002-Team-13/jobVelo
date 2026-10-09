"""Interview-consistency analytics is hiring-manager only.

The page exposes every interviewer's scores and bias flags, so the API must
refuse other roles itself - hiding the sidebar link isn't a gate.
Auth is faked via dependency overrides, same as test_auth_tenancy.py.
"""

from unittest.mock import MagicMock, patch

import pytest
from bson import ObjectId

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
