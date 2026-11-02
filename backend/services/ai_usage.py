"""One log line per LLM call: provider, operation, model, latency, tokens.

This is how the client can see where AI cost and time go (no transcript or CV
text is ever logged). Grep the server log for `ai_call`, e.g.

    ai_call provider=openai op=generate_interview_reports model=gpt-4o ms=8423 prompt_tokens=5120 completion_tokens=1210
"""

from __future__ import annotations

import logging
import time
from typing import Any

# Own handler + level so the lines appear under uvicorn without having to
# reconfigure the root logger (which would also surface every httpx request).
logger = logging.getLogger("ai.usage")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def _log(
    provider: str,
    operation: str,
    model: Any,
    started: float,
    prompt: Any,
    completion: Any,
) -> None:
    logger.info(
        "ai_call provider=%s op=%s model=%s ms=%d prompt_tokens=%s completion_tokens=%s",
        provider,
        operation,
        model,
        (time.perf_counter() - started) * 1000,
        prompt,
        completion,
    )


async def timed_openai(operation: str, call):
    """Await an OpenAI chat-completions call and log its latency and usage."""
    started = time.perf_counter()
    res = await call
    usage = getattr(res, "usage", None)
    _log(
        "openai",
        operation,
        getattr(res, "model", None),
        started,
        getattr(usage, "prompt_tokens", None),
        getattr(usage, "completion_tokens", None),
    )
    return res


async def timed_gemini(operation: str, model: str, call):
    """Await a Gemini generate_content call and log its latency and usage."""
    started = time.perf_counter()
    res = await call
    usage = getattr(res, "usage_metadata", None)
    _log(
        "gemini",
        operation,
        model,
        started,
        getattr(usage, "prompt_token_count", None),
        getattr(usage, "candidates_token_count", None),
    )
    return res
