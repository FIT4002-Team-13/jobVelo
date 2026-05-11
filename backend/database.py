from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import settings


class _Mongo:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None


mongo = _Mongo()


async def connect_to_mongo() -> None:
    mongo.client = AsyncIOMotorClient(settings.mongodb_uri)
    mongo.db = mongo.client[settings.mongodb_db]


async def close_mongo_connection() -> None:
    if mongo.client is not None:
        mongo.client.close()


def get_db() -> AsyncIOMotorDatabase:
    assert mongo.db is not None, "Mongo not initialised — call connect_to_mongo()"
    return mongo.db


async def ensure_indexes() -> None:
    """Create indexes that the application relies on. Idempotent.

    Add index definitions here as collections are introduced — keeping them
    in one place means a fresh deploy always provisions the right indexes.
    """
    db = get_db()
    # Example:
    # await _db.users.create_index("email", unique=True)

    # Interviews - common lookups by candidate and job.
    await db.interviews.create_index("cand_id")
    await db.interviews.create_index("job_id")
    await db.interviews.create_index("intv_status")
    await db.interviews.create_index("intv_date_time")

    # Interview-Users - one user can only be linked once to the same interview.
    await db.user_interviews.create_index([("user_id", 1), ("intv_id", 1)], unique=True)
    await db.user_interviews.create_index("intv_id")
    await db.user_interviews.create_index("user_id")
