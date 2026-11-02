"""The transcription WebSocket must reject unauthenticated callers before it
accepts the connection (an open socket spends paid Deepgram minutes)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId
from starlette.websockets import WebSocketDisconnect

from security import create_access_token

URL = "/api/realtime/transcribe?role=interviewer"


class _FakeSession:
    def __init__(self, *_args, **_kwargs):
        pass

    async def open(self):
        pass

    async def send_audio(self, _chunk):
        pass

    async def close(self):
        pass


def _db_with_role(role):
    db = MagicMock()
    db.users.find_one = AsyncMock(return_value={"role": role} if role else None)
    return db


def _assert_rejected(client, url):
    with pytest.raises(WebSocketDisconnect) as exc, client.websocket_connect(url):
        pass
    assert exc.value.code == 1008


def test_no_token_is_rejected(client):
    _assert_rejected(client, URL)


def test_garbage_token_is_rejected(client):
    _assert_rejected(client, f"{URL}&token=not-a-jwt")


@pytest.mark.parametrize("role", ["recruiter", "admin", None])
def test_user_who_cannot_run_interviews_is_rejected(client, role):
    token = create_access_token(subject=str(ObjectId()))
    with patch("routes.realtime.get_db", return_value=_db_with_role(role)):
        _assert_rejected(client, f"{URL}&token={token}")


@pytest.mark.parametrize("role", ["interviewer", "hiring_manager"])
def test_interviewer_roles_can_connect(client, role):
    token = create_access_token(subject=str(ObjectId()))
    with (
        patch("routes.realtime.get_db", return_value=_db_with_role(role)),
        patch("routes.realtime.DeepgramSession", _FakeSession),
        client.websocket_connect(f"{URL}&token={token}") as ws,
    ):
        ws.send_bytes(b"\x00\x01")
