from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.deepgram_service import DeepgramSession
from services.openai_service import check_bias

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/api/realtime/transcribe")
async def realtime_transcribe(websocket: WebSocket, role: str | None = None) -> None:
    await websocket.accept()
    transcript_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    # `role` is a plain, client-supplied query param with no validation
    # beyond the strict "interviewer" check below. That's fine here: this
    # socket has no auth at all (pre-existing, separate gap), so the worst
    # case of a spoofed/wrong role is one wasted OpenAI call - never a
    # data-exposure issue.
    #
    # Bias-checking only ever runs on the interviewer's own mic connection,
    # never on candidate/display audio - the two sides open separate
    # connections to this same route.
    bias_tasks: set[asyncio.Task] = set()

    async def run_bias_check(text: str) -> None:
        # Each final is now a complete utterance (DeepgramSession assembles the
        # phrase fragments into whole sentences before flushing), so we check
        # the sentence on its own - no cross-final window needed - and report
        # it verbatim as the quote the frontend rendered.
        result = await check_bias(text)
        if result.get("flagged"):
            await transcript_queue.put({"type": "bias_warning", "quote": text, **result})

    def spawn_bias_check(text: str) -> None:
        # Hold a strong reference - asyncio only weak-refs tasks, so an
        # unreferenced task can be garbage-collected mid-flight.
        task = asyncio.create_task(run_bias_check(text))
        bias_tasks.add(task)
        task.add_done_callback(bias_tasks.discard)

    async def on_transcript(text: str, is_final: bool) -> None:
        await transcript_queue.put({"type": "transcript", "text": text, "is_final": is_final})
        if is_final and role == "interviewer":
            spawn_bias_check(text)

    session = DeepgramSession(on_transcript)
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
