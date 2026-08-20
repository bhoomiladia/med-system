"""Results routes — aggregate savings and detailed reports."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database.database import get_db
from app.database.repositories.medicine_repo import MedicineRepository
from app.database.repositories.composition_repo import CompositionRepository
from app.database.repositories.price_repo import PriceRepository
from app.schemas.result import PrescriptionSavingsResult, MedicineSavingsDetail
from app.schemas.medicine import MedicineResponse
from app.schemas.composition import CompositionResponse
from app.schemas.price import PriceCandidateResponse, FinalPriceResponse

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/{prescription_id}", response_model=PrescriptionSavingsResult)
async def get_results(
    prescription_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get aggregate savings result for a prescription."""
    medicine_repo = MedicineRepository(db)
    comp_repo = CompositionRepository(db)
    price_repo = PriceRepository(db)

    medicines = await medicine_repo.get_by_prescription(prescription_id)

    if not medicines:
        raise HTTPException(status_code=404, detail="No medicines found for this prescription")

    details: List[MedicineSavingsDetail] = []
    total_branded = 0.0
    total_generic = 0.0
    medicines_with_savings = 0
    medicines_unresolved = 0
    confidences = []

    for medicine in medicines:
        # Get composition
        composition = await comp_repo.get_best_for_medicine(medicine.id)
        comp_response = CompositionResponse.model_validate(composition) if composition else None

        # Get final price
        final_price = await price_repo.get_final_price(medicine.id)
        final_response = FinalPriceResponse.model_validate(final_price) if final_price else None

        # Get price candidates
        branded_candidates = await price_repo.get_candidates(medicine.id, "branded")
        generic_candidates = await price_repo.get_candidates(medicine.id, "generic")

        med_response = MedicineResponse(
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

        detail = MedicineSavingsDetail(
            medicine=med_response,
            composition=comp_response,
            final_price=final_response,
            branded_candidates=[PriceCandidateResponse.model_validate(c) for c in branded_candidates],
            generic_candidates=[PriceCandidateResponse.model_validate(c) for c in generic_candidates],
        )
        details.append(detail)

        # Aggregate
        if final_price and final_price.branded_monthly_cost and final_price.generic_monthly_cost:
            total_branded += final_price.branded_monthly_cost
            total_generic += final_price.generic_monthly_cost
            if final_price.monthly_savings and final_price.monthly_savings > 0:
                medicines_with_savings += 1
            confidences.append(final_price.confidence)
        else:
            medicines_unresolved += 1

    total_savings = max(0, total_branded - total_generic)
    savings_pct = (total_savings / total_branded * 100) if total_branded > 0 else 0
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0

    return PrescriptionSavingsResult(
        prescription_id=prescription_id,
        total_branded_monthly=round(total_branded, 2),
        total_generic_monthly=round(total_generic, 2),
        total_monthly_savings=round(total_savings, 2),
        total_yearly_savings=round(total_savings * 12, 2),
        overall_savings_percentage=round(savings_pct, 1),
        medicines_analyzed=len(medicines),
        medicines_with_savings=medicines_with_savings,
        medicines_unresolved=medicines_unresolved,
        average_confidence=round(avg_confidence, 2),
        details=details,
    )
