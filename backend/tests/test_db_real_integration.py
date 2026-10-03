"""Real database integration tests.

These tests connect to an actual MongoDB instance and verify that the
application's queries, data types, and constraints work against a real driver —
not an in-memory mock.

They are skipped automatically when TEST_MONGODB_URI is not set, so the
standard CI pipeline (which has no DB credentials) is never broken. A
dedicated CI job runs them with the secret injected.

Usage locally:
    TEST_MONGODB_URI="mongodb+srv://..." pytest -m db_integration backend/tests/
"""

import os
from datetime import datetime, timezone

import certifi
import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

import database as db_module
from database import ensure_indexes

TEST_URI = os.environ.get("TEST_MONGODB_URI", "")
TEST_DB_NAME = "jv_real_integration_tests"

pytestmark = pytest.mark.db_integration


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module", autouse=True)
def require_real_uri():
    if not TEST_URI:
        pytest.skip("TEST_MONGODB_URI not set — skipping real DB tests")


@pytest.fixture(scope="module")
async def real_db():
    """Connect to the test database, yield it, then drop it to clean up."""
    client = AsyncIOMotorClient(TEST_URI, tls=True, tlsCAFile=certifi.where())
    db = client[TEST_DB_NAME]

    # Point the application's db handle at our test database so ensure_indexes
    # and any route under test operate against isolated data.
    db_module.mongo.client = client
    db_module.mongo.db = db

    yield db

    await client.drop_database(TEST_DB_NAME)
    client.close()
    db_module.mongo.client = None
    db_module.mongo.db = None


# ── Connection ────────────────────────────────────────────────────────────────


async def test_database_is_reachable(real_db):
    """Ping the server — fails immediately if the URI is wrong or the cluster
    is unreachable, rather than silently passing like the mocked suite does."""
    result = await db_module.mongo.client.admin.command("ping")
    assert result.get("ok") == 1.0


# ── Indexes ───────────────────────────────────────────────────────────────────


async def test_ensure_indexes_runs_without_error(real_db):
    """ensure_indexes() must complete against a real collection without raising.
    This catches typos in collection names or conflicting index options that
    mongomock silently ignores."""
    await ensure_indexes()


async def test_users_unique_email_index_exists(real_db):
    """The unique email index on users must be present after ensure_indexes()."""
    await ensure_indexes()
    indexes = await real_db.users.index_information()
    unique_email = any(
        info.get("unique") and any(k == "email" for k, _ in info["key"])
        for info in indexes.values()
    )
    assert unique_email, "No unique index found on users.email"


async def test_job_candidates_compound_unique_index_exists(real_db):
    """The (cand_id, job_id) unique index on job_candidates must exist."""
    await ensure_indexes()
    indexes = await real_db.job_candidates.index_information()
    keys_in_indexes = [tuple(info["key"]) for info in indexes.values()]
    assert (("cand_id", 1), ("job_id", 1)) in keys_in_indexes, (
        "Compound unique index (cand_id, job_id) missing from job_candidates"
    )


# ── Write / read roundtrip ────────────────────────────────────────────────────


async def test_candidate_write_read_roundtrip(real_db):
    """Insert a candidate document and read it back — verifies that field names
    and values survive the serialisation round-trip with a real driver."""
    comp_id = ObjectId()
    doc = {
        "cand_full_name": "Integration Test Candidate",
        "cand_email": "integration_test_unique@example.com",
        "comp_id": comp_id,
        "cand_created_at": datetime.now(timezone.utc),
    }

    result = await real_db.candidates.insert_one(doc)
    assert result.inserted_id is not None

    fetched = await real_db.candidates.find_one({"_id": result.inserted_id})
    assert fetched is not None
    assert fetched["cand_full_name"] == "Integration Test Candidate"
    assert fetched["cand_email"] == "integration_test_unique@example.com"
    # comp_id must be stored as ObjectId, not a string — a mismatch here
    # causes every tenancy query to silently return zero rows in production.
    assert isinstance(fetched["comp_id"], ObjectId)
    assert fetched["comp_id"] == comp_id


# ── Constraint enforcement ────────────────────────────────────────────────────


async def test_unique_company_email_constraint_enforced(real_db):
    """Inserting two companies with the same email must raise a duplicate key
    error — proving the unique index is actually active on the real cluster."""
    from pymongo.errors import DuplicateKeyError

    await ensure_indexes()

    email = "duplicate_test@example.com"
    await real_db.companies.insert_one({"comp_email": email, "name": "Company A"})

    with pytest.raises(DuplicateKeyError):
        await real_db.companies.insert_one({"comp_email": email, "name": "Company B"})


async def test_unique_invitation_code_constraint_enforced(real_db):
    """Two invitations with the same code must raise a duplicate key error."""
    from pymongo.errors import DuplicateKeyError

    await ensure_indexes()

    code = "INVITE-DUPE-TEST"
    await real_db.invitations.insert_one({"code": code, "comp_id": ObjectId()})

    with pytest.raises(DuplicateKeyError):
        await real_db.invitations.insert_one({"code": code, "comp_id": ObjectId()})
