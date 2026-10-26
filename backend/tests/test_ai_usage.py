"""Each LLM call logs provider/op/model/latency/tokens, and returns the
provider response untouched."""

from types import SimpleNamespace
from unittest.mock import patch

from services.ai_usage import timed_gemini, timed_openai


async def test_timed_openai_logs_usage_and_returns_response():
    res = SimpleNamespace(
        model="gpt-4o",
        usage=SimpleNamespace(prompt_tokens=120, completion_tokens=30),
    )

    async def call():
        return res

    with patch("services.ai_usage.logger") as log:
        assert await timed_openai("check_bias", call()) is res

    args = log.info.call_args.args
    assert args[1:4] == ("openai", "check_bias", "gpt-4o")
    assert args[-2:] == (120, 30)


async def test_timed_gemini_logs_usage_and_tolerates_missing_usage():
    async def call():
        return SimpleNamespace()  # no usage_metadata

    with patch("services.ai_usage.logger") as log:
        await timed_gemini("analyse_cv", "gemini-flash-latest", call())

    args = log.info.call_args.args
    assert args[1:4] == ("gemini", "analyse_cv", "gemini-flash-latest")
    assert args[-2:] == (None, None)
