"""Pipeline routes — status polling and SSE event streaming."""

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.database.database import get_db
from app.database.repositories.pipeline_repo import PipelineRepository
from app.schemas.result import PipelineStatusResponse
from app.services.pipeline_service import event_bus
from app.utils.logging import get_logger

logger = get_logger("routes_pipeline")

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.get("/{run_id}/status")
async def get_pipeline_status(
    run_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get current pipeline status (polling fallback)."""
    repo = PipelineRepository(db)
    run = await repo.get_by_id(run_id)

    if not run:
        raise HTTPException(status_code=404, detail="Pipeline run not found")

    return {
        "run_id": run.id,
        "prescription_id": run.prescription_id,
        "status": run.status,
        "current_stage": run.current_stage,
        "progress": run.progress,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "error": run.error,
    }


@router.get("/{run_id}/events")
async def pipeline_events(
    run_id: str,
    request: Request,
):
    """SSE endpoint for real-time pipeline progress events."""

    async def event_generator():
        queue = event_bus.subscribe(run_id)
        try:
            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({"timestamp": datetime.now(timezone.utc).isoformat()}),
                    }
                    continue

                if event is None:
                    # End of stream
                    yield {
                        "event": "close",
                        "data": json.dumps({"message": "Pipeline complete"}),
                    }
                    break

                yield {
                    "event": event.get("event", "message"),
                    "data": json.dumps(event),
                }

        finally:
            event_bus.unsubscribe(run_id, queue)

    return EventSourceResponse(event_generator())
