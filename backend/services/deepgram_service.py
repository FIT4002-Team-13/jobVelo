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
from collections.abc import Awaitable, Callable

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


def _join(fragments: list[str]) -> str:
    """Join buffered fragments into one sentence, collapsing whitespace and
    avoiding a space before trailing punctuation Deepgram may split off."""
    text = " ".join(part.strip() for part in fragments if part.strip())
    for punct in (" .", " ,", " ?", " !", " ;", " :"):
        text = text.replace(punct, punct[1])
    return text


class DeepgramSession:
    """One realtime DG session. Not safe to share across client connections.

    Deepgram finalizes speech in short phrase fragments (one `is_final` per
    natural pause), which makes downstream transcripts and follow-up prompts
    choppy. We buffer those fragments and only surface a *final* line when
    Deepgram sets `speech_final` (the true end of an utterance, per the
    configured endpointing silence). Interim events still stream the
    in-progress sentence so the live caption stays responsive."""

    def __init__(self, on_transcript: TranscriptHandler):
        self._on_transcript = on_transcript
        self._connection = None
        # Finalized-but-not-yet-flushed fragments of the current utterance.
        self._buffer: list[str] = []

    async def _handle_result(self, transcript: str, is_final: bool, speech_final: bool) -> None:
        """Assemble Deepgram's phrase fragments into whole sentences.

        - interim (not is_final): stream the sentence-so-far so the live
          caption reads as one growing line rather than a jumpy single word.
        - finalized fragment: buffer it, and only emit a *final* line once
          Deepgram reports speech_final (the end of the utterance); otherwise
          refresh the interim so the just-finalized words stay visible.
        """
        text = transcript.strip()
        if not text:
            return

        if not is_final:
            await self._on_transcript(_join([*self._buffer, text]), False)
            return

        self._buffer.append(text)
        if speech_final:
            sentence = _join(self._buffer)
            self._buffer = []
            if sentence:
                await self._on_transcript(sentence, True)
        else:
            await self._on_transcript(_join(self._buffer), False)

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
                await self._handle_result(
                    alt.transcript or "",
                    bool(getattr(result, "is_final", False)),
                    bool(getattr(result, "speech_final", False)),
                )
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
            # Endpointing drives speech_final: Deepgram waits this many ms of
            # silence before declaring the utterance done, so buffered phrase
            # fragments flush as one complete sentence instead of many.
            endpointing=settings.deepgram_endpointing_ms,
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
        # Flush any buffered fragments that never got a speech_final (e.g. the
        # interview ended mid-sentence) so the last words aren't lost.
        if self._buffer:
            sentence = _join(self._buffer)
            self._buffer = []
            if sentence:
                try:
                    await self._on_transcript(sentence, True)
                except Exception:
                    logger.exception("Failed to flush final DG transcript")
        try:
            await self._connection.finish()
        finally:
            self._connection = None
