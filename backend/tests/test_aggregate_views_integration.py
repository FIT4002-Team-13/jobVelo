"""Integration tests for the Phase-B aggregate "view" endpoints.

These collapse the frontend's per-screen request waterfalls into one call:
  GET /api/interviews/{id}/context
  GET /api/candidates/{cand_id}/detail?job_id=...
  GET /api/users/{user_id}

Style matches test_interview_integration.py: mongomock-motor DB, auth faked
via dependency overrides.
"""

from datetime import datetime, timezone
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


_RATINGS = {
    "technical_skills": {"skill": "Technical Skills", "score": 8.0},
    "communication": {"skill": "Communication", "score": 7.0},
    "problem_solving": {"skill": "Problem Solving", "score": 6.5},
}


async def _seed_full_chain(db, comp_id, *, cross_tenant_job=False):
    """Insert job + candidate + job_candidate + interview + interview_users +
    user + cv_analysis and return the ids as strings."""
    now = datetime.now(timezone.utc)
    job_id = ObjectId()
    cand_id = ObjectId()
    jobcand_id = ObjectId()
    intv_id = ObjectId()
    user_id = ObjectId()

    await db.jobs.insert_one(
        {
            "_id": job_id,
            "comp_id": ObjectId() if cross_tenant_job else comp_id,
            "title": "Staff Engineer",
        }
    )
    await db.candidates.insert_one(
        {
            "_id": cand_id,
            "comp_id": comp_id,
            "cand_full_name": "Ada Lovelace",
            "cand_email": "ada@example.com",
            "cand_cv_url": "uploads/ada-cv.pdf",
            "cand_created_at": now,
            "cand_updated_at": now,
        }
    )
    await db.job_candidates.insert_one(
        {
            "_id": jobcand_id,
            "cand_id": str(cand_id),
            "job_id": str(job_id),
            "status": "EVALUATED",
            "ratings": _RATINGS,
            "rank": 1,
            "plan_sections": [{"name": "Intro", "suggested_minutes": 10}],
            "created_at": now,
            "updated_at": now,
        }
    )
    await db.interviews.insert_one(
        {
            "_id": intv_id,
            "cand_id": str(cand_id),
            "job_id": str(job_id),
            "intv_status": "scheduled",
            "intv_created_at": now,
            "intv_updated_at": now,
        }
    )
    await db.users.insert_one(
        {
            "_id": user_id,
            "comp_id": comp_id,
            "username": "grace",
            "full_name": "Grace Hopper",
            "email": "grace@example.com",
            "role": "interviewer",
            "created_at": now,
        }
    )
    await db.interview_users.insert_one(
        {"_id": ObjectId(), "intv_id": str(intv_id), "user_id": str(user_id)}
    )
    await db.cv_analyses.insert_one(
        {
            "_id": ObjectId(),
            "jobcand_id": str(jobcand_id),
            "status": "completed",
            "position_title": "Staff Engineer",
            "cv_path": "uploads/ada-cv.pdf",
            "created_at": now,
        }
    )
    return {
        "job_id": str(job_id),
        "cand_id": str(cand_id),
        "jobcand_id": str(jobcand_id),
        "intv_id": str(intv_id),
        "user_id": str(user_id),
    }


# ── GET /api/interviews/{id}/context ────────────────────────────────────────


async def test_interview_context_bundles_every_related_slice(db_client):
    client, db, comp_id = db_client
    ids = await _seed_full_chain(db, comp_id)

    r = await client.get(f"/api/interviews/{ids['intv_id']}/context")

    assert r.status_code == 200
    body = r.json()
    assert body["interview"]["intv_id"] == ids["intv_id"]
    assert body["job"]["title"] == "Staff Engineer"
    assert body["candidate"]["cand_full_name"] == "Ada Lovelace"
    assert body["candidate"]["cand_cv_url"] == "uploads/ada-cv.pdf"
    assert body["job_candidate"]["jobcand_id"] == ids["jobcand_id"]
    assert body["job_candidate"]["rank"] == 1
    assert body["job_candidate"]["ratings"]["communication"]["score"] == 7.0
    assert body["cv_analysis"]["jobcand_id"] == ids["jobcand_id"]
    assert body["interviewer"] == {"user_id": ids["user_id"], "full_name": "Grace Hopper"}


async def test_interview_context_degrades_when_related_docs_missing(db_client):
    client, db, comp_id = db_client
    now = datetime.now(timezone.utc)
    job_id = ObjectId()
    intv_id = ObjectId()
    await db.jobs.insert_one({"_id": job_id, "comp_id": comp_id, "title": "Solo Role"})
    await db.interviews.insert_one(
        {
            "_id": intv_id,
            "cand_id": str(ObjectId()),
            "job_id": str(job_id),
            "intv_status": "scheduled",
            "intv_created_at": now,
            "intv_updated_at": now,
        }
    )

    r = await client.get(f"/api/interviews/{intv_id}/context")

    assert r.status_code == 200
    body = r.json()
    assert body["job"]["title"] == "Solo Role"
    assert body["candidate"] is None
    assert body["job_candidate"] is None
    assert body["cv_analysis"] is None
    assert body["interviewer"] is None


async def test_interview_context_cross_tenant_is_404(db_client):
    client, db, comp_id = db_client
    ids = await _seed_full_chain(db, comp_id, cross_tenant_job=True)

    r = await client.get(f"/api/interviews/{ids['intv_id']}/context")

    assert r.status_code == 404


# ── GET /api/candidates/{cand_id}/detail ────────────────────────────────────


async def test_candidate_detail_bundles_every_related_slice(db_client):
    client, db, comp_id = db_client
    ids = await _seed_full_chain(db, comp_id)

    r = await client.get(
        f"/api/candidates/{ids['cand_id']}/detail", params={"job_id": ids["job_id"]}
    )

    assert r.status_code == 200
    body = r.json()
    assert body["candidate"]["cand_id"] == ids["cand_id"]
    assert body["job"] == {"job_id": ids["job_id"], "title": "Staff Engineer"}
    assert body["job_candidate"]["rank"] == 1
    assert body["interview"]["intv_id"] == ids["intv_id"]
    assert body["interviewer"]["full_name"] == "Grace Hopper"
    assert body["cv_analysis"]["jobcand_id"] == ids["jobcand_id"]


async def test_candidate_detail_requires_job_id(db_client):
    client, _db, _comp_id = db_client
    r = await client.get(f"/api/candidates/{ObjectId()}/detail")
    assert r.status_code == 422


async def test_candidate_detail_unknown_job_is_404(db_client):
    client, db, comp_id = db_client
    now = datetime.now(timezone.utc)
    cand_id = ObjectId()
    await db.candidates.insert_one(
        {
            "_id": cand_id,
            "comp_id": comp_id,
            "cand_full_name": "No Job",
            "cand_email": "nojob@example.com",
            "cand_created_at": now,
            "cand_updated_at": now,
        }
    )

    r = await client.get(
        f"/api/candidates/{cand_id}/detail", params={"job_id": str(ObjectId())}
    )

    assert r.status_code == 404


async def test_candidate_detail_cross_tenant_candidate_is_404(db_client):
    client, db, _comp_id = db_client
    other_cand = ObjectId()
    await db.candidates.insert_one(
        {"_id": other_cand, "comp_id": ObjectId(), "cand_full_name": "Theirs"}
    )
    r = await client.get(
        f"/api/candidates/{other_cand}/detail", params={"job_id": str(ObjectId())}
    )
    assert r.status_code == 404


# ── GET /api/users/{user_id} ────────────────────────────────────────────────


async def test_get_user_returns_teammate(db_client):
    client, db, comp_id = db_client
    ids = await _seed_full_chain(db, comp_id)

    r = await client.get(f"/api/users/{ids['user_id']}")

    assert r.status_code == 200
    body = r.json()
    assert body["userid"] == ids["user_id"]
    assert body["full_name"] == "Grace Hopper"
    assert body["role"] == "interviewer"
    assert "password_hash" not in body


async def test_get_user_cross_tenant_is_404(db_client):
    client, db, _comp_id = db_client
    now = datetime.now(timezone.utc)
    other = ObjectId()
    await db.users.insert_one(
        {
            "_id": other,
            "comp_id": ObjectId(),
            "username": "outsider",
            "full_name": "Out Sider",
            "email": "out@example.com",
            "role": "recruiter",
            "created_at": now,
        }
    )

    r = await client.get(f"/api/users/{other}")

    assert r.status_code == 404


async def test_get_user_invalid_id_is_400(db_client):
    client, _db, _comp_id = db_client
    r = await client.get("/api/users/not-an-oid")
    assert r.status_code == 400
