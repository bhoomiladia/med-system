"""Price models — PriceCandidate (raw price data) and FinalPrice (consensus result)."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database.database import Base


class PriceType(str, enum.Enum):
    BRANDED = "branded"
    GENERIC = "generic"


class PriceCandidate(Base):
    __tablename__ = "price_candidates"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    medicine_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # branded / generic
    candidate_name: Mapped[str] = mapped_column(String(255), nullable=False)
    composition: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(5), default="INR")
    pack_quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    is_outlier: Mapped[bool] = mapped_column(default=False)
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    raw_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    medicine: Mapped["Medicine"] = relationship(
        "Medicine", back_populates="price_candidates"
    )

    def __repr__(self) -> str:
        return (
            f"<PriceCandidate id={self.id} type={self.type} "
            f"name={self.candidate_name} price={self.price}>"
        )


class FinalPrice(Base):
    __tablename__ = "final_prices"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    medicine_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("medicines.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    branded_unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    generic_unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    branded_pack_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    generic_pack_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    branded_pack_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generic_pack_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generic_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    branded_monthly_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    generic_monthly_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_savings: Mapped[float | None] = mapped_column(Float, nullable=True)
    savings_percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    monthly_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    medicine: Mapped["Medicine"] = relationship(
        "Medicine", back_populates="final_price"
    )

    def __repr__(self) -> str:
        return (
            f"<FinalPrice id={self.id} branded={self.branded_unit_price} "
            f"generic={self.generic_unit_price} savings={self.savings_percentage}%>"
        )
