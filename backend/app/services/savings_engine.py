"""
Savings Engine — calculates final savings for each medicine and the full prescription.

Core formulas:
  monthly_savings = branded_monthly_cost - generic_monthly_cost
  savings_percentage = (monthly_savings / branded_monthly_cost) × 100
  yearly_savings = monthly_savings × 12
"""

from typing import Optional, List
from dataclasses import dataclass, field

from app.utils.logging import get_logger

logger = get_logger("savings_engine")


@dataclass
class MedicineSavings:
    """Savings calculation for a single medicine."""
    medicine_id: str
    medicine_name: str
    branded_unit_price: Optional[float] = None
    generic_unit_price: Optional[float] = None
    branded_pack_price: Optional[float] = None
    generic_pack_price: Optional[float] = None
    branded_pack_size: Optional[int] = None
    generic_pack_size: Optional[int] = None
    generic_name: Optional[str] = None
    monthly_quantity: Optional[int] = None
    branded_monthly_cost: Optional[float] = None
    generic_monthly_cost: Optional[float] = None
    monthly_savings: Optional[float] = None
    savings_percentage: Optional[float] = None
    confidence: float = 0.0
    is_resolved: bool = False


@dataclass
class PrescriptionSavings:
    """Aggregate savings for the full prescription."""
    total_branded_monthly: float = 0.0
    total_generic_monthly: float = 0.0
    total_monthly_savings: float = 0.0
    total_yearly_savings: float = 0.0
    overall_savings_percentage: float = 0.0
    medicines_analyzed: int = 0
    medicines_with_savings: int = 0
    medicines_unresolved: int = 0
    average_confidence: float = 0.0
    medicine_savings: List[MedicineSavings] = field(default_factory=list)


def calculate_medicine_savings(
    medicine_id: str,
    medicine_name: str,
    branded_unit_price: Optional[float],
    generic_unit_price: Optional[float],
    branded_pack_price: Optional[float] = None,
    generic_pack_price: Optional[float] = None,
    branded_pack_size: Optional[int] = None,
    generic_pack_size: Optional[int] = None,
    generic_name: Optional[str] = None,
    monthly_quantity: Optional[int] = None,
    confidence: float = 0.0,
) -> MedicineSavings:
    """
    Calculate savings for a single medicine.

    If monthly_quantity is unavailable, assumes 30 units/month (once daily).
    """
    savings = MedicineSavings(
        medicine_id=medicine_id,
        medicine_name=medicine_name,
        branded_unit_price=branded_unit_price,
        generic_unit_price=generic_unit_price,
        branded_pack_price=branded_pack_price,
        generic_pack_price=generic_pack_price,
        branded_pack_size=branded_pack_size,
        generic_pack_size=generic_pack_size,
        generic_name=generic_name,
        monthly_quantity=monthly_quantity,
        confidence=confidence,
    )

    if branded_unit_price is None or generic_unit_price is None:
        savings.is_resolved = False
        return savings

    if branded_unit_price <= 0:
        savings.is_resolved = False
        return savings

    savings.is_resolved = True

    # Use monthly quantity or default to 30
    qty = monthly_quantity if monthly_quantity and monthly_quantity > 0 else 30
    savings.monthly_quantity = qty

    # Calculate monthly costs
    savings.branded_monthly_cost = round(branded_unit_price * qty, 2)
    savings.generic_monthly_cost = round(generic_unit_price * qty, 2)

    # Calculate savings
    savings.monthly_savings = round(
        savings.branded_monthly_cost - savings.generic_monthly_cost, 2
    )
    savings.savings_percentage = round(
        (savings.monthly_savings / savings.branded_monthly_cost) * 100, 1
    )

    # Don't show negative savings (generic more expensive than branded)
    if savings.monthly_savings < 0:
        savings.monthly_savings = 0
        savings.savings_percentage = 0

    logger.info(
        "medicine_savings_calculated",
        medicine=medicine_name,
        branded_monthly=savings.branded_monthly_cost,
        generic_monthly=savings.generic_monthly_cost,
        savings=savings.monthly_savings,
        percentage=savings.savings_percentage,
    )

    return savings


def calculate_prescription_savings(
    medicine_savings_list: List[MedicineSavings],
) -> PrescriptionSavings:
    """
    Aggregate savings across all medicines in a prescription.

    Only includes resolved medicines in totals.
    """
    result = PrescriptionSavings()
    result.medicine_savings = medicine_savings_list

    confidences = []

    for ms in medicine_savings_list:
        result.medicines_analyzed += 1

        if not ms.is_resolved:
            result.medicines_unresolved += 1
            continue

        if ms.branded_monthly_cost and ms.generic_monthly_cost:
            result.total_branded_monthly += ms.branded_monthly_cost
            result.total_generic_monthly += ms.generic_monthly_cost

            if ms.monthly_savings and ms.monthly_savings > 0:
                result.medicines_with_savings += 1

            confidences.append(ms.confidence)

    # Calculate totals
    result.total_monthly_savings = round(
        result.total_branded_monthly - result.total_generic_monthly, 2
    )
    result.total_yearly_savings = round(result.total_monthly_savings * 12, 2)

    if result.total_branded_monthly > 0:
        result.overall_savings_percentage = round(
            (result.total_monthly_savings / result.total_branded_monthly) * 100, 1
        )

    if confidences:
        result.average_confidence = round(
            sum(confidences) / len(confidences), 2
        )

    # Don't show negative total savings
    if result.total_monthly_savings < 0:
        result.total_monthly_savings = 0
        result.total_yearly_savings = 0
        result.overall_savings_percentage = 0

    logger.info(
        "prescription_savings_calculated",
        medicines=result.medicines_analyzed,
        resolved=result.medicines_analyzed - result.medicines_unresolved,
        total_monthly_savings=result.total_monthly_savings,
        percentage=result.overall_savings_percentage,
    )

    return result
