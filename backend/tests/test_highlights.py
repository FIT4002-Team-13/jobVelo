import asyncio

from services.openai_service import extract_highlights


def test_extract_highlights_returns_fallback_results_when_no_openai_key():
    transcript = [
        {"speaker": "Interviewer", "text": "Can you describe your experience with Python?"},
        {
            "speaker": "Candidate",
            "text": "I have six years of experience building Python APIs and improving performance.",
        },
        {"speaker": "Interviewer", "text": "What did you improve?"},
        {
            "speaker": "Candidate",
            "text": "I reduced latency by 40 percent and shipped a large migration to microservices.",
        },
    ]

    highlights = asyncio.run(extract_highlights(transcript))

    assert highlights
    assert all("text" in item and "importance" in item for item in highlights)
    assert any("latency" in item["text"].lower() for item in highlights)
