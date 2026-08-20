"""Pipeline repository — database operations for pipeline runs."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from typing import Optional, List

from app.models.pipeline_run import PipelineRun


class PipelineRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, prescription_id: str) -> PipelineRun:
        run = PipelineRun(prescription_id=prescription_id)
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def get_by_id(self, run_id: str) -> Optional[PipelineRun]:
        result = await self.db.execute(
            select(PipelineRun).where(PipelineRun.id == run_id)
        )
        return result.scalars().first()

    async def update_stage(
        self,
        run_id: str,
        stage: str,
        status: str,
        progress: Optional[dict] = None,
        error: Optional[str] = None,
    ) -> Optional[PipelineRun]:
        run = await self.get_by_id(run_id)
        if run:
            run.current_stage = stage
            run.status = status
            if progress:
                run.progress = progress
            if error:
                run.error = error
            if status == "completed":
                run.completed_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(run)
        return run

    async def add_log(self, run_id: str, log_entry: dict) -> None:
        run = await self.get_by_id(run_id)
        if run:
            logs = run.logs or []
            logs.append(log_entry)
            run.logs = logs
            await self.db.commit()

    async def get_by_prescription(self, prescription_id: str) -> List[PipelineRun]:
        result = await self.db.execute(
            select(PipelineRun)
            .where(PipelineRun.prescription_id == prescription_id)
            .order_by(PipelineRun.started_at.desc())
        )
        return list(result.scalars().all())
