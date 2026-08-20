"""
Base Price Agent — abstract interface for price discovery agents.

Each agent performs actual search/retrieval and returns evidence-backed prices.
Agents must NEVER fabricate prices.
"""

from abc import ABC, abstractmethod
from typing import List

from app.schemas.price import PriceCandidateCreate
from app.services.composition_normalizer import NormalizedComposition


class PriceAgent(ABC):
    """Abstract base class for price discovery agents."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Agent name for logging and attribution."""
        ...

    @abstractmethod
    async def search_branded_prices(
        self,
        medicine_name: str,
        composition: NormalizedComposition,
    ) -> List[PriceCandidateCreate]:
        """
        Search for branded medicine prices.

        Args:
            medicine_name: Original branded medicine name
            composition: Normalized composition for validation

        Returns:
            List of price candidates with source evidence
        """
        ...

    @abstractmethod
    async def search_generic_prices(
        self,
        composition: NormalizedComposition,
        original_name: str,
    ) -> List[PriceCandidateCreate]:
        """
        Search for generic equivalent medicine prices.

        Args:
            composition: Target normalized composition to match
            original_name: Original branded name (for context)

        Returns:
            List of price candidates with composition match verified
        """
        ...

    async def close(self) -> None:
        """Clean up resources."""
        pass
