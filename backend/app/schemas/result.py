"""Result schemas — aggregate savings and pipeline status."""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

from app.schemas.medicine import MedicineResponse
from app.schemas.composition import CompositionResponse
from app.schemas.price import PriceCandidateResponse, FinalPriceResponse


class MedicineSavingsDetail(BaseModel):
    """Detailed savings for a single medicine."""
    medicine: MedicineResponse
    composition: Optional[CompositionResponse] = None
    final_price: Optional[FinalPriceResponse] = None
    branded_candidates: List[PriceCandidateResponse] = []
    generic_candidates: List[PriceCandidateResponse] = []


class PrescriptionSavingsResult(BaseModel):
    """Aggregate savings result for the entire prescription."""
    prescription_id: str
    total_branded_monthly: float = 0.0
    total_generic_monthly: float = 0.0
    total_monthly_savings: float = 0.0
    total_yearly_savings: float = 0.0
    overall_savings_percentage: float = 0.0
    medicines_analyzed: int = 0
    medicines_with_savings: int = 0
    medicines_unresolved: int = 0
    average_confidence: float = 0.0
    details: List[MedicineSavingsDetail] = []


class PipelineStageProgress(BaseModel):
    """Progress for a single pipeline stage."""
    stage: str
    status: str  # pending, running, completed, failed
    message: Optional[str] = None
    details: Optional[dict] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class PipelineStatusResponse(BaseModel):
    """Full pipeline status."""
    run_id: str
    prescription_id: str
    status: str
    current_stage: str
    stages: List[PipelineStageProgress] = []
    started_at: datetime
    completed_at: Optional[datetime] = None
    error: Optional[str] = None


class PipelineEvent(BaseModel):
    """SSE event for pipeline progress."""
    event: str  # stage_start, stage_complete, medicine_progress, error, complete
    stage: Optional[str] = None
    medicine_id: Optional[str] = None
    medicine_name: Optional[str] = None
    message: str
    progress: Optional[float] = None
    details: Optional[dict] = None
    timestamp: datetime
