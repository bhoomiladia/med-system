"""Medicine schemas for API request/response validation."""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class Ingredient(BaseModel):
    """A single ingredient in a composition."""
    name: str
    strength: float
    unit: str = "mg"


class MedicineResponse(BaseModel):
    """Medicine details in API response."""
    id: str
    name: str
    normalized_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    quantity: Optional[int] = None
    daily_quantity: Optional[int] = None
    monthly_quantity: Optional[int] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ParsedMedicine(BaseModel):
    """A medicine parsed from OCR text."""
    name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    quantity: Optional[int] = None
    daily_quantity: Optional[int] = None
