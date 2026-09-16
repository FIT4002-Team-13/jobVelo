"""Integration tests for candidate routes.

These tests run against an in-memory MongoDB (mongomock-motor). The key
difference from the mock tests in test_cand.py is that the actual query
logic, field names, and multi-collection flows are all exercised here.
"""

from datetime import datetime, timezone
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
    """Injects an in-memory MongoDB so routes never touch the real Atlas cluster.

    patch.object replaces database.mongo.db so that get_db() (called directly
    inside route handlers) returns our mock instead of the real connection.
    httpx.AsyncClient runs the ASGI app in the same event loop as the test,
    avoiding the cross-thread state issues that come with TestClient.
    """
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
    """db_client + a fake comp_id bypassing JWT auth."""
    client, db = db_client
    comp_id = ObjectId()
    app.dependency_overrides[get_current_comp_id] = lambda: comp_id
    yield client, db, comp_id


# ── 1. Status rollup ──────────────────────────────────────────────────────────
# GET /api/candidates runs three queries across candidates, job_candidates,
# and interviews and collapses them into a single cand_status per row.
# A mock test can't exercise this — it hardcodes what each query returns.


async def test_status_rollup_scheduled_beats_evaluated(authed_db_client):
    """SCHEDULED must win over EVALUATED when a candidate has both."""
    client, db, comp_id = authed_db_client
    now = datetime.now(timezone.utc)
    cand_id = ObjectId()

    await db.candidates.insert_one(
        {
            "_id": cand_id,
            "cand_full_name": "Jane Smith",
            "cand_email": "jane@example.com",
            "cand_phone": None,
            "cand_cv_url": None,
            "cand_cover_letter_url": None,
            "comp_id": comp_id,
            "cand_created_at": now,
            "cand_updated_at": now,
        }
    )
    await db.job_candidates.insert_one({"cand_id": str(cand_id), "job_id": "job1"})
    await db.interviews.insert_one(
        {"cand_id": str(cand_id), "job_id": "job1", "intv_status": "evaluated"}
    )
    await db.interviews.insert_one(
        {"cand_id": str(cand_id), "job_id": "job2", "intv_status": "scheduled"}
    )

    response = await client.get("/api/candidates")

    assert response.status_code == 200
    assert response.json()[0]["cand_status"] == "SCHEDULED"


async def test_status_rollup_no_interview_gives_not_scheduled(authed_db_client):
    """A candidate linked to a job but with no interview should be NOT SCHEDULED."""
    client, db, comp_id = authed_db_client
    now = datetime.now(timezone.utc)
    cand_id = ObjectId()

    await db.candidates.insert_one(
        {
            "_id": cand_id,
            "cand_full_name": "Bob Jones",
            "cand_email": "bob@example.com",
            "cand_phone": None,
            "cand_cv_url": None,
            "cand_cover_letter_url": None,
            "comp_id": comp_id,
            "cand_created_at": now,
            "cand_updated_at": now,
        }
    )
    await db.job_candidates.insert_one({"cand_id": str(cand_id), "job_id": "job1"})

    response = await client.get("/api/candidates")

    assert response.status_code == 200
    assert response.json()[0]["cand_status"] == "NOT SCHEDULED"


async def test_status_rollup_profile_only_gives_none(authed_db_client):
    """A candidate with no job link at all should have cand_status = null."""
    client, db, comp_id = authed_db_client
    now = datetime.now(timezone.utc)

    await db.candidates.insert_one(
        {
            "_id": ObjectId(),
            "cand_full_name": "No Links",
            "cand_email": "nolinks@example.com",
            "cand_phone": None,
            "cand_cv_url": None,
            "cand_cover_letter_url": None,
            "comp_id": comp_id,
            "cand_created_at": now,
            "cand_updated_at": now,
        }
    )

    response = await client.get("/api/candidates")

    assert response.status_code == 200
    assert response.json()[0]["cand_status"] is None


# ── 2. Duplicate email enforcement ────────────────────────────────────────────
# The route queries the DB for an existing candidate before inserting.
# With mocks you'd have to pre-configure the find_one return value —
# here the check runs against real stored data.


async def test_create_candidate_duplicate_email_returns_400(authed_db_client):
    """Second POST with the same email in the same company must be rejected."""
    client, db, comp_id = authed_db_client
    now = datetime.now(timezone.utc)

    await db.candidates.insert_one(
        {
            "_id": ObjectId(),
            "cand_full_name": "Alice",
            "cand_email": "alice@example.com",
            "comp_id": comp_id,
            "cand_created_at": now,
            "cand_updated_at": now,
        }
    )

    response = await client.post(
        "/api/candidates",
        json={
            "cand_full_name": "Alice Again",
            "cand_email": "alice@example.com",
            "comp_id": str(comp_id),
        },
    )

    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


async def test_create_candidate_same_email_different_company_is_allowed(
    authed_db_client,
):
    """Same email in a different company must succeed — candidates are tenant-scoped."""
    client, db, comp_id = authed_db_client
    now = datetime.now(timezone.utc)

    await db.candidates.insert_one(
        {
            "_id": ObjectId(),
            "cand_full_name": "Alice Elsewhere",
            "cand_email": "alice@example.com",
            "comp_id": ObjectId(),  # different company
            "cand_created_at": now,
            "cand_updated_at": now,
        }
    )

    response = await client.post(
        "/api/candidates",
        json={
            "cand_full_name": "Alice Here",
            "cand_email": "alice@example.com",
            "comp_id": str(comp_id),
        },
    )

    assert response.status_code == 201


# ── 3. create-for-job multi-step flow ─────────────────────────────────────────
# This route touches candidates, job_candidates, and interviews in sequence.
# We verify what actually landed in each collection, not just what the route
# returned — a mock test can't do this.


async def test_create_for_job_writes_candidate_and_link(authed_db_client):
    """A new candidate + job link are both written to the DB."""
    client, db, comp_id = authed_db_client
    job_id = str(ObjectId())
    await db.jobs.insert_one(
        {"_id": ObjectId(job_id), "comp_id": comp_id, "title": "Test Job"}
    )

    response = await client.post(
        "/api/candidates/create-for-job",
        json={
            "cand_full_name": "New Person",
            "cand_email": "new@example.com",
            "comp_id": str(comp_id),
            "job_id": job_id,
        },
    )

    assert response.status_code == 201
    assert await db.candidates.find_one({"cand_email": "new@example.com"}) is not None
    assert await db.job_candidates.find_one({"job_id": job_id}) is not None


async def test_create_for_job_reuses_existing_candidate(authed_db_client):
    """Same email across two jobs creates one candidate doc, not two."""
    client, db, comp_id = authed_db_client
    job_id_1 = str(ObjectId())
    job_id_2 = str(ObjectId())
    await db.jobs.insert_one(
        {"_id": ObjectId(job_id_1), "comp_id": comp_id, "title": "Job 1"}
    )
    await db.jobs.insert_one(
        {"_id": ObjectId(job_id_2), "comp_id": comp_id, "title": "Job 2"}
    )

    await client.post(
        "/api/candidates/create-for-job",
        json={
            "cand_full_name": "Existing Person",
            "cand_email": "existing@example.com",
            "comp_id": str(comp_id),
            "job_id": job_id_1,
        },
    )
    await client.post(
        "/api/candidates/create-for-job",
        json={
            "cand_full_name": "Existing Person",
            "cand_email": "existing@example.com",
            "comp_id": str(comp_id),
            "job_id": job_id_2,
        },
    )

    docs = await db.candidates.find({"cand_email": "existing@example.com"}).to_list(10)
    assert len(docs) == 1


async def test_create_for_job_second_link_to_same_job_is_idempotent(authed_db_client):
    """Linking the same candidate to the same job twice must not duplicate the link row."""
    client, db, comp_id = authed_db_client
    job_id = str(ObjectId())
    await db.jobs.insert_one(
        {"_id": ObjectId(job_id), "comp_id": comp_id, "title": "Test Job"}
    )

    await client.post(
        "/api/candidates/create-for-job",
        json={
            "cand_full_name": "Repeat Person",
            "cand_email": "repeat@example.com",
            "comp_id": str(comp_id),
            "job_id": job_id,
        },
    )
    response = await client.post(
        "/api/candidates/create-for-job",
        json={
            "cand_full_name": "Repeat Person",
            "cand_email": "repeat@example.com",
            "comp_id": str(comp_id),
            "job_id": job_id,
        },
    )

    assert response.status_code == 201
    docs = await db.job_candidates.find({"job_id": job_id}).to_list(10)
    assert len(docs) == 1
