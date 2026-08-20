"""Composition model — represents the verified composition of a medicine."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base


class Composition(Base):
    __tablename__ = "compositions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    medicine_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False
    )
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_composition: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    medicine: Mapped["Medicine"] = relationship(
        "Medicine", back_populates="compositions"
    )

    def __repr__(self) -> str:
        return f"<Composition id={self.id} medicine_id={self.medicine_id} source={self.source}>"
