"""Price schemas for API request/response validation."""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class PriceCandidateResponse(BaseModel):
    """A single price candidate from a source."""
    id: str
    type: str  # branded / generic
    candidate_name: str
    composition: Optional[str] = None
    price: float
    currency: str = "INR"
    pack_quantity: int = 1
    unit_price: Optional[float] = None
    source: str
    source_url: Optional[str] = None
    confidence: float
    is_outlier: bool = False
    retrieved_at: datetime
    raw_evidence: Optional[str] = None

    model_config = {"from_attributes": True}


class PriceCandidateCreate(BaseModel):
    """Internal model for creating a price candidate."""
    type: str
    candidate_name: str
    composition: Optional[str] = None
    price: float
    currency: str = "INR"
    pack_quantity: int = 1
    unit_price: Optional[float] = None
    source: str
    source_url: Optional[str] = None
    confidence: float = 0.0
    raw_evidence: Optional[str] = None


class FinalPriceResponse(BaseModel):
    """Final consensus price for a medicine."""
    id: str
    medicine_id: str
    branded_unit_price: Optional[float] = None
    generic_unit_price: Optional[float] = None
    branded_pack_price: Optional[float] = None
    generic_pack_price: Optional[float] = None
    branded_pack_size: Optional[int] = None
    generic_pack_size: Optional[int] = None
    generic_name: Optional[str] = None
    branded_monthly_cost: Optional[float] = None
    generic_monthly_cost: Optional[float] = None
    monthly_savings: Optional[float] = None
    savings_percentage: Optional[float] = None
    confidence: float
    monthly_quantity: Optional[int] = None

    model_config = {"from_attributes": True}
