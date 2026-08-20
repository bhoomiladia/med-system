"""Composition repository — database operations for compositions with cache lookup."""

from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List

from app.models.composition import Composition
from app.config import settings


class CompositionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, **kwargs) -> Composition:
        comp = Composition(**kwargs)
        self.db.add(comp)
        await self.db.commit()
        await self.db.refresh(comp)
        return comp

    async def get_by_medicine(self, medicine_id: str) -> List[Composition]:
        result = await self.db.execute(
            select(Composition).where(Composition.medicine_id == medicine_id)
        )
        return list(result.scalars().all())

    async def get_best_for_medicine(self, medicine_id: str) -> Optional[Composition]:
        """Get the highest-confidence composition for a medicine."""
        result = await self.db.execute(
            select(Composition)
            .where(Composition.medicine_id == medicine_id)
            .order_by(Composition.confidence.desc())
            .limit(1)
        )
        return result.scalars().first()

    async def find_by_canonical_key(self, canonical_key: str) -> Optional[Composition]:
        """
        Phase 1: Strict DB cache lookup by normalized canonical key.

        Searches for a composition where `normalized_composition` JSON contains
        a matching canonical_key. Returns None if no match or entry is stale.
        """
        # Search across all compositions for a matching canonical key
        # The canonical key is stored in normalized_composition JSON
        result = await self.db.execute(
            select(Composition)
            .where(Composition.raw_text.isnot(None))
            .order_by(Composition.confidence.desc())
        )
        compositions = result.scalars().all()

        ttl_seconds = getattr(settings, "COMPOSITION_CACHE_TTL", 604800)
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=ttl_seconds)

        for comp in compositions:
            if comp.normalized_composition and isinstance(comp.normalized_composition, dict):
                stored_key = comp.normalized_composition.get("canonical_key", "")
                if stored_key == canonical_key:
                    # Check TTL
                    if comp.created_at:
                        created = comp.created_at if comp.created_at.tzinfo else comp.created_at.replace(tzinfo=timezone.utc)
                        if created > cutoff:
                            return comp
                    return None
        return None

    async def find_by_medicine_name(self, medicine_name: str) -> Optional[Composition]:
        """
        Fuzzy lookup by raw_text containing the medicine name.
        Used as a secondary cache check.
        """
        normalized = medicine_name.lower().strip()
        result = await self.db.execute(
            select(Composition)
            .where(Composition.raw_text.isnot(None))
            .order_by(Composition.confidence.desc())
        )
        compositions = result.scalars().all()

        ttl_seconds = getattr(settings, "COMPOSITION_CACHE_TTL", 604800)
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=ttl_seconds)

        for comp in compositions:
            # Check if this composition was discovered for a similar medicine
            if comp.normalized_composition and isinstance(comp.normalized_composition, dict):
                stored_name = comp.normalized_composition.get("medicine_name", "").lower()
                if stored_name == normalized or normalized in stored_name:
                    if comp.created_at:
                        created = comp.created_at if comp.created_at.tzinfo else comp.created_at.replace(tzinfo=timezone.utc)
                        if created > cutoff:
                            return comp
        return None
