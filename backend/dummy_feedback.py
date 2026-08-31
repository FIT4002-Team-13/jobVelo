"""
Test candidate with completed interview and feedback.

run python dummy_feedback.py
"""

import asyncio
from datetime import datetime, timezone

from database import close_mongo_connection, connect_to_mongo, get_db


async def main():
    await connect_to_mongo()
    db = get_db()
    now = datetime.now(timezone.utc)

    # email of the account to test
    MY_EMAIL = "bb@b.com"

    interviewer = await db.users.find_one({"email": MY_EMAIL})

    company = await db.companies.find_one({"_id": interviewer["comp_id"]})
    job = await db.jobs.find_one({"comp_id": interviewer["comp_id"]})

    # remove old data
    old = await db.candidates.find_one({"cand_email": "Strawberry@donut.com"})
    if old:
        old_id = str(old["_id"])
        old_intvs = await db.interviews.find({"cand_id": old_id}).to_list(length=10)
        for intv in old_intvs:
            await db.interview_users.delete_many({"intv_id": str(intv["_id"])})
        await db.interviews.delete_many({"cand_id": old_id})
        await db.job_candidates.delete_many({"cand_id": old_id})
        await db.candidates.delete_one({"_id": old["_id"]})

    cand_result = await db.candidates.insert_one(
        {
            "cand_full_name": "Donut",
            "cand_email": "Strawberry@donut.com",
            "cand_phone": "0000000000",
            "cand_cv_url": None,
            "cand_cover_letter_url": None,
            "comp_id": company["_id"],
            "cand_created_at": now,
            "cand_updated_at": now,
        }
    )
    cand_id = str(cand_result.inserted_id)
    job_id = str(job["_id"])

    await db.job_candidates.insert_one(
        {
            "cand_id": cand_id,
            "job_id": job_id,
            "communication_score": 8.5,
            "skill_score": 7.0,
            "problem_solving_score": 3,
            "final_score": 7.3,
            "rank": 1,
            "created_at": now,
            "updated_at": now,
        }
    )

    intv_result = await db.interviews.insert_one(
        {
            "cand_id": cand_id,
            "job_id": job_id,
            "intv_date_time": now,
            "intv_location": None,
            "intv_transcript": "Interviewer: Tell me about yourself.\nCandidate: I am a bob and I like donut.",
            "intv_status": "evaluated",
            "intv_candidate_report": {
                "summary": "Good interview! everyone like donut.",
                "strengths": {
                    "items": ["I like lasagna", "Donut have strawberry flavor"],
                    "justification": "Explained why he love donut.",
                },
                "improvements": {
                    "items": ["Maybe he should bring a donut to me"],
                    "justification": "His hand is empty.",
                },
            },
            "intv_interviewer_report": {
                "summary": "Donut is amazing.",
                "strengths": {
                    "items": ["Know how to make donut", "Cool"],
                    "justification": "Donut donut donut.",
                },
                "improvements": {
                    "items": ["Strawberry"],
                    "justification": "Blue berry is blue, i like donut.",
                },
            },
            "intv_created_at": now,
            "intv_updated_at": now,
        }
    )

    await db.interview_users.insert_one(
        {
            "user_id": str(interviewer["_id"]),
            "intv_id": str(intv_result.inserted_id),
            "intvuser_created_at": now,
            "intvuser_updated_at": now,
        }
    )

    print("Done.")
    await close_mongo_connection()


asyncio.run(main())
