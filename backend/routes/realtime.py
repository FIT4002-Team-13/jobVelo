from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from services.deepgram_service import DeepgramSession
from services.openai_service import detect_interruption

logger = logging.getLogger(__name__)
router = APIRouter()


class InterruptionCheck(BaseModel):
    candidate_text: str = Field(min_length=1, max_length=2000)
    interviewer_text: str = Field(min_length=1, max_length=1000)


@router.post("/api/realtime/interruption")
async def check_interruption(payload: InterruptionCheck) -> dict[str, bool]:
    """Confirm a possible overlap with the interview's OpenAI model."""
    return {
        "interrupted": await detect_interruption(
            payload.candidate_text,
            payload.interviewer_text,
        )
    }


@router.websocket("/api/realtime/transcribe")
async def realtime_transcribe(websocket: WebSocket) -> None:
    await websocket.accept()
    transcript_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def on_transcript(text: str, is_final: bool) -> None:
        await transcript_queue.put(
            {"type": "transcript", "text": text, "is_final": is_final}
        )

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
        await session.close()
