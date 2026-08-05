"""Local-filesystem file storage for uploaded binaries.

Files live under settings.uploads_dir, in subdirectories per resource type.
Mongo only stores the *relative path* (e.g. "company_logos/68f3a4...png");
the absolute location is resolved at read-time via resolve().

Single seam to swap for S3 later: rewrite the four functions in this file
without touching the routes or the database documents.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from fastapi import HTTPException, UploadFile

from config import settings

logger = logging.getLogger(__name__)

# Subdirs callers pass in. Anything else is rejected to prevent surprise paths.
_KNOWN_SUBDIRS = {"company_logos", "candidate_docs"}

# Conservative extension allow-list per subdir.
_ALLOWED_EXTS = {
    "company_logos": {".png", ".jpg", ".jpeg", ".webp"},
    "candidate_docs": {".pdf"},
}

_MAX_BYTES_BY_SUBDIR = {
    "company_logos": 5 * 1024 * 1024,   # 5 MB
    "candidate_docs": 20 * 1024 * 1024, # 20 MB
}
_MAX_BYTES = 5 * 1024 * 1024  # 5 MB ceiling for logos.


def _root() -> Path:
    """The configured uploads directory, created if it doesn't yet exist."""
    root = Path(settings.uploads_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _ext_from(file: UploadFile) -> str:
    """Lower-cased extension from the filename, or a mime-type fallback."""
    suffix = Path(file.filename or "").suffix.lower()
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
    """Persist `file` to disk under `<uploads_dir>/<subdir>/<key><ext>`.

    Returns the *relative* path (for storage in Mongo). Raises 4xx HTTPException
    on validation failure so callers can let it bubble up.
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
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    rel_path = f"{subdir}/{_safe_key(key)}{ext}"
    dest = _root() / rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return rel_path


def resolve(rel_path: str) -> Path:
    """Translate a stored relative path into an absolute filesystem path.

    Rejects path-traversal attempts (e.g. "../etc/passwd").
    """
    root = _root().resolve()
    target = (root / rel_path).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return target


def delete_upload(rel_path: str | None) -> None:
    """Best-effort delete. Silently no-ops on missing path or filesystem errors."""
    if not rel_path:
        return
    try:
        target = (_root() / rel_path).resolve()
        target.unlink(missing_ok=True)
    except Exception:
        logger.exception("Failed to delete upload: %s", rel_path)
