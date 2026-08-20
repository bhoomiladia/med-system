"""Price repository — database operations for price candidates and final prices with cache."""

from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List

from app.models.price import PriceCandidate, FinalPrice
from app.config import settings


class PriceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_candidate(self, medicine_id: str, **kwargs) -> PriceCandidate:
        candidate = PriceCandidate(medicine_id=medicine_id, **kwargs)
        self.db.add(candidate)
        await self.db.commit()
        await self.db.refresh(candidate)
        return candidate

    async def create_candidates(self, medicine_id: str, candidates_data: List[dict]) -> List[PriceCandidate]:
        candidates = [PriceCandidate(medicine_id=medicine_id, **data) for data in candidates_data]
        self.db.add_all(candidates)
        await self.db.commit()
        for c in candidates:
            await self.db.refresh(c)
        return candidates

    async def get_candidates(self, medicine_id: str, price_type: Optional[str] = None) -> List[PriceCandidate]:
        query = select(PriceCandidate).where(PriceCandidate.medicine_id == medicine_id)
        if price_type:
            query = query.where(PriceCandidate.type == price_type)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_all_candidates(self, limit: int = 200) -> List[PriceCandidate]:
        query = select(PriceCandidate).order_by(PriceCandidate.retrieved_at.desc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def mark_outliers(self, candidate_ids: List[str]) -> None:
        for cid in candidate_ids:
            result = await self.db.execute(
                select(PriceCandidate).where(PriceCandidate.id == cid)
            )
            candidate = result.scalars().first()
            if candidate:
                candidate.is_outlier = True
        await self.db.commit()

    async def create_final_price(self, medicine_id: str, **kwargs) -> FinalPrice:
        # Delete existing final price if any
        result = await self.db.execute(
            select(FinalPrice).where(FinalPrice.medicine_id == medicine_id)
        )
        existing = result.scalars().first()
        if existing:
            await self.db.delete(existing)

        final = FinalPrice(medicine_id=medicine_id, **kwargs)
        self.db.add(final)
        await self.db.commit()
        await self.db.refresh(final)
        return final

    async def get_final_price(self, medicine_id: str) -> Optional[FinalPrice]:
        result = await self.db.execute(
            select(FinalPrice).where(FinalPrice.medicine_id == medicine_id)
        )
        return result.scalars().first()

    async def find_cached_final_price(self, canonical_key: str) -> Optional[FinalPrice]:
        """
        Phase 1: Check if a valid, non-stale final price exists for the canonical composition key.

        Looks across all FinalPrice entries and checks if the medicine's composition
        has a matching canonical key that is within the price TTL.
        """
        from app.models.medicine import Medicine
        from app.models.composition import Composition

        ttl_seconds = getattr(settings, "PRICE_CACHE_TTL", 86400 * 7)
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=ttl_seconds)

        # Join FinalPrice → Medicine → Composition to find by canonical key
        result = await self.db.execute(
            select(FinalPrice, Composition)
            .join(Medicine, FinalPrice.medicine_id == Medicine.id)
            .join(Composition, Composition.medicine_id == Medicine.id)
            .where(FinalPrice.confidence > 0.0)
            .order_by(FinalPrice.confidence.desc())
        )
        rows = result.all()

        for fp, comp in rows:
            if comp and comp.normalized_composition:
                stored_key = comp.normalized_composition.get("canonical_key", "")
                if stored_key == canonical_key:
                    if fp.created_at:
                        created = fp.created_at if fp.created_at.tzinfo else fp.created_at.replace(tzinfo=timezone.utc)
                        if created > cutoff:
                            return fp
                    else:
                        return fp

        return None
