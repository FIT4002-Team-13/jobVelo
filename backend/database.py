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
    assert mongo.db is not None, "Mongo not initialised - call connect_to_mongo()"
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
