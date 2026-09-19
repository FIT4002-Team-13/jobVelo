"""Unit tests for company profile endpoints.

TC-007 - Company profile updated and saved successfully
TC-008 - Company profile rejects invalid logo file format
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from database import get_db
from dependencies import get_current_user
from main import app

_NOW = datetime(2025, 1, 1, tzinfo=timezone.utc)


def _admin_user(comp_id: ObjectId) -> dict:
    return {
        "_id": ObjectId(),
        "username": "adminuser",
        "full_name": "Admin User",
        "email": "admin@example.com",
        "role": "admin",
        "comp_id": comp_id,
        "created_at": _NOW,
    }


def _company_doc(comp_id: ObjectId) -> dict:
    return {
        "_id": comp_id,
        "comp_name": "Test Company",
        "comp_email": "company@example.com",
        "comp_industry": "Technology",
        "comp_contact": "1234567890",
        "comp_website": None,
        "comp_description": None,
        "comp_logo": None,
        "created_at": _NOW,
    }


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# ── TC-007: Company profile updated ──────────────────────────────────────────


def test_company_profile_update_succeeds_for_admin(client):
    """Admin can update allowed company profile fields; updated doc is returned."""
    comp_id = ObjectId()
    updated_doc = {**_company_doc(comp_id), "comp_name": "New Name"}

    mock_db = MagicMock()
    mock_db.companies.update_one = AsyncMock()
    mock_db.companies.find_one = AsyncMock(return_value=updated_doc)

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.put(
        f"/api/companies/{comp_id}",
        json={"comp_name": "New Name"},
    )

    assert response.status_code == 200
    assert response.json()["comp_name"] == "New Name"
    mock_db.companies.update_one.assert_awaited_once()


def test_company_profile_update_persists_all_allowed_fields(client):
    """All allowed fields in the payload are passed to the DB update call."""
    comp_id = ObjectId()
    payload = {
        "comp_name": "Acme Corp",
        "comp_email": "info@acme.com",
        "comp_industry": "Finance",
        "comp_contact": "9876543210",
        "comp_website": "https://acme.com",
        "comp_description": "We do finance things.",
    }
    updated_doc = {**_company_doc(comp_id), **payload}

    mock_db = MagicMock()
    mock_db.companies.update_one = AsyncMock()
    mock_db.companies.find_one = AsyncMock(return_value=updated_doc)

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.put(f"/api/companies/{comp_id}", json=payload)

    assert response.status_code == 200
    # Confirm all six fields reached the $set dict in the update call.
    set_doc = mock_db.companies.update_one.call_args.args[1]["$set"]
    for field in payload:
        assert field in set_doc


def test_company_profile_update_blocked_for_non_admin(client):
    """Non-admin role cannot update the company profile; 403 is returned."""
    comp_id = ObjectId()
    non_admin = {**_admin_user(comp_id), "role": "interviewer"}

    mock_db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: non_admin
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.put(
        f"/api/companies/{comp_id}",
        json={"comp_name": "Should Fail"},
    )

    assert response.status_code == 403


def test_company_profile_update_returns_400_for_no_valid_fields(client):
    """PUT with only unrecognised fields returns 400; nothing is written to DB."""
    comp_id = ObjectId()

    mock_db = MagicMock()
    mock_db.companies.update_one = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.put(
        f"/api/companies/{comp_id}",
        json={"_id": "hack", "unknown_field": "value"},
    )

    assert response.status_code == 400
    mock_db.companies.update_one.assert_not_called()


def test_company_profile_update_returns_400_for_invalid_comp_id(client):
    """Non-ObjectId comp_id in URL is rejected with 400 before any DB call."""
    comp_id = ObjectId()

    mock_db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.put(
        "/api/companies/not-an-objectid",
        json={"comp_name": "Whatever"},
    )

    assert response.status_code == 400
    mock_db.companies.update_one.assert_not_called()


# ── TC-008: Company logo file format validation ───────────────────────────────


def test_company_logo_rejects_unsupported_file_format(client):
    """Uploading a non-image file (.txt) to the logo endpoint returns 415.

    The extension check in save_upload() fires before any GridFS call, so
    only get_current_user and get_db need to be mocked (db is injected by
    FastAPI DI but never reached inside the handler on a format error).
    """
    comp_id = ObjectId()

    mock_db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        f"/api/companies/{comp_id}/logo",
        files={"logo": ("logo.txt", b"not an image at all", "text/plain")},
    )

    assert response.status_code == 415


def test_company_logo_rejects_executable_format(client):
    """Executable files (.exe) are also rejected with 415."""
    comp_id = ObjectId()

    mock_db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        f"/api/companies/{comp_id}/logo",
        files={
            "logo": ("malware.exe", b"\x4d\x5a\x90\x00", "application/octet-stream")
        },
    )

    assert response.status_code == 415


def test_company_logo_update_blocked_for_non_admin(client):
    """Non-admin role cannot update the company logo; 403 is returned."""
    comp_id = ObjectId()
    non_admin = {**_admin_user(comp_id), "role": "recruiter"}

    mock_db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: non_admin
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        f"/api/companies/{comp_id}/logo",
        files={"logo": ("logo.png", b"\x89PNG\r\n", "image/png")},
    )

    assert response.status_code == 403


def test_company_logo_update_succeeds_for_valid_png(client):
    """Admin uploading a valid PNG gets back the updated company doc with a logo path."""
    comp_id = ObjectId()
    logo_path = f"company_logos/{comp_id}.png"
    updated_doc = {**_company_doc(comp_id), "comp_logo": logo_path}

    mock_db = MagicMock()
    mock_db.companies.update_one = AsyncMock()
    mock_db.companies.find_one = AsyncMock(return_value=updated_doc)

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("routes.companies.save_upload", new_callable=AsyncMock) as mock_save:
        mock_save.return_value = logo_path

        response = client.patch(
            f"/api/companies/{comp_id}/logo",
            files={"logo": ("logo.png", b"\x89PNG\r\n", "image/png")},
        )

    assert response.status_code == 200
    assert response.json()["comp_logo"] == logo_path
    mock_save.assert_awaited_once()
    mock_db.companies.update_one.assert_awaited_once()
