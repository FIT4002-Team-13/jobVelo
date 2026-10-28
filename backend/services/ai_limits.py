"""Guard rails around LLM calls: cap concurrent requests per provider, and
retry transient Gemini failures (rate limit / overloaded) a couple of times.

Why: every live interview fans out bias checks and question requests, and
several interviews can run at once. Without a cap a burst opens dozens of
simultaneous provider calls and trips the provider's rate limit; a cap queues
the excess for a moment instead.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from config import settings

logger = logging.getLogger(__name__)

# One semaphore per (provider, event loop): asyncio semaphores must not be
# shared across loops, and a slow provider shouldn't block the other one.
_slots: dict[tuple[str, int], asyncio.Semaphore] = {}


def slots(provider: str) -> asyncio.Semaphore:
    """The concurrency limiter for `provider` ("openai" / "gemini")."""
    key = (provider, id(asyncio.get_running_loop()))
    if key not in _slots:
        _slots[key] = asyncio.Semaphore(max(1, settings.ai_max_concurrent_calls))
    return _slots[key]


_TRANSIENT_CODES = {429, 500, 502, 503, 504}


def is_transient(error: BaseException) -> bool:
    """True for provider errors worth retrying (rate limited / server busy)."""
    code = getattr(error, "code", None) or getattr(error, "status_code", None)
    return code in _TRANSIENT_CODES


async def call_with_retry(
    factory: Callable[[], Awaitable[Any]], *, attempts: int = 3, base_delay: float = 1.0
) -> Any:
    """Await `factory()` and retry transient failures with 1 s, 2 s... backoff.

    `factory` builds a fresh awaitable per attempt (a coroutine can only be
    awaited once). Non-transient errors and the last attempt re-raise as-is.
    """
    for attempt in range(attempts):
        try:
            return await factory()
        except Exception as error:
            if attempt == attempts - 1 or not is_transient(error):
                raise
            delay = base_delay * 2**attempt
            logger.warning(
                "Transient AI provider error (%s); retrying in %.0fs", error, delay
            )
            await asyncio.sleep(delay)
