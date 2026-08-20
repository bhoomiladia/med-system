"""Medicine model — represents an individual medicine extracted from a prescription."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database.database import Base


class MedicineStatus(str, enum.Enum):
    PENDING = "pending"
    COMPOSITION_FOUND = "composition_found"
    COMPOSITION_FAILED = "composition_failed"
    PRICES_FOUND = "prices_found"
    PRICES_FAILED = "prices_failed"
    COMPLETED = "completed"
    FAILED = "failed"


class Medicine(Base):
    __tablename__ = "medicines"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    prescription_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("prescriptions.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dosage: Mapped[str | None] = mapped_column(String(50), nullable=True)
    frequency: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    daily_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), default=MedicineStatus.PENDING.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    prescription: Mapped["Prescription"] = relationship(
        "Prescription", back_populates="medicines"
    )
    compositions: Mapped[list["Composition"]] = relationship(
        "Composition", back_populates="medicine", cascade="all, delete-orphan"
    )
    price_candidates: Mapped[list["PriceCandidate"]] = relationship(
        "PriceCandidate", back_populates="medicine", cascade="all, delete-orphan"
    )
    final_price: Mapped["FinalPrice | None"] = relationship(
        "FinalPrice", back_populates="medicine", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def monthly_quantity(self) -> int | None:
        """Calculate expected monthly consumption."""
        if self.daily_quantity:
            return self.daily_quantity * 30
        if self.quantity:
            return self.quantity
        return None

    def __repr__(self) -> str:
        return f"<Medicine id={self.id} name={self.name} status={self.status}>"
