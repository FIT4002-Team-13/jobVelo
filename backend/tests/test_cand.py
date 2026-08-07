from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from dependencies import get_current_comp_id
from main import app


async def _aiter(items):
    for item in items:
        yield item


@pytest.fixture()
def authed_comp(client):
    """Override the JWT auth dependency so routes see a real-looking comp_id."""
    fake_comp_id = ObjectId()
    app.dependency_overrides[get_current_comp_id] = lambda: fake_comp_id
    yield fake_comp_id, client
    app.dependency_overrides.clear()


# TC-014 – Interviewer can view candidate profiles for a job
def test_interviewer_can_view_candidate_profiles(authed_comp):
    fake_comp_id, client = authed_comp
    fake_cand_id = ObjectId()
    now = datetime.now(timezone.utc)

    mock_db = MagicMock()

    # candidates.find().to_list() — the main list query
    cand_cursor = MagicMock()
    cand_cursor.to_list = AsyncMock(
        return_value=[
            {
                "_id": fake_cand_id,
                "cand_full_name": "Jane Smith",
                "cand_email": "jane@example.com",
                "cand_phone": "555-1234",
                "cand_cv_url": None,
                "cand_cover_letter_url": None,
                "comp_id": fake_comp_id,
                "cand_created_at": now,
                "cand_updated_at": now,
            }
        ]
    )
    mock_db.candidates.find.return_value = cand_cursor

    # job_candidates.find() is consumed with `async for` (status rollup)
    mock_db.job_candidates.find.return_value = _aiter([])

    # interviews.find().to_list() — also part of the status rollup
    intv_cursor = MagicMock()
    intv_cursor.to_list = AsyncMock(return_value=[])
    mock_db.interviews.find.return_value = intv_cursor

    with patch("routes.cand.get_db", return_value=mock_db):
        response = client.get("/api/candidates")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["cand_full_name"] == "Jane Smith"
    assert data[0]["cand_email"] == "jane@example.com"


def test_CV_and_Cover_Letter_Linked_To_Candidate(authed_comp):
    fake_comp_id, client = authed_comp
    fake_cand_id = ObjectId()
    now = datetime.now(timezone.utc)

    mock_db = MagicMock()

    mock_db.candidates.find_one = AsyncMock(
        side_effect=[
            None,
            {
                "_id": fake_cand_id,
                "cand_full_name": "Jane Smith",
                "cand_email": "jane@example.com",
                "cand_phone": None,
                "cand_cv_url": "https://example.com/cv.pdf",
                "cand_cover_letter_url": "https://example.com/cover.pdf",
                "comp_id": fake_comp_id,
                "cand_created_at": now,
                "cand_updated_at": now,
            },
        ]
    )

    insert_result = MagicMock()
    insert_result.inserted_id = fake_cand_id
    mock_db.candidates.insert_one = AsyncMock(return_value=insert_result)

    with patch("routes.cand.get_db", return_value=mock_db):
        response = client.post(
            "/api/candidates",
            json={
                "cand_full_name": "Jane Smith",
                "cand_email": "jane@example.com",
                "cand_cv_url": "https://example.com/cv.pdf",
                "cand_cover_letter_url": "https://example.com/cover.pdf",
                "comp_id": "any-non-empty-string",
            },
        )
        assert response.status_code == 201
        assert response.json()["cand_cv_url"] == "https://example.com/cv.pdf"
        assert (
            response.json()["cand_cover_letter_url"] == "https://example.com/cover.pdf"
        )


def test_reject_incorrect_file_format(authed_comp):
    fake_comp_id, client = authed_comp

    with patch("routes.cand.get_db"):
        response = client.post(
            "/api/candidates",
            json={
                "cand_full_name": "Jane Smith",
                "cand_email": "jane@example.com",
                "cand_cv_url": "cv.exe",
                "comp_id": "fake_comp_id",
            },
        )

    assert response.status_code == 422


def test_accept_correct_file_format(authed_comp):
    fake_comp_id, client = authed_comp
    fake_cand_id = ObjectId()
    now = datetime.now(timezone.utc)

    mock_db = MagicMock()

    mock_db.candidates.find_one = AsyncMock(
        side_effect=[
            None,
            {
                "_id": fake_cand_id,
                "cand_full_name": "Jane Smith",
                "cand_email": "jane@example.com",
                "cand_phone": None,
                "cand_cv_url": "https://example.com/cv.pdf",
                "cand_cover_letter_url": "https://example.com/cover.pdf",
                "comp_id": fake_comp_id,
                "cand_created_at": now,
                "cand_updated_at": now,
            },
        ]
    )

    insert_result = MagicMock()
    insert_result.inserted_id = fake_cand_id
    mock_db.candidates.insert_one = AsyncMock(return_value=insert_result)

    with patch("routes.cand.get_db", return_value=mock_db):
        response = client.post(
            "/api/candidates",
            json={
                "cand_full_name": "Jane Smith",
                "cand_email": "jane@example.com",
                "cand_cv_url": "cv.pdf",
                "comp_id": "fake_comp_id",
            },
        )

    assert response.status_code == 201
