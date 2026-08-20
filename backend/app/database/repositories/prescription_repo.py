"""Prescription repository — database operations for prescriptions."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional

from app.models.prescription import Prescription


class PrescriptionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, **kwargs) -> Prescription:
        prescription = Prescription(**kwargs)
        self.db.add(prescription)
        await self.db.commit()
        await self.db.refresh(prescription)
        return prescription

    async def get_by_id(self, prescription_id: str) -> Optional[Prescription]:
        result = await self.db.execute(
            select(Prescription)
            .options(selectinload(Prescription.medicines))
            .where(Prescription.id == prescription_id)
        )
        return result.scalars().first()

    async def get_all(self, limit: int = 50, offset: int = 0) -> list[Prescription]:
        result = await self.db.execute(
            select(Prescription)
            .options(selectinload(Prescription.medicines))
            .order_by(Prescription.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def update_status(self, prescription_id: str, status: str, **kwargs) -> Optional[Prescription]:
        prescription = await self.get_by_id(prescription_id)
        if prescription:
            prescription.status = status
            for key, value in kwargs.items():
                setattr(prescription, key, value)
            await self.db.commit()
            await self.db.refresh(prescription)
        return prescription
