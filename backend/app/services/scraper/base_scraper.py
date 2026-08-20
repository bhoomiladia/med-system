"""
Base composition provider — abstract interface for medicine composition lookup.

All composition providers (1mg, PharmEasy, Netmeds, etc.) implement this interface
so the pipeline can use any provider without code changes.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional

from app.schemas.composition import CompositionResult, IngredientSchema


class CompositionProvider(ABC):
    """Abstract base class for composition providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (e.g., '1mg', 'pharmeasy')."""
        ...

    @abstractmethod
    async def find_composition(self, medicine_name: str) -> Optional[CompositionResult]:
        """
        Search for a medicine and extract its composition.

        Args:
            medicine_name: The branded medicine name (e.g., "Rablet D")

        Returns:
            CompositionResult if found, None if medicine not found
        """
        ...

    async def close(self) -> None:
        """Clean up resources (HTTP clients, browser contexts, etc.)."""
        pass
