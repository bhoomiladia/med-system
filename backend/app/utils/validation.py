"""Validation utilities for file uploads and input sanitization."""

import os
import re
from typing import Optional
from fastapi import UploadFile, HTTPException

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger("validation")

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/jpg",
    "application/pdf",
}


def validate_upload_file(file: UploadFile) -> None:
    """
    Validate an uploaded file for type, MIME, and size.

    Raises HTTPException on validation failure.
    """
    # Check filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Check extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Supported: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Check MIME type
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"MIME type '{file.content_type}' not allowed.",
        )

    logger.info("file_validated", filename=file.filename, content_type=file.content_type)


async def validate_file_size(file: UploadFile) -> bytes:
    """
    Read file content and validate size.

    Returns the file content bytes.
    Raises HTTPException if file is too large.
    """
    content = await file.read()
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB}MB",
        )
    return content


def sanitize_filename(filename: str) -> str:
    """Sanitize a filename for safe storage."""
    # Remove directory traversal
    filename = os.path.basename(filename)
    # Remove special characters except dots, hyphens, underscores
    filename = re.sub(r"[^\w\-.]", "_", filename)
    return filename


def sanitize_text(text: str) -> str:
    """Basic text sanitization — remove control characters."""
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
