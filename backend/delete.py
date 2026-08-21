import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "jobvelo")


async def main():
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[MONGODB_DB]

    result = await db.candidates.delete_many(
        {
            "$or": [
                {"cand_email": None},
                {"comp_id": None},
                {"cand_email": {"$exists": False}},
                {"comp_id": {"$exists": False}},
            ]
        }
    )

    print(f"Deleted {result.deleted_count} bad candidate documents.")
    client.close()


asyncio.run(main())
