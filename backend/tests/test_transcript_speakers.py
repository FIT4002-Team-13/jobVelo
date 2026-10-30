"""Speaker handling for interviewer feedback (#95) and rating evidence (#88)."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

from models.interview import TranscriptEntry
from routes.interviewer_feedback import _build_session_block, _speaker_tag
from services.openai_service import _merge_fragments, rate_candidate_skills

_NAMES = {"interviewer", "jane smith"}


def _entry(id, speaker, text, role=None):
    return TranscriptEntry(
        id=id,
        speaker=speaker,
        timestamp=f"00:{int(id):02d}",
        text=text,
        speaker_role=role,
    )


def test_speaker_tag_prefers_role_then_name():
    assert (
        _speaker_tag({"speaker": "Bob", "speaker_role": "interviewer"}, _NAMES)
        == "INTERVIEWER"
    )
    assert _speaker_tag({"speaker": "Jane Smith"}, _NAMES) == "INTERVIEWER"
    assert (
        _speaker_tag({"speaker": "Sam", "speaker_role": "candidate"}, _NAMES)
        == "CANDIDATE"
    )
    # A third person in the room is never the interviewer.
    assert (
        _speaker_tag({"speaker": "Jane Smith", "speaker_role": "other"}, _NAMES)
        == "OTHER"
    )
    assert _speaker_tag({"speaker": "Speaker 3"}, _NAMES) == "OTHER"


def test_session_block_tags_each_line():
    block = _build_session_block(
        {
            "intv_transcript": [
                {"speaker": "Panel", "speaker_role": "other", "text": "Hi"}
            ]
        },
        _NAMES,
    )
    assert "[OTHER] Panel: Hi" in block


def test_merge_fragments_joins_same_speaker_runs():
    turns = _merge_fragments(
        [
            _entry("1", "Sam", "I built"),
            _entry("2", "Sam", "the API."),
            _entry("3", "Jane", "Why?"),
            _entry("4", "Sam", "Speed."),
        ]
    )
    assert [(t.id, t.text) for t in turns] == [
        ("1+2", "I built the API."),
        ("3", "Why?"),
        ("4", "Speed."),
    ]
    assert turns[0].timestamp == "00:01"


async def test_rating_evidence_is_whole_turns_without_filler_in_time_order():
    transcript = [
        _entry("1", "Jane", "Tell me about your work."),
        _entry("2", "Sam", "I was the lead on a payments service", "candidate"),
        _entry("3", "Sam", "written in Go with Kafka.", "candidate"),
        _entry("4", "Jane", "Anything else?"),
        _entry("5", "Sam", "Okay.", "candidate"),
        _entry("6", "Jane", "And testing?"),
        _entry("7", "Sam", "We wrote contract tests for every endpoint.", "candidate"),
    ]
    rating = {
        "score": 6,
        "explanation": "ok",
        "evidence_entry_ids": ["7", "5", "2+3", "99"],
    }
    reply = MagicMock()
    reply.choices = [
        MagicMock(
            message=MagicMock(
                content=json.dumps(
                    {
                        "technical_skills": rating,
                        "communication": rating,
                        "problem_solving": rating,
                    }
                )
            )
        )
    ]
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=reply)

    with patch("services.openai_service._get_client", return_value=client):
        result = await rate_candidate_skills(transcript, candidate_name="Sam")

    evidence = result.technical_skills.evidence
    # "Okay." is filler, "99" is invented; the rest come back whole and in order.
    assert [e.transcript_entry_id for e in evidence] == ["2+3", "7"]
    assert (
        evidence[0].text
        == "I was the lead on a payments service written in Go with Kafka."
    )
