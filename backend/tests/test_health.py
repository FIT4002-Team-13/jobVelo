def test_health_returns_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_ok_when_database_answers(client):
    from unittest.mock import AsyncMock, MagicMock, patch

    db = MagicMock()
    db.command = AsyncMock(return_value={"ok": 1})
    with patch("main.get_db", return_value=db):
        response = client.get("/api/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_ready_503_when_database_is_down(client):
    from unittest.mock import AsyncMock, MagicMock, patch

    db = MagicMock()
    db.command = AsyncMock(side_effect=RuntimeError("no server"))
    with patch("main.get_db", return_value=db):
        response = client.get("/api/health/ready")
    assert response.status_code == 503
