"""Prescription routes — upload and retrieve prescriptions."""

import os
import uuid
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.repositories.prescription_repo import PrescriptionRepository
from app.database.repositories.pipeline_repo import PipelineRepository
from app.schemas.prescription import PrescriptionUploadResponse, PrescriptionResponse
from app.utils.validation import validate_upload_file, validate_file_size, sanitize_filename
from app.services.pipeline_service import PipelineService
from app.config import settings
from app.utils.logging import get_logger

logger = get_logger("routes_prescription")

router = APIRouter(prefix="/api/prescriptions", tags=["prescriptions"])


@router.post("/upload", response_model=PrescriptionUploadResponse)
async def upload_prescription(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a prescription and start the processing pipeline."""
    # Validate file
    validate_upload_file(file)
    content = await validate_file_size(file)

    # Save file
    settings.ensure_upload_dir()
    filename = f"{uuid.uuid4()}_{sanitize_filename(file.filename or 'prescription')}"
    file_path = os.path.join(settings.UPLOAD_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    # Create prescription record
    ext = os.path.splitext(file.filename or "")[1].lower()
    prescription_repo = PrescriptionRepository(db)
    prescription = await prescription_repo.create(
        file_path=file_path,
        original_filename=file.filename or "prescription",
        file_type=ext.lstrip("."),
        file_size=len(content),
    )

    # Create pipeline run
    pipeline_repo = PipelineRepository(db)
    pipeline_run = await pipeline_repo.create(prescription.id)

    # Start pipeline in background
    pipeline_service = PipelineService()
    asyncio.create_task(
        pipeline_service.start_pipeline(prescription.id, pipeline_run.id)
    )

    logger.info(
        "prescription_uploaded",
        prescription_id=prescription.id,
        pipeline_run_id=pipeline_run.id,
        filename=file.filename,
    )

    return PrescriptionUploadResponse(
        prescription_id=prescription.id,
        pipeline_run_id=pipeline_run.id,
        status="processing",
    )


@router.get("", response_model=list[PrescriptionResponse])
async def list_prescriptions(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List prescription history."""
    repo = PrescriptionRepository(db)
    pipeline_repo = PipelineRepository(db)
    prescriptions = await repo.get_all(limit=limit, offset=offset)
    
    results = []
    for p in prescriptions:
        runs = await pipeline_repo.get_by_prescription(p.id)
        latest_run_id = runs[0].id if runs else None
        results.append(
            PrescriptionResponse(
                id=p.id,
                original_filename=p.original_filename,
                file_type=p.file_type,
                file_size=p.file_size,
                ocr_text=p.ocr_text,
                ocr_confidence=p.ocr_confidence,
                status=p.status,
                created_at=p.created_at,
                medicine_count=len(p.medicines) if p.medicines else 0,
                latest_run_id=latest_run_id,
            )
        )
    return results


@router.get("/{prescription_id}", response_model=PrescriptionResponse)
async def get_prescription(
    prescription_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get prescription details."""
    repo = PrescriptionRepository(db)
    pipeline_repo = PipelineRepository(db)
    prescription = await repo.get_by_id(prescription_id)

    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")

    runs = await pipeline_repo.get_by_prescription(prescription.id)
    latest_run_id = runs[0].id if runs else None

    return PrescriptionResponse(
        id=prescription.id,
        original_filename=prescription.original_filename,
        file_type=prescription.file_type,
        file_size=prescription.file_size,
        ocr_text=prescription.ocr_text,
        ocr_confidence=prescription.ocr_confidence,
        status=prescription.status,
        created_at=prescription.created_at,
        medicine_count=len(prescription.medicines) if prescription.medicines else 0,
        latest_run_id=latest_run_id,
    )
