"""Integration tests for interview routes.

TC-018 - Interview session starts and loads candidate data
TC-020 - Interview session start blocked if no candidate selected
"""

from unittest.mock import patch

import httpx
import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

import database as db_module
from dependencies import get_current_comp_id, get_current_user
from main import app


@pytest.fixture
async def db_client():
    mock_db = AsyncMongoMockClient()["testdb"]
    comp_id = ObjectId()
    fake_user = {"_id": ObjectId(), "comp_id": comp_id, "role": "interviewer"}
    with patch.object(db_module.mongo, "db", mock_db):
        app.dependency_overrides[get_current_user] = lambda: fake_user
        app.dependency_overrides[get_current_comp_id] = lambda: comp_id
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as c:
            yield c, mock_db, comp_id
    app.dependency_overrides.clear()


# ── TC-018 ─────────────────────────────────────────────────────────────────────


async def test_interview_session_starts_and_stores_candidate_data(db_client):
    """POST /api/interviews creates the session and persists it to the DB."""
    client, db, comp_id = db_client
    cand_id = str(ObjectId())
    job_id = str(ObjectId())
    await db.jobs.insert_one(
        {"_id": ObjectId(job_id), "comp_id": comp_id, "title": "Test Job"}
    )
    await db.candidates.insert_one({"_id": ObjectId(cand_id), "comp_id": comp_id})

    response = await client.post(
        "/api/interviews",
        json={
            "cand_id": cand_id,
            "job_id": job_id,
            "intv_date_time": "2026-09-15T10:00:00Z",
            "intv_location": "Room 3B",
            "intv_status": "scheduled",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["cand_id"] == cand_id
    assert body["job_id"] == job_id
    assert body["intv_status"] == "scheduled"
    assert body["intv_location"] == "Room 3B"

    doc = await db.interviews.find_one({"cand_id": cand_id, "job_id": job_id})
    assert doc is not None


# ── TC-020 ─────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("missing_field", ["cand_id", "job_id", "intv_date_time"])
async def test_interview_session_blocked_when_required_fields_missing(
    db_client, missing_field
):
    """POST /api/interviews must return 422 when a required field is absent."""
    client, db, _comp_id = db_client

    payload = {
        "cand_id": str(ObjectId()),
        "job_id": str(ObjectId()),
        "intv_date_time": "2026-09-15T10:00:00Z",
    }
    payload.pop(missing_field)

    response = await client.post("/api/interviews", json=payload)

    assert response.status_code == 422

    count = await db.interviews.count_documents({})
    assert count == 0
