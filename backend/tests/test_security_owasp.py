"""OWASP backend security tests.

Covers gaps not addressed by existing auth/tenancy tests:
  A02 - Cryptographic Failures: passwords stored as bcrypt hashes, not plaintext
  A03 - Injection: MongoDB operator injection rejected at login
  A05 - Security Misconfiguration: CORS headers, no stack trace in error responses
"""

from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

from security import hash_password, verify_password

# ── A02: Cryptographic Failures ───────────────────────────────────────────────


def test_hash_password_produces_bcrypt_format():
    """hash_password must return a bcrypt hash, not the plain password.
    Bcrypt hashes always start with $2b$ — anything else means the password
    would be stored in a recoverable format."""
    result = hash_password("MyPassword1!")
    assert result.startswith("$2b$"), f"Expected bcrypt hash, got: {result[:10]}..."
    assert result != "MyPassword1!"


def test_plaintext_cannot_pass_as_its_own_hash():
    """verify_password must return False when the 'hash' is the plaintext
    password itself — guards against accidentally storing and comparing
    passwords without hashing."""
    assert verify_password("MyPassword1!", "MyPassword1!") is False


def test_signup_stores_bcrypt_hash_not_plaintext(client):
    """The signup route must store a bcrypt hash in password_hash, never the
    raw password. Inspects the argument passed to insert_one."""
    mock_db = MagicMock()
    mock_db.invitations.find_one_and_update = AsyncMock(
        return_value={
            "_id": ObjectId(),
            "comp_id": ObjectId(),
            "role": "hiring_manager",
        }
    )
    insert_result = MagicMock()
    insert_result.inserted_id = ObjectId()
    mock_db.users.insert_one = AsyncMock(return_value=insert_result)
    mock_db.invitations.update_one = AsyncMock()

    with patch("routes.auth.get_db", return_value=mock_db):
        response = client.post(
            "/api/auth/signup",
            json={
                "username": "sectest",
                "full_name": "Sec Test",
                "email": "sectest@example.com",
                "password": "SecurePass1!",
                "invitation_code": "valid-code",
            },
        )

    assert response.status_code == 201
    stored_doc = mock_db.users.insert_one.call_args.args[0]
    assert stored_doc["password_hash"].startswith("$2b$"), (
        "password_hash must be a bcrypt hash — plain password must never be stored"
    )
    assert stored_doc.get("password") is None, (
        "Raw password field must not be stored on the user document"
    )


# ── A03: Injection ────────────────────────────────────────────────────────────


def test_nosql_operator_injection_in_login_is_rejected(client):
    """Sending a MongoDB operator as the login identifier must return 422
    (Pydantic rejects a dict where a string is expected), not a data leak."""
    response = client.post(
        "/api/auth/login",
        json={
            "identifier": {"$gt": ""},
            "password": "anything",
        },
    )
    assert response.status_code == 422


def test_nosql_operator_injection_in_password_is_rejected(client):
    """Same guard on the password field — must be rejected before it reaches
    any comparison logic."""
    response = client.post(
        "/api/auth/login",
        json={
            "identifier": "someuser",
            "password": {"$gt": ""},
        },
    )
    assert response.status_code == 422


# ── A05: Security Misconfiguration ───────────────────────────────────────────


def test_cors_header_present_for_allowed_origin(client):
    """A request from the configured frontend origin must receive the
    Access-Control-Allow-Origin header, confirming CORS is active."""
    response = client.get(
        "/api/health",
        headers={"Origin": "http://localhost:5173"},
    )
    assert (
        response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    )


def test_cors_header_absent_for_disallowed_origin(client):
    """A request from an unknown origin must not receive the
    Access-Control-Allow-Origin header — the browser will block it."""
    response = client.get(
        "/api/health",
        headers={"Origin": "http://evil.example.com"},
    )
    assert "access-control-allow-origin" not in response.headers


def test_error_response_does_not_leak_stack_trace(client):
    """A request to a non-existent endpoint must return a clean error body.
    Internal paths, 'Traceback', or Python module names must not appear in
    the response — these would help an attacker map the codebase."""
    response = client.get("/api/this-endpoint-does-not-exist")
    body = response.text.lower()
    assert "traceback" not in body
    assert 'file "/' not in body
    assert response.status_code == 404
