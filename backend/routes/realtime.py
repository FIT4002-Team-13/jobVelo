from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from database import get_db
from security import TokenError, decode_access_token
from services.deepgram_service import DeepgramSession
from services.openai_service import check_bias

logger = logging.getLogger(__name__)
# No prefix: the WS path is hard-coded below. tags= only groups it in /docs.
router = APIRouter(tags=["realtime"])

# Same roles that may complete an interview (routes/interview.py).
_LIVE_ROLES = {"interviewer", "hiring_manager"}


async def _authenticate_ws(token: str | None) -> dict | None:
    """Resolve the JWT passed as ?token= to a user allowed to run an
    interview, or None. Browsers can't set an Authorization header on a
    WebSocket, so the token rides in the query string."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except TokenError:
        return None
    user_id = payload.get("sub")
    if not user_id or not ObjectId.is_valid(user_id):
        return None
    user = await get_db().users.find_one({"_id": ObjectId(user_id)}, {"role": 1})
    return user if user and user.get("role") in _LIVE_ROLES else None


@router.websocket("/api/realtime/transcribe")
async def realtime_transcribe(
    websocket: WebSocket, role: str | None = None, token: str | None = None
) -> None:
    # Reject before accepting: an open socket spends paid Deepgram minutes.
    if await _authenticate_ws(token) is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    transcript_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    stream_id = uuid4().hex

    # `role` is a plain, client-supplied query param (which audio side this
    # connection carries), validated only by the strict "interviewer" check
    # below. The socket itself is authenticated above, so the worst case of a
    # wrong role is one wasted OpenAI call - never a data-exposure issue.
    #
    # Bias-checking only ever runs on the interviewer's own mic connection,
    # never on candidate/display audio - the two sides open separate
    # connections to this same route.
    bias_tasks: set[asyncio.Task] = set()

    async def run_bias_check(text: str) -> None:
        # Checked per sentence (DeepgramSession's on_sentence), not per
        # utterance: an utterance only ends after a silence, so a speaker who
        # never pauses would otherwise get one late warning quoting everything.
        result = await check_bias(text)
        if result.get("flagged"):
            await transcript_queue.put(
                {"type": "bias_warning", "quote": text, **result}
            )

    async def spawn_bias_check(text: str) -> None:
        task = asyncio.create_task(run_bias_check(text))
        bias_tasks.add(task)
        task.add_done_callback(bias_tasks.discard)

    async def on_transcript(text: str, is_final: bool) -> None:
        await transcript_queue.put(
            {"type": "transcript", "text": text, "is_final": is_final}
        )

    async def on_diarization(groups: list[dict], is_final: bool) -> None:
        await transcript_queue.put(
            {
                "type": "diarized_transcript",
                "stream_id": stream_id,
                "role": role,
                "groups": groups,
                "is_final": is_final,
            }
        )

    session = DeepgramSession(
        on_transcript,
        on_diarization=on_diarization,
        on_sentence=spawn_bias_check if role == "interviewer" else None,
    )

    try:
        await session.open()
    except Exception:
        logger.exception("Failed to open Deepgram session")
        await websocket.close(code=1011)
        return

    async def send_transcripts() -> None:
        try:
            while True:
                message = await transcript_queue.get()
                await websocket.send_json(message)
        except Exception:
            logger.debug("Realtime transcription sender task stopped")

    sender_task = asyncio.create_task(send_transcripts())
    try:
        while True:
            chunk = await websocket.receive_bytes()
            if not chunk:
                continue
            await session.send_audio(chunk)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Realtime transcription websocket error")
    finally:
        sender_task.cancel()
        for t in bias_tasks:
            t.cancel()
        await asyncio.gather(sender_task, *bias_tasks, return_exceptions=True)
        await session.close()
