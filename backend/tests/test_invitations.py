"""Unit tests for invitation management endpoints.

Covers admin-only CRUD for /api/invitations:
  - GET  /api/invitations          (list)
  - POST /api/invitations          (create)
  - DELETE /api/invitations/{id}   (delete, with optional user cascade)
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

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


def _inv_doc(comp_id: ObjectId, *, status: str = "active", user_id=None) -> dict:
    return {
        "_id": ObjectId(),
        "comp_id": comp_id,
        "code": "INV-A1B2-C3D4",
        "role": "interviewer",
        "status": status,
        "user_id": user_id,
        "created_at": _NOW,
        "used_at": None,
    }


class _AsyncCursor:
    """Minimal async-iterable cursor with a chainable sort()."""

    def __init__(self, items):
        self._items = items

    def sort(self, *_, **__):
        return self

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for item in self._items:
            yield item


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# ── List invitations ──────────────────────────────────────────────────────────


def test_list_invitations_returns_company_invitations(client):
    """GET /api/invitations returns every invitation for the admin's company."""
    comp_id = ObjectId()
    docs = [_inv_doc(comp_id), _inv_doc(comp_id, status="used")]

    mock_db = MagicMock()
    mock_db.invitations.find.return_value = _AsyncCursor(docs)

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)

    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.get("/api/invitations")

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_invitations_blocked_for_non_admin(client):
    """Non-admin role cannot list invitations; 403 is returned."""
    comp_id = ObjectId()
    non_admin = {**_admin_user(comp_id), "role": "interviewer"}

    mock_db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: non_admin

    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.get("/api/invitations")

    assert response.status_code == 403


# ── Create invitation ─────────────────────────────────────────────────────────


def test_create_invitation_returns_201_with_code(client):
    """POST /api/invitations creates a fresh invitation and returns 201."""
    comp_id = ObjectId()

    insert_result = MagicMock()
    insert_result.inserted_id = ObjectId()

    mock_db = MagicMock()
    mock_db.invitations.insert_one = AsyncMock(return_value=insert_result)

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)

    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.post("/api/invitations", json={"role": "interviewer"})

    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "interviewer"
    assert body["status"] == "active"
    assert body["code"].startswith("INV-")


def test_create_invitation_blocked_for_non_admin(client):
    """Non-admin cannot create invitations; 403 is returned."""
    comp_id = ObjectId()
    non_admin = {**_admin_user(comp_id), "role": "hiring_manager"}

    mock_db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: non_admin

    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.post("/api/invitations", json={"role": "interviewer"})

    assert response.status_code == 403


def test_create_invitation_rejects_admin_role(client):
    """Creating an invitation with role='admin' is rejected by Pydantic (422)."""
    comp_id = ObjectId()
    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)

    mock_db = MagicMock()
    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.post("/api/invitations", json={"role": "admin"})

    assert response.status_code == 422


# ── Delete invitation ─────────────────────────────────────────────────────────


def test_delete_unused_invitation_returns_204(client):
    """DELETE /api/invitations/{id} removes an active (unused) invitation."""
    comp_id = ObjectId()
    inv = _inv_doc(comp_id)

    mock_db = MagicMock()
    mock_db.invitations.find_one = AsyncMock(return_value=inv)
    mock_db.invitations.delete_one = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)

    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.delete(f"/api/invitations/{inv['_id']}")

    assert response.status_code == 204
    mock_db.invitations.delete_one.assert_awaited_once()


def test_delete_used_invitation_also_deletes_linked_user(client):
    """Deleting a used invitation cascade-deletes the user it created."""
    comp_id = ObjectId()
    user_id = ObjectId()
    inv = _inv_doc(comp_id, status="used", user_id=user_id)

    linked_user = {"_id": user_id, "role": "interviewer"}

    mock_db = MagicMock()
    mock_db.invitations.find_one = AsyncMock(return_value=inv)
    mock_db.users.find_one = AsyncMock(return_value=linked_user)
    mock_db.users.delete_one = AsyncMock()
    mock_db.invitations.delete_one = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)

    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.delete(f"/api/invitations/{inv['_id']}")

    assert response.status_code == 204
    mock_db.users.delete_one.assert_awaited_once()
    mock_db.invitations.delete_one.assert_awaited_once()


def test_delete_invitation_linked_to_admin_returns_409(client):
    """Deleting a used invitation whose linked user is an admin returns 409."""
    comp_id = ObjectId()
    user_id = ObjectId()
    inv = _inv_doc(comp_id, status="used", user_id=user_id)

    admin_user = {"_id": user_id, "role": "admin"}

    mock_db = MagicMock()
    mock_db.invitations.find_one = AsyncMock(return_value=inv)
    mock_db.users.find_one = AsyncMock(return_value=admin_user)
    mock_db.users.delete_one = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)

    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.delete(f"/api/invitations/{inv['_id']}")

    assert response.status_code == 409
    mock_db.users.delete_one.assert_not_called()


def test_delete_nonexistent_invitation_returns_404(client):
    """Deleting an invitation id that doesn't exist returns 404."""
    comp_id = ObjectId()

    mock_db = MagicMock()
    mock_db.invitations.find_one = AsyncMock(return_value=None)

    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)

    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.delete(f"/api/invitations/{ObjectId()}")

    assert response.status_code == 404


def test_delete_invitation_with_invalid_id_returns_400(client):
    """A non-ObjectId id in the URL is rejected with 400."""
    comp_id = ObjectId()
    mock_db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: _admin_user(comp_id)

    with patch("routes.invitations.get_db", return_value=mock_db):
        response = client.delete("/api/invitations/not-an-objectid")

    assert response.status_code == 400
