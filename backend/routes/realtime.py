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

    last_final_text = ""
    bias_tasks: set[asyncio.Task] = set()

    async def run_bias_check(text: str) -> None:
        result = await check_bias(f"{last_final_text} {text}".strip())
        if result.get("flagged"):
            await transcript_queue.put(
                {"type": "bias_warning", "quote": text, **result}
            )

    def spawn_bias_check(text: str) -> None:
        task = asyncio.create_task(run_bias_check(text))
        bias_tasks.add(task)
        task.add_done_callback(bias_tasks.discard)

    async def on_transcript(text: str, is_final: bool) -> None:
        nonlocal last_final_text
        await transcript_queue.put(
            {"type": "transcript", "text": text, "is_final": is_final}
        )
        if is_final and role == "interviewer":
            spawn_bias_check(text)
            last_final_text = text

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
