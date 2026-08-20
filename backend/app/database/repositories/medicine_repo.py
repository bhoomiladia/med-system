"""Medicine repository — database operations for medicines."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional, List

from app.models.medicine import Medicine


class MedicineRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, **kwargs) -> Medicine:
        medicine = Medicine(**kwargs)
        self.db.add(medicine)
        await self.db.commit()
        await self.db.refresh(medicine)
        return medicine

    async def create_many(self, medicines_data: List[dict]) -> List[Medicine]:
        medicines = [Medicine(**data) for data in medicines_data]
        self.db.add_all(medicines)
        await self.db.commit()
        for m in medicines:
            await self.db.refresh(m)
        return medicines

    async def get_by_id(self, medicine_id: str) -> Optional[Medicine]:
        result = await self.db.execute(
            select(Medicine)
            .options(
                selectinload(Medicine.compositions),
                selectinload(Medicine.price_candidates),
                selectinload(Medicine.final_price),
            )
            .where(Medicine.id == medicine_id)
        )
        return result.scalars().first()

    async def get_by_prescription(self, prescription_id: str) -> List[Medicine]:
        result = await self.db.execute(
            select(Medicine)
            .options(
                selectinload(Medicine.compositions),
                selectinload(Medicine.price_candidates),
                selectinload(Medicine.final_price),
            )
            .where(Medicine.prescription_id == prescription_id)
        )
        return list(result.scalars().all())

    async def update_status(self, medicine_id: str, status: str) -> Optional[Medicine]:
        medicine = await self.get_by_id(medicine_id)
        if medicine:
            medicine.status = status
            await self.db.commit()
        return medicine
