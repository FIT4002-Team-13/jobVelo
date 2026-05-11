"""Stream uploaded files back to anyone (public).

Logos are typically shown on a sign-in screen before auth, so this route is
public. Path-traversal is rejected by services.file_storage.resolve(), so
"public" is safe to mean "anyone who knows the exact relative path."
"""

from __future__ import annotations

import mimetypes

from fastapi import APIRouter
from fastapi.responses import FileResponse

from services.file_storage import resolve

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{path:path}")
async def get_file(path: str) -> FileResponse:
    target = resolve(path)
    media_type, _ = mimetypes.guess_type(target.name)
    return FileResponse(target, media_type=media_type or "application/octet-stream")
