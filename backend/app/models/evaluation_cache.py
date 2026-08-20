"""EvaluationCache model — stores computed clustering models, accuracy benchmarks, and custom ground truth."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base


class EvaluationCache(Base):
    __tablename__ = "evaluation_cache"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True  # e.g., "global_metrics" or "prescription_{prescription_id}"
    )
    cache_type: Mapped[str] = mapped_column(String(30), nullable=False)  # "global" or "prescription"
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<EvaluationCache id={self.id} type={self.cache_type}>"
