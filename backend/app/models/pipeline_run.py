"""PipelineRun model — tracks the progress of a prescription processing pipeline."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database.database import Base


class PipelineStage(str, enum.Enum):
    UPLOAD = "upload"
    OCR = "ocr"
    REFINE = "refine"              # NEW: LLM text refinement (clean OCR → pure medicine names)
    PARSE = "parse"
    DB_LOOKUP = "db_lookup"        # NEW: Phase 1 — strict DB cache check
    COMPOSITION = "composition"
    DISCOVERY = "discovery"        # NEW: Phase 3 — multi-shot parallel price discovery
    CONSENSUS = "consensus"        # NEW: Phase 4 — IQR clustering + CV validation
    SAVINGS = "savings"
    COMPLETE = "complete"
    FAILED = "failed"


class PipelineStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    prescription_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("prescriptions.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=PipelineStatus.PENDING.value
    )
    current_stage: Mapped[str] = mapped_column(
        String(30), default=PipelineStage.UPLOAD.value
    )
    progress: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    logs: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Relationships
    prescription: Mapped["Prescription"] = relationship(
        "Prescription", back_populates="pipeline_runs"
    )

    def __repr__(self) -> str:
        return (
            f"<PipelineRun id={self.id} status={self.status} "
            f"stage={self.current_stage}>"
        )
