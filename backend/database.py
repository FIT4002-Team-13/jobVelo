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
    await db.users.create_index("comp_id")  # list users in a company

    # Companies - email must be unique so we don't create duplicates.
    await db.companies.create_index("comp_email", unique=True)

    # Invitations - codes are unique, and we look them up constantly during
    # signup so the index is critical.
    await db.invitations.create_index("code", unique=True)
    await db.invitations.create_index([("comp_id", 1), ("created_at", -1)])

    await db.jobs.create_index("title")
    await db.candidates.create_index("name")

    # Candidates
    await db.candidates.create_index([("cand_email", 1), ("comp_id", 1)], unique=True)
    await db.candidates.create_index("comp_id")

    # Job-Candidates
    await db.job_candidates.create_index([("cand_id", 1), ("job_id", 1)], unique=True)
    await db.job_candidates.create_index("job_id")

# ── Mock data ────────────────────────────────────────────────────────────────

_MOCK_JOBS = [
    {
        "title": "Full Stack Dev.", "description": "Build and maintain scalable web applications using React and Node.js",
        "status": "Pending", "employment_type": ["Full-time"],
        "recruitment_start": "2026-04-01", "recruitment_end": "2026-06-30",
        "candidates_filled": 12, "candidates_total": 50,
        "salary": "100k", "salary_type": "Yearly",
        "interviewers": ["John Doe", "Jane Smith", "David Harris", "Sara Smith", "Tom Wilson", "Amy Lee", "Bob King"],
    },
    {
        "title": "Full Stack Dev.", "description": "Build and maintain scalable web applications using React and Node.js",
        "status": "Completed", "employment_type": ["Full-time"],
        "recruitment_start": "2026-03-01", "recruitment_end": "2026-05-30",
        "candidates_filled": 12, "candidates_total": 50,
        "salary": "100k", "salary_type": "Yearly",
        "interviewers": ["John Doe", "Jane Smith", "David Harris", "Sara Smith", "Tom Wilson", "Amy Lee", "Bob King"],
    },
    {
        "title": "Full Stack Dev.", "description": "Build and maintain scalable web applications using React and Node.js",
        "status": "Pending", "employment_type": ["Part-time"],
        "recruitment_start": "2026-04-15", "recruitment_end": "2026-07-15",
        "candidates_filled": 12, "candidates_total": 50,
        "salary": "60k", "salary_type": "Yearly",
        "interviewers": ["John Doe", "Jane Smith", "David Harris", "Sara Smith", "Tom Wilson", "Amy Lee", "Bob King"],
    },
    {
        "title": "Full Stack Dev.", "description": "Build and maintain scalable web applications using React and Node.js",
        "status": "In Progress", "employment_type": ["Full-time"],
        "recruitment_start": "2026-04-01", "recruitment_end": "2026-08-01",
        "candidates_filled": 12, "candidates_total": 50,
        "salary": "120k", "salary_type": "Yearly",
        "interviewers": ["John Doe", "Jane Smith", "David Harris", "Sara Smith", "Tom Wilson", "Amy Lee", "Bob King"],
    },
    {
        "title": "Full Stack Dev.", "description": "Build and maintain scalable web applications using React and Node.js",
        "status": "Completed", "employment_type": ["Casual"],
        "recruitment_start": "2026-02-01", "recruitment_end": "2026-04-30",
        "candidates_filled": 12, "candidates_total": 50,
        "salary": "80k", "salary_type": "Yearly",
        "interviewers": ["John Doe", "Jane Smith", "David Harris", "Sara Smith", "Tom Wilson", "Amy Lee", "Bob King"],
    },
    {
        "title": "Full Stack Dev.", "description": "Build and maintain scalable web applications using React and Node.js",
        "status": "In Progress", "employment_type": ["Full-time"],
        "recruitment_start": "2026-04-10", "recruitment_end": "2026-07-10",
        "candidates_filled": 12, "candidates_total": 50,
        "salary": "110k", "salary_type": "Yearly",
        "interviewers": ["John Doe", "Jane Smith", "David Harris", "Sara Smith", "Tom Wilson", "Amy Lee", "Bob King"],
    },
    {
        "title": "Full Stack Dev.", "description": "Build and maintain scalable web applications using React and Node.js",
        "status": "In Progress", "employment_type": ["Internship"],
        "recruitment_start": "2026-05-01", "recruitment_end": "2026-08-31",
        "candidates_filled": 12, "candidates_total": 50,
        "salary": "30k", "salary_type": "Yearly",
        "interviewers": ["John Doe", "Jane Smith", "David Harris", "Sara Smith", "Tom Wilson", "Amy Lee", "Bob King"],
    },
]

_MOCK_CANDIDATES = [
    {"name": "John Doe",       "scheduled_at": "2026-05-08T12:00:00", "position": "Full Stack Dev.", "status": "EVALUATED", "score": 7.1, "interviewer": "John Doe"},
    {"name": "Sophia",         "scheduled_at": "2026-05-08T12:00:00", "position": "Full Stack Dev.", "status": "HIRED",     "score": 9.1, "interviewer": "Dave Smith"},
    {"name": "Isabella Garcia","scheduled_at": "2026-05-08T12:00:00", "position": "Full Stack Dev.", "status": "SCHEDULED", "score": None,"interviewer": "Lee JunJie"},
    {"name": "Olivia",         "scheduled_at": "2026-05-08T12:00:00", "position": "Full Stack Dev.", "status": "REJECTED",  "score": 4.3, "interviewer": "Emma Johnson"},
    {"name": "Marcus Lee",     "scheduled_at": "2026-05-09T10:00:00", "position": "Full Stack Dev.", "status": "HIRED",     "score": 8.5, "interviewer": "John Doe"},
    {"name": "Priya Nair",     "scheduled_at": "2026-05-09T11:00:00", "position": "Full Stack Dev.", "status": "REJECTED",  "score": 3.9, "interviewer": "Dave Smith"},
    {"name": "Tom Hanks",      "scheduled_at": "2026-05-10T14:00:00", "position": "Full Stack Dev.", "status": "EVALUATED", "score": 6.7, "interviewer": "Emma Johnson"},
    {"name": "Sara Connor",    "scheduled_at": "2026-05-10T15:00:00", "position": "Full Stack Dev.", "status": "SCHEDULED", "score": None,"interviewer": "Lee JunJie"},
]

_MOCK_SUMMARY = {
    "slug": "dashboard",
    "today_interviews":     1,
    "completed_interviews": 4,
    "upcoming_interviews":  3,
}

_MOCK_USER = {
    "name":   "John Doe",
    "role":   "Interviewer",
    "email":  "john.doe@jobvelo.com",
    "slug":   "me",
}


async def seed_mock_data() -> None:
    """Insert mock data only when each collection is empty."""
    _db = get_db()

    first_job_id = None
    if await _db.jobs.count_documents({}) == 0:
        result = await _db.jobs.insert_many([j.copy() for j in _MOCK_JOBS])
        first_job_id = str(result.inserted_ids[0])
    else:
        first = await _db.jobs.find_one({}, {"_id": 1})
        if first:
            first_job_id = str(first["_id"])

    if await _db.candidates.count_documents({}) == 0 and first_job_id:
        candidates = [dict(c, job_id=first_job_id) for c in _MOCK_CANDIDATES]
        await _db.candidates.insert_many(candidates)

    if await _db.summary.count_documents({}) == 0:
        await _db.summary.insert_one(_MOCK_SUMMARY.copy())

    await _db.users.update_one(
        {"slug": "me"},
        {"$setOnInsert": _MOCK_USER.copy()},
        upsert=True,
    )
