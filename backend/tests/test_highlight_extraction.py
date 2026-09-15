"""Live-transcript highlight extraction tests (US18).

extract_highlights calls OpenAI when a key is configured; these tests run
against the deterministic keyword-based fallback (no OPENAI_API_KEY in the
test environment), which is also what a live interview falls back to if the
API call ever fails - so it's worth covering directly."""

import pytest

from services.openai_service import (
    _canonicalize_highlight_text,
    _dedupe_highlights,
    extract_highlights,
)


def test_canonicalize_ignores_punctuation_and_case():
    assert _canonicalize_highlight_text("Reduced Latency!!") == "reduced latency"
    assert _canonicalize_highlight_text("reduced   latency") == "reduced latency"
    assert _canonicalize_highlight_text("REDUCED, latency.") == "reduced latency"


def test_dedupe_keeps_first_occurrence_and_respects_limit():
    highlights = [
        {"text": "Led a migration.", "importance": 4},
        {
            "text": "led a migration",
            "importance": 2,
        },  # same phrase, different casing/punctuation
        {"text": "Improved throughput by 30%.", "importance": 5},
        {"text": "Shipped a new API.", "importance": 3},
    ]
    result = _dedupe_highlights(highlights, limit=2)
    assert len(result) == 2
    assert result[0] == {"text": "Led a migration.", "importance": 4}
    assert result[1]["text"] == "Improved throughput by 30%."


def test_dedupe_clamps_importance_to_1_5():
    result = _dedupe_highlights(
        [{"text": "Something notable.", "importance": 99}], limit=5
    )
    assert result[0]["importance"] == 5
    result = _dedupe_highlights(
        [{"text": "Something else.", "importance": -3}], limit=5
    )
    assert result[0]["importance"] == 1


@pytest.mark.asyncio
async def test_extract_highlights_empty_transcript_returns_nothing():
    assert await extract_highlights([], limit=5) == []
    assert await extract_highlights(None, limit=5) == []


@pytest.mark.asyncio
async def test_extract_highlights_fallback_picks_concrete_result():
    # No OPENAI_API_KEY in the test environment, so this exercises the
    # deterministic fallback - which favours sentences with numbers/metrics
    # over filler conversational lines.
    transcript = [
        {"speaker": "Candidate", "text": "Yeah, that sounds good to me."},
        {
            "speaker": "Candidate",
            "text": "I led a migration that reduced latency by 40 percent and improved throughput.",
        },
        {"speaker": "Interviewer", "text": "Nice, tell me more about that."},
    ]
    highlights = await extract_highlights(transcript, limit=5)
    assert len(highlights) >= 1
    assert any("40 percent" in h["text"] for h in highlights)
    for h in highlights:
        assert 1 <= h["importance"] <= 5


@pytest.mark.asyncio
async def test_extract_highlights_fallback_is_deduped_and_limited():
    transcript = [
        {
            "speaker": "Candidate",
            "text": "I improved performance. I improved performance.",
        },
    ]
    highlights = await extract_highlights(transcript, limit=1)
    assert len(highlights) <= 1
