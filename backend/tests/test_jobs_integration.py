"""Integration tests for job routes.

Tests run against an in-memory MongoDB (mongomock-motor) so no real Atlas
cluster is touched. The same patch.object + httpx.AsyncClient pattern used
in test_cand_integration.py is applied here for consistency.
"""

from unittest.mock import patch

import httpx
import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

import database as db_module
from dependencies import get_current_comp_id
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


@pytest.fixture
async def authed_db_client(db_client):
    client, db = db_client
    comp_id = ObjectId()
    app.dependency_overrides[get_current_comp_id] = lambda: comp_id
    yield client, db, comp_id


# ── Helpers ───────────────────────────────────────────────────────────────────


def _valid_job_payload(comp_id) -> dict:
    return {
        "comp_id": str(comp_id),
        "title": "Senior Backend Engineer",
        "description": "Build scalable APIs",
        "employment_type": ["Full-Time"],
        "recruitment_start": "2026-09-01",
        "recruitment_end": "2026-10-01",
        "candidates_total": 3,
        "salary": "120000",
        "salary_type": "Annual",
    }


# ── Job creation ───────────────────────────────────────────────────────────────


async def test_create_job_succeeds(authed_db_client):
    """POST /api/jobs with valid fields creates the job and returns 201."""
    client, db, comp_id = authed_db_client

    response = await client.post("/api/jobs", json=_valid_job_payload(comp_id))

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Senior Backend Engineer"
    assert body["comp_id"] == str(comp_id)
    assert body["status"] == "Pending"

    # Confirm the doc actually landed in the DB.
    doc = await db.jobs.find_one({"title": "Senior Backend Engineer"})
    assert doc is not None
    assert doc["comp_id"] == comp_id  # stored as ObjectId, not string


async def test_job_description_stored_exactly_as_pasted(authed_db_client):
    """Description text is stored and returned verbatim — no trimming or mangling."""
    client, db, comp_id = authed_db_client

    pasted_description = (
        "About the role:\n\n"
        "  • Lead backend architecture decisions\n"
        "  • Mentor junior engineers\n\n"
        "Requirements:\n"
        "  - 5+ years Python experience\n"
        "  - Strong SQL & NoSQL fundamentals\n"
        "  - Salary: $120,000 – $150,000"
    )

    payload = _valid_job_payload(comp_id)
    payload["description"] = pasted_description

    response = await client.post("/api/jobs", json=payload)

    assert response.status_code == 201
    assert response.json()["description"] == pasted_description

    doc = await db.jobs.find_one({"title": payload["title"]})
    assert doc["description"] == pasted_description


@pytest.mark.parametrize(
    "missing_field,override",
    [
        ("title", None),  # title omitted entirely
        ("title", {"title": ""}),  # title present but empty string
        ("recruitment_start", None),  # start date omitted
        ("recruitment_end", None),  # end date omitted
    ],
)
async def test_create_job_blocked_when_required_fields_missing(
    authed_db_client, missing_field, override
):
    """POST /api/jobs must return 422 when a required field is absent or empty."""
    client, db, comp_id = authed_db_client

    payload = _valid_job_payload(comp_id)
    if override is not None:
        payload.update(override)
    else:
        payload.pop(missing_field)

    response = await client.post("/api/jobs", json=payload)

    assert response.status_code == 422

    # Nothing must have been written to the DB.
    count = await db.jobs.count_documents({})
    assert count == 0
