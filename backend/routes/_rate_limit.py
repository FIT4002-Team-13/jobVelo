"""Simple per-client rate limiting for the unauthenticated auth endpoints
(login, signup, invitation-code check), which are the brute-force targets.

Only active when APP_ENV=production (and RATE_LIMIT_ENABLED isn't false), so
development and the test suite are never throttled.

Limits are counted in this process's memory: correct for a single backend
instance (the supported setup). Running several instances would need a shared
store such as Redis, because each instance would count on its own.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from config import settings

# (bucket, client ip) -> timestamps of recent requests
_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_PRUNE_AT = 10_000  # drop idle keys once the table grows past this


def _client_ip(request: Request) -> str:
    if settings.rate_limit_trust_forwarded_for:
        # Only behind a proxy that sets X-Forwarded-For; otherwise a caller
        # could forge it to dodge the limit.
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _prune(now: float, window: float) -> None:
    for key in [k for k, q in _hits.items() if not q or now - q[-1] > window]:
        del _hits[key]


def rate_limit(bucket: str, max_requests: int, per_seconds: int = 60):
    """FastAPI dependency: at most `max_requests` per `per_seconds` per client."""

    async def dependency(request: Request) -> None:
        if not settings.rate_limit_active:
            return
        now = time.monotonic()
        if len(_hits) > _PRUNE_AT:
            _prune(now, per_seconds)
        recent = _hits[(bucket, _client_ip(request))]
        while recent and now - recent[0] > per_seconds:
            recent.popleft()
        if len(recent) >= max_requests:
            retry_after = int(per_seconds - (now - recent[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a moment and try again.",
                headers={"Retry-After": str(retry_after)},
            )
        recent.append(now)

    return dependency
