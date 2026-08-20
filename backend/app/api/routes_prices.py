"""Price routes — retrieve price candidates and sources."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database.database import get_db
from app.database.repositories.price_repo import PriceRepository
from app.database.repositories.composition_repo import CompositionRepository
from app.schemas.price import PriceCandidateResponse, FinalPriceResponse
from app.schemas.composition import CompositionResponse

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.get("/candidates/all", response_model=List[PriceCandidateResponse])
async def get_all_price_candidates(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    """Get all raw price candidate sources across all medicines."""
    repo = PriceRepository(db)
    candidates = await repo.get_all_candidates(limit=limit)
    return [PriceCandidateResponse.model_validate(c) for c in candidates]


@router.get("/medicine/{medicine_id}/candidates", response_model=List[PriceCandidateResponse])
async def get_price_candidates(
    medicine_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all price candidates for a medicine."""
    repo = PriceRepository(db)
    candidates = await repo.get_candidates(medicine_id)
    return [PriceCandidateResponse.model_validate(c) for c in candidates]


@router.get("/medicine/{medicine_id}/final", response_model=FinalPriceResponse)
async def get_final_price(
    medicine_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the final consensus price for a medicine."""
    repo = PriceRepository(db)
    final = await repo.get_final_price(medicine_id)

    if not final:
        raise HTTPException(status_code=404, detail="Final price not yet calculated")

    return FinalPriceResponse.model_validate(final)


@router.get("/medicine/{medicine_id}/composition", response_model=CompositionResponse)
async def get_composition(
    medicine_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the best composition for a medicine."""
    repo = CompositionRepository(db)
    composition = await repo.get_best_for_medicine(medicine_id)

    if not composition:
        raise HTTPException(status_code=404, detail="Composition not found")

    return CompositionResponse.model_validate(composition)
