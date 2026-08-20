"""Prescription schemas for API request/response validation."""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class PrescriptionUploadResponse(BaseModel):
    """Response after uploading a prescription."""
    prescription_id: str
    pipeline_run_id: str
    status: str
    message: str = "Prescription uploaded and processing started"


class PrescriptionResponse(BaseModel):
    """Full prescription details."""
    id: str
    original_filename: str
    file_type: str
    file_size: int
    ocr_text: Optional[str] = None
    ocr_confidence: Optional[float] = None
    status: str
    created_at: datetime
    medicine_count: int = 0
    latest_run_id: Optional[str] = None

    model_config = {"from_attributes": True}
