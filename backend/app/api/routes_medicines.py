"""Medicine routes — retrieve medicine details."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database.database import get_db
from app.database.repositories.medicine_repo import MedicineRepository
from app.schemas.medicine import MedicineResponse

router = APIRouter(prefix="/api/medicines", tags=["medicines"])


@router.get("/prescription/{prescription_id}", response_model=List[MedicineResponse])
async def get_medicines_by_prescription(
    prescription_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all medicines for a prescription."""
    repo = MedicineRepository(db)
    medicines = await repo.get_by_prescription(prescription_id)
    return [
        MedicineResponse(
            id=m.id,
            name=m.name,
            normalized_name=m.normalized_name,
            dosage=m.dosage,
            frequency=m.frequency,
            quantity=m.quantity,
            daily_quantity=m.daily_quantity,
            monthly_quantity=m.monthly_quantity,
            status=m.status,
            created_at=m.created_at,
        )
        for m in medicines
    ]


@router.get("/{medicine_id}", response_model=MedicineResponse)
async def get_medicine(
    medicine_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get medicine details."""
    repo = MedicineRepository(db)
    medicine = await repo.get_by_id(medicine_id)

    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    return MedicineResponse(
        id=medicine.id,
        name=medicine.name,
        normalized_name=medicine.normalized_name,
        dosage=medicine.dosage,
        frequency=medicine.frequency,
        quantity=medicine.quantity,
        daily_quantity=medicine.daily_quantity,
        monthly_quantity=medicine.monthly_quantity,
        status=medicine.status,
        created_at=medicine.created_at,
    )
