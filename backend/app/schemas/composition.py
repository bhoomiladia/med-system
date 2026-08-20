"""Composition schemas for API request/response validation."""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class IngredientSchema(BaseModel):
    """Single ingredient."""
    name: str
    strength: float
    unit: str = "mg"


class CompositionResponse(BaseModel):
    """Composition details in API response."""
    id: str
    medicine_id: str
    raw_text: Optional[str] = None
    normalized_composition: Optional[dict] = None
    source: str
    source_url: Optional[str] = None
    confidence: float
    created_at: datetime

    model_config = {"from_attributes": True}


class CompositionResult(BaseModel):
    """Result from a composition provider."""
    medicine_name: str
    ingredients: List[IngredientSchema]
    raw_text: str
    source: str
    source_url: Optional[str] = None
    confidence: float = 1.0
