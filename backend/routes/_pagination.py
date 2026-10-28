"""Optional `?limit=&offset=` paging for list endpoints.

Backward compatible: with neither parameter the endpoint behaves exactly as it
did before (everything, up to its safety cap). With them, the response is one
page and `X-Total-Count` carries the full count so a UI can build page links.
"""

from __future__ import annotations

from fastapi import Query, Response

MAX_PAGE_SIZE = 1000


class Pagination:
    """FastAPI dependency: `page: Pagination = Depends()`."""

    def __init__(
        self,
        limit: int | None = Query(
            None, ge=1, le=MAX_PAGE_SIZE, description="Page size. Omit for no paging."
        ),
        offset: int = Query(0, ge=0, description="Rows to skip."),
    ):
        self.limit = limit
        self.offset = offset

    @property
    def active(self) -> bool:
        return self.limit is not None or self.offset > 0

    def cursor(self, cursor, stable_sort: list[tuple[str, int]] | None = None):
        """Apply skip/limit to a Motor cursor. `stable_sort` is only applied when
        paging, so rows can't shuffle between pages (default order is unchanged
        for callers that don't page)."""
        if not self.active:
            return cursor
        if stable_sort:
            cursor = cursor.sort(stable_sort)
        if self.offset:
            cursor = cursor.skip(self.offset)
        if self.limit is not None:
            cursor = cursor.limit(self.limit)
        return cursor

    def slice(self, items: list) -> list:
        """Page an already-built list (for endpoints that assemble rows in Python)."""
        if not self.active:
            return items
        end = None if self.limit is None else self.offset + self.limit
        return items[self.offset : end]

    def set_total(self, response: Response, total: int) -> None:
        if self.active:
            response.headers["X-Total-Count"] = str(total)
