"""Deepgram realtime speech-to-text wrapper.

Designed to run inside a FastAPI WebSocket route. The caller pushes raw
16-bit PCM (16 kHz mono) chunks via `send_audio()` and registers a callback
for transcript events. Lifecycle is managed by the caller (`open()` / `close()`).

The route owns the client WebSocket; this class owns the upstream DG WebSocket.
Keeping the two layers separate means we can swap STT providers later without
touching the route.
"""

from __future__ import annotations

import logging
from typing import Awaitable, Callable

from deepgram import (
    DeepgramClient,
    DeepgramClientOptions,
    LiveOptions,
    LiveTranscriptionEvents,
)

from config import settings

logger = logging.getLogger(__name__)

# (text, is_final) — is_final means DG won't revise this segment.
TranscriptHandler = Callable[[str, bool], Awaitable[None]]


class DeepgramSession:
    """One realtime DG session. Not safe to share across client connections."""

    def __init__(self, on_transcript: TranscriptHandler):
        self._on_transcript = on_transcript
        self._connection = None

    async def open(self) -> None:
        if not settings.deepgram_api_key:
            raise RuntimeError("DEEPGRAM_API_KEY not configured")

        # keepalive avoids DG closing the socket during long silences (e.g.
        # the candidate is thinking). Without it we'd reconnect mid-question.
        client = DeepgramClient(
            settings.deepgram_api_key,
            DeepgramClientOptions(options={"keepalive": "true"}),
        )
        self._connection = client.listen.asynclive.v("1")

        async def _on_message(_self, result, **_kwargs):
            try:
                alt = result.channel.alternatives[0]
                text = alt.transcript
                if not text:
                    return
                await self._on_transcript(text, bool(result.is_final))
            except Exception:
                logger.exception("Failed to handle DG transcript")

        async def _on_error(_self, error, **_kwargs):
            logger.warning("Deepgram error: %s", error)

        self._connection.on(LiveTranscriptionEvents.Transcript, _on_message)
        self._connection.on(LiveTranscriptionEvents.Error, _on_error)

        options = LiveOptions(
            model=settings.deepgram_model,
            language="en-US",
            smart_format=True,
            interim_results=True,
            encoding="linear16",
            sample_rate=16000,
            channels=1,
        )
        ok = await self._connection.start(options)
        if not ok:
            raise RuntimeError("Deepgram connection failed to start")

    async def send_audio(self, chunk: bytes) -> None:
        if self._connection is None:
            return
        await self._connection.send(chunk)

    async def close(self) -> None:
        if self._connection is None:
            return
        try:
            await self._connection.finish()
        finally:
            self._connection = None
