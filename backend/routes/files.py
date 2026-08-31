"""Stream uploaded files back to anyone (public).

Logos are typically shown on a sign-in screen before auth, so this route is
public. Files live in GridFS now, not on disk: `path` is just a lookup key
against the `uploads.files` collection, so there's no filesystem to
path-traverse into - "public" still safely means "anyone who knows the
exact stored filename you were given."
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from services.file_storage import open_download_stream

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{path:path}")
async def get_file(path: str) -> StreamingResponse:
    grid_out, content_type = await open_download_stream(path)

    async def _iter_chunks():
        # GridOut.readchunk() hands back GridFS's own chunk_size pieces
        # (255 KB by default) until exhausted, without loading the whole
        # file into memory at once.
        while True:
            chunk = await grid_out.readchunk()
            if not chunk:
                break
            yield chunk

    return StreamingResponse(_iter_chunks(), media_type=content_type)