from unittest.mock import AsyncMock, MagicMock, patch
from security import hash_password


def test_login_wrong_password_returns_401(client):
    mock_db = MagicMock()
    mock_db.users.find_one = AsyncMock(
        return_value={
            "_id": "abc123",
            "username": "testuser",
            "password_hash": hash_password("correct_password"),
        }
    )

    with patch("routes.auth.get_db", return_value=mock_db):
        response = client.post(
            "/api/auth/login",
            json={
                "identifier": "testuser",
                "password": "wrong_password",
            },
        )

    assert response.status_code == 401


def test_login_unknown_user_returns_401(client):
    mock_db = MagicMock()
    mock_db.users.find_one = AsyncMock(return_value=None)

    with patch("routes.auth.get_db", return_value=mock_db):
        response = client.post(
            "/api/auth/login",
            json={
                "identifier": "nobody",
                "password": "nothing",
            },
        )

    assert response.status_code == 401
