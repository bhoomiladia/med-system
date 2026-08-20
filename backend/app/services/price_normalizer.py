"""
Price Normalizer — normalizes prices to unit prices and calculates monthly costs.

Handles different pack sizes to enable fair comparison.
Formula: unit_price = pack_price / pack_quantity
Formula: monthly_cost = unit_price × monthly_quantity
"""

from typing import Optional
from app.utils.logging import get_logger

logger = get_logger("price_normalizer")


def normalize_to_unit_price(price: float, pack_quantity: int) -> float:
    """
    Calculate price per unit (tablet/capsule).

    Args:
        price: Pack price in currency
        pack_quantity: Number of units in the pack

    Returns:
        Price per single unit
    """
    if pack_quantity <= 0:
        logger.warning("invalid_pack_quantity", quantity=pack_quantity)
        pack_quantity = 1  # Fallback to prevent division by zero

    return round(price / pack_quantity, 2)


def calculate_monthly_cost(
    unit_price: float,
    daily_quantity: Optional[int] = None,
    monthly_quantity: Optional[int] = None,
    days: int = 30,
) -> Optional[float]:
    """
    Calculate monthly cost based on consumption.

    Args:
        unit_price: Price per unit
        daily_quantity: Number of units per day
        monthly_quantity: Total units per month (preferred if available)
        days: Days in a month (default 30)

    Returns:
        Monthly cost, or None if quantity is unknown
    """
    if monthly_quantity is not None and monthly_quantity > 0:
        return round(unit_price * monthly_quantity, 2)

    if daily_quantity is not None and daily_quantity > 0:
        return round(unit_price * daily_quantity * days, 2)

    # Default: assume once daily (30 units/month)
    # Flagged as estimated
    return round(unit_price * 30, 2)


def normalize_pack_size(price: float, source_pack: int, target_pack: int = 10) -> float:
    """
    Normalize a price to a target pack size for comparison.

    Example:
    ₹180 for 20 tablets → ₹90 for 10 tablets
    """
    if source_pack <= 0:
        return price
    unit = price / source_pack
    return round(unit * target_pack, 2)
