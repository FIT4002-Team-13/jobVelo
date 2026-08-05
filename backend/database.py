"""MongoDB connection + index setup.

No mock data is seeded - all jobs, candidates, and link rows are created
via the real API endpoints. The dashboard shows empty-state messaging
when collections are empty.
"""

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ConfigurationError, PyMongoError, ServerSelectionTimeoutError

from config import settings


class _Mongo:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None


mongo = _Mongo()


async def connect_to_mongo() -> None:
    try:
        mongo.client = AsyncIOMotorClient(
            settings.mongodb_uri,
            tls=True,
            tlsCAFile=certifi.where(),
        )
        mongo.db = mongo.client[settings.mongodb_db]
    except (ConfigurationError, ServerSelectionTimeoutError, PyMongoError, OSError) as exc:
        mongo.client = None
        mongo.db = None
        raise RuntimeError("Unable to connect to MongoDB") from exc


async def close_mongo_connection() -> None:
    if mongo.client is not None:
        mongo.client.close()


def get_db() -> AsyncIOMotorDatabase:
    if mongo.db is None:
        raise RuntimeError("Mongo not initialised - call connect_to_mongo()")
    return mongo.db


async def ensure_indexes() -> None:
    """Create indexes that the application relies on. Idempotent.

    Add index definitions here as collections are introduced - keeping them
    in one place means a fresh deploy always provisions the right indexes.
    """
    db = get_db()

    # Users - unique constraints + fast lookup by either key during login.
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)
    await db.users.create_index("comp_id")  # list users in a company

    # Companies - email must be unique so we don't create duplicates.
    await db.companies.create_index("comp_email", unique=True)

    # Invitations - codes are unique, and we look them up constantly during
    # signup so the index is critical.
    await db.invitations.create_index("code", unique=True)
    await db.invitations.create_index([("comp_id", 1), ("created_at", -1)])

    # Jobs - scoped to a company, sorted by recent activity.
    await db.jobs.create_index([("comp_id", 1), ("job_last_update_datetime", -1)])
    await db.jobs.create_index("title")

    # Candidates - scoped to a company, deduped by email within a company.
    await db.candidates.create_index([("comp_id", 1), ("cand_email", 1)], unique=True)
    await db.candidates.create_index("cand_full_name")

    # Job-candidates link - the (cand_id, job_id) pair is logically unique.
    await db.job_candidates.create_index(
        [("cand_id", 1), ("job_id", 1)],
        unique=True,
    )
    await db.job_candidates.create_index("job_id")
    await db.job_candidates.create_index("cand_id")

    # Interviews - common lookups by candidate and job.
    await db.interviews.create_index("cand_id")
    await db.interviews.create_index("job_id")
    await db.interviews.create_index("intv_status")
    await db.interviews.create_index("intv_date_time")

    # Interview-Users - one user can only be linked once to the same interview.
    await db.user_interviews.create_index([("user_id", 1), ("intv_id", 1)], unique=True)
    await db.user_interviews.create_index("intv_id")
    await db.user_interviews.create_index("user_id")


# Stub kept so existing callers (main.py lifespan) don't break. Real seeding
# happens through the API now - this is intentionally a no-op.
async def seed_mock_data() -> None:
    return
