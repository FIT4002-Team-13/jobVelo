"""GridFS-backed file storage for uploaded binaries.

Files are stored in MongoDB via GridFS instead of local disk. That's what
fixes cross-device / cross-instance access: the bytes live in Mongo, so
every app instance (and every redeploy, and every process behind a load
balancer) sees the same files - no shared volume required.

Callers are unaffected in spirit: Mongo documents still store the same
*relative path* string as before (e.g. "cv_analyses/68f3a4...-cv.pdf").
That string is now used as the GridFS filename instead of a disk path.

Two function signatures changed from the disk version:
  - `resolve(path) -> Path` is gone. Streaming a Path via FileResponse
    doesn't make sense for GridFS, so it's replaced by
    `open_download_stream(path) -> (GridOut, content_type)`, which the
    route iterates directly (see routes/files.py).
  - `delete_upload` is now `async def` (GridFS deletes are async in
    Motor) - callers must `await` it.

Single seam to swap storage backends again later: rewrite the functions in
this file without touching the routes or the database documents.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from database import get_db

logger = logging.getLogger(__name__)

# Subdirs callers pass in. Anything else is rejected to prevent surprise paths.
_KNOWN_SUBDIRS = {"company_logos", "candidate_docs", "cv_analyses"}

# Conservative extension allow-list per subdir. Adding a new subdir requires
# an entry here AND in _KNOWN_SUBDIRS - the redundancy makes it harder to
# accidentally allow arbitrary file types through.
_ALLOWED_EXTS = {
    "company_logos": {".png", ".jpg", ".jpeg", ".webp"},
    "cv_analyses":   {".pdf"},
    "candidate_docs": {".pdf"},
}

# Per-subdir ceiling. Logos stay capped at 5 MB; CV PDFs can go up to 8 MB
# (matches the frontend MAX_PDF_BYTES). Bumping this also bumps the maximum
# payload size Gemini receives.
_MAX_BYTES_PER_SUBDIR = {
    "company_logos": 5 * 1024 * 1024,
    "cv_analyses":   8 * 1024 * 1024,
    "candidate_docs": 20 * 1024 * 1024,  # 20 MB
}
_DEFAULT_MAX_BYTES = 5 * 1024 * 1024

_CONTENT_TYPES = {
    ".pdf":  "application/pdf",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

_BUCKET_NAME = "uploads"


def _bucket() -> AsyncIOMotorGridFSBucket:
    """One GridFS bucket shared by every subdir - the subdir is baked into
    the stored filename, same as it used to be baked into the disk path.
    Backs onto `fs.files` / `fs.chunks`-style collections named
    `uploads.files` / `uploads.chunks` in the same database as everything
    else, so it's covered by your existing DB backups automatically.
    """
    return AsyncIOMotorGridFSBucket(get_db(), bucket_name=_BUCKET_NAME)


def _ext_from(file: UploadFile) -> str:
    """Lower-cased extension from the filename, or a mime-type fallback."""
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
    if suffix:
        return suffix
    return {
        "image/png":  ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
    }.get((file.content_type or "").lower(), "")


_SAFE_KEY = re.compile(r"[^A-Za-z0-9_.-]")


def _safe_key(key: str) -> str:
    """Sanitise user-controlled key strings used in filenames."""
    return _SAFE_KEY.sub("_", key) or "unnamed"


async def save_upload(file: UploadFile, *, subdir: str, key: str) -> str:
    """Persist `file` into GridFS under filename `<subdir>/<key><ext>`.

    Returns the *relative path* string (for storage in Mongo) - same shape
    as the old disk version, now doubling as the GridFS filename. Raises
    4xx HTTPException on validation failure so callers can let it bubble up.
    """
    if subdir not in _KNOWN_SUBDIRS:
        raise HTTPException(status_code=500, detail=f"Unknown upload subdir: {subdir}")

    ext = _ext_from(file)
    if ext not in _ALLOWED_EXTS[subdir]:
        raise HTTPException(
            status_code=415,
            detail=f"{subdir}: unsupported file type {ext or 'unknown'}",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    max_bytes = _MAX_BYTES_PER_SUBDIR.get(subdir, _DEFAULT_MAX_BYTES)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {max_bytes // 1024 // 1024} MB)",
        )

    rel_path = f"{subdir}/{_safe_key(key)}{ext}"
    bucket = _bucket()

    # Clear any earlier revision(s) under this exact filename first. GridFS
    # allows multiple files with the same filename (newest wins on lookup),
    # but callers here always pass a fresh uuid-based key per upload, so an
    # existing entry only shows up on a genuine re-save of the same key -
    # dropping it up front keeps `uploads.files` from accumulating orphans.
    async for old in bucket.find({"filename": rel_path}):
        await bucket.delete(old._id)

    await bucket.upload_from_stream(
        rel_path,
        data,
        metadata={
            "content_type": file.content_type or _CONTENT_TYPES.get(ext, "application/octet-stream"),
            "subdir": subdir,
            "uploaded_at": datetime.now(timezone.utc),
        },
    )
    return rel_path


async def open_download_stream(rel_path: str):
    """Open a streamable handle to the newest file stored under `rel_path`.

    Returns (grid_out, content_type). Raises 404 if nothing is stored under
    that name. Replaces the old `resolve(path) -> Path`; the caller iterates
    `grid_out` to stream chunks instead of using FileResponse on a disk path.
    """
    bucket = _bucket()
    try:
        grid_out = await bucket.open_download_stream_by_name(rel_path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

    metadata = grid_out.metadata or {}
    content_type = metadata.get("content_type") or _CONTENT_TYPES.get(
        "." + rel_path.rsplit(".", 1)[-1].lower() if "." in rel_path else "",
        "application/octet-stream",
    )
    return grid_out, content_type


async def delete_upload(rel_path: str | None) -> None:
    """Best-effort delete of every revision stored under this filename.

    Now async (GridFS deletes go through Motor) - callers must `await` this.
    Silently no-ops on a missing path or storage errors, same as before.
    """
    if not rel_path:
        return
    try:
        bucket = _bucket()
        async for doc in bucket.find({"filename": rel_path}):
            await bucket.delete(doc._id)
    except Exception:
        logger.exception("Failed to delete upload: %s", rel_path)