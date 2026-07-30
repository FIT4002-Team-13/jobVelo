from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from security import hash_password


def test_signup_success_returns_user(client):
    mock_db = MagicMock()
    fake_id = ObjectId()

    mock_db.invitations.find_one_and_update = AsyncMock(
        return_value={
            "_id": ObjectId(),
            "comp_id": ObjectId(),
            "role": "hiring_manager",
        }
    )

    insert_result = MagicMock()
    insert_result.inserted_id = fake_id
    mock_db.users.insert_one = AsyncMock(return_value=insert_result)
    mock_db.invitations.update_one = AsyncMock()

    with patch("routes.auth.get_db", return_value=mock_db):
        response = client.post(
            "/api/auth/signup",
            json={
                "username": "newuser",
                "full_name": "New User",
                "email": "new@example.com",
                "password": "Password_123",
                "invitation_code": "valid-code",
            },
        )

    assert response.status_code == 201
    assert response.json()["username"] == "newuser"
    assert response.json()["email"] == "new@example.com"


def test_login_success_returns_token(client):
    mock_db = MagicMock()
    mock_db.users.find_one = AsyncMock(
        return_value={
            "_id": "abc123",
            "username": "testuser",
            "password_hash": hash_password("correct_password"),
            "role": "hiring_manager",
            "email": "test@example.com",
        }
    )

    with patch("routes.auth.get_db", return_value=mock_db):
        response = client.post(
            "/api/auth/login",
            json={
                "identifier": "testuser",
                "password": "correct_password",
            },
        )

    assert response.status_code == 200
    assert "access_token" in response.json()


def test_signup_duplicate_email_returns_409(client):
    mock_db = MagicMock()
    mock_db.invitations.find_one_and_update = AsyncMock(
        return_value={
            "_id": "inv123",
            "comp_id": "comp123",
            "role": "hiring_manager",
        }
    )
    mock_db.users.insert_one = AsyncMock(
        side_effect=DuplicateKeyError("email already exists")
    )
    mock_db.invitations.update_one = AsyncMock()

    with patch("routes.auth.get_db", return_value=mock_db):
        response = client.post(
            "/api/auth/signup",
            json={
                "username": "testuser",
                "full_name": "Test User",
                "email": "duplicate@example.com",
                "password": "Password_123",
                "invitation_code": "valid-code",
            },
        )

    print(response.json())
    assert response.status_code == 409
    assert response.json()["detail"] == "Email already registered"


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
