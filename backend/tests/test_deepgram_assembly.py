"""Sentence-assembly tests for the Deepgram session.

Deepgram emits speech in short phrase fragments (one is_final per pause).
DeepgramSession buffers those and only surfaces a *final* line on
speech_final, so transcripts and follow-up prompts get whole sentences.
These drive _handle_result directly - no live socket needed."""

import pytest

from services.deepgram_service import DeepgramSession, _join


def _session():
    events = []  # (text, is_final)

    async def sink(text, is_final):
        events.append((text, is_final))

    return DeepgramSession(sink), events


def test_join_collapses_whitespace_and_punctuation():
    assert _join(["Hello", "world", "."]) == "Hello world."
    assert _join(["  So ", "", " are you free ?"]) == "So are you free?"


@pytest.mark.asyncio
async def test_fragments_buffer_until_speech_final():
    session, events = _session()

    # Three finalized fragments of one sentence, none is speech_final.
    await session._handle_result("So tell me", True, False)
    await session._handle_result("about a time", True, False)
    await session._handle_result("you led a project.", True, True)

    finals = [text for text, is_final in events if is_final]
    assert finals == ["So tell me about a time you led a project."]


@pytest.mark.asyncio
async def test_interim_streams_growing_sentence_but_is_not_final():
    session, events = _session()

    await session._handle_result("I built", True, False)   # finalized fragment
    await session._handle_result("a real", False, False)   # interim on top

    # The interim reflects buffered + live text, still not final.
    assert events[-1] == ("I built a real", False)
    assert not any(is_final for _, is_final in events)


@pytest.mark.asyncio
async def test_two_sentences_flush_independently():
    session, events = _session()

    await session._handle_result("First sentence.", True, True)
    await session._handle_result("Second one here.", True, True)

    finals = [text for text, is_final in events if is_final]
    assert finals == ["First sentence.", "Second one here."]


@pytest.mark.asyncio
async def test_blank_transcript_is_ignored():
    session, events = _session()
    await session._handle_result("   ", True, True)
    assert events == []
