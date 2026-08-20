"""
Statistical Engine — applies statistical methods to determine reliable consensus prices.

Implements:
1. Basic validation (remove invalid prices)
2. IQR outlier detection
3. Median calculation for consensus
4. Confidence scoring

This engine is independent of any LLM — pure statistical analysis.
"""

import statistics
from dataclasses import dataclass, field
from typing import List, Tuple, Optional

from app.utils.logging import get_logger

logger = get_logger("statistical_engine")


@dataclass
class StatisticalResult:
    """Result of statistical analysis on price candidates."""
    valid_prices: List[float] = field(default_factory=list)
    outlier_prices: List[float] = field(default_factory=list)
    outlier_indices: List[int] = field(default_factory=list)
    median_price: Optional[float] = None
    mean_price: Optional[float] = None
    std_dev: Optional[float] = None
    q1: Optional[float] = None
    q3: Optional[float] = None
    iqr: Optional[float] = None
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    confidence: float = 0.0
    source_count: int = 0
    outlier_count: int = 0


def validate_prices(prices: List[float]) -> List[float]:
    """
    Step 1: Basic validation — remove invalid prices.

    Removes:
    - Negative prices
    - Zero prices
    - None values
    - Prices that are unreasonably high (> ₹50,000)
    - Prices that are unreasonably low (< ₹1)
    """
    valid = []
    for p in prices:
        if p is None:
            continue
        if p <= 0:
            continue
        if p > 50000:  # Unreasonably high for Indian medicines
            continue
        if p < 1:  # Unreasonably low
            continue
        valid.append(p)
    return valid


def detect_outliers_iqr(prices: List[float]) -> Tuple[List[float], List[float], List[int]]:
    """
    Step 2: IQR-based outlier detection.

    Calculates Q1, Q3, IQR and removes values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR].

    Returns:
        Tuple of (valid_prices, outlier_prices, outlier_indices)
    """
    if len(prices) < 3:
        # Not enough data for IQR analysis
        return prices, [], []

    sorted_prices = sorted(prices)
    n = len(sorted_prices)

    # Calculate Q1 and Q3
    q1_idx = n // 4
    q3_idx = (3 * n) // 4

    q1 = sorted_prices[q1_idx]
    q3 = sorted_prices[q3_idx]
    iqr = q3 - q1

    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

    valid = []
    outliers = []
    outlier_indices = []

    for i, p in enumerate(prices):
        if lower_bound <= p <= upper_bound:
            valid.append(p)
        else:
            outliers.append(p)
            outlier_indices.append(i)

    logger.info(
        "iqr_analysis",
        q1=q1, q3=q3, iqr=iqr,
        lower=lower_bound, upper=upper_bound,
        valid=len(valid), outliers=len(outliers),
    )

    return valid, outliers, outlier_indices


def calculate_median(prices: List[float]) -> Optional[float]:
    """Step 3: Calculate median as the consensus price."""
    if not prices:
        return None
    return round(statistics.median(prices), 2)


def calculate_confidence(
    source_count: int,
    valid_count: int,
    outlier_count: int,
    std_dev: Optional[float] = None,
    median: Optional[float] = None,
) -> float:
    """
    Step 4: Calculate a confidence score (0.0 to 1.0).

    Factors:
    - Number of sources (more = higher confidence)
    - Source agreement (lower std dev relative to median = higher)
    - Outlier percentage (fewer outliers = higher)
    - Data availability
    """
    if source_count == 0 or valid_count == 0:
        return 0.0

    # Factor 1: Source count (1 source = 0.3, 3+ = 0.9, 5+ = 1.0)
    source_factor = min(1.0, 0.3 + (source_count - 1) * 0.2)

    # Factor 2: Price agreement (coefficient of variation)
    agreement_factor = 1.0
    if std_dev is not None and median is not None and median > 0:
        cv = std_dev / median  # coefficient of variation
        if cv < 0.05:
            agreement_factor = 1.0
        elif cv < 0.1:
            agreement_factor = 0.9
        elif cv < 0.2:
            agreement_factor = 0.7
        elif cv < 0.5:
            agreement_factor = 0.5
        else:
            agreement_factor = 0.3

    # Factor 3: Outlier ratio
    total = valid_count + outlier_count
    outlier_ratio = outlier_count / total if total > 0 else 0
    outlier_factor = 1.0 - outlier_ratio

    # Weighted combination
    confidence = (
        source_factor * 0.4 +
        agreement_factor * 0.4 +
        outlier_factor * 0.2
    )

    return round(min(1.0, max(0.0, confidence)), 2)


def analyze_prices(prices: List[float]) -> StatisticalResult:
    """
    Full statistical analysis pipeline.

    Combines all steps: validation → IQR outlier detection → median → confidence.
    """
    result = StatisticalResult()
    result.source_count = len(prices)

    if not prices:
        return result

    # Step 1: Validate
    valid_prices = validate_prices(prices)

    if not valid_prices:
        return result

    # Step 2: Outlier detection
    clean_prices, outliers, outlier_indices = detect_outliers_iqr(valid_prices)

    result.valid_prices = clean_prices
    result.outlier_prices = outliers
    result.outlier_indices = outlier_indices
    result.outlier_count = len(outliers)

    if not clean_prices:
        return result

    # Step 3: Statistics
    result.median_price = calculate_median(clean_prices)
    result.mean_price = round(statistics.mean(clean_prices), 2)

    if len(clean_prices) >= 2:
        result.std_dev = round(statistics.stdev(clean_prices), 2)

    sorted_clean = sorted(clean_prices)
    n = len(sorted_clean)
    if n >= 4:
        result.q1 = sorted_clean[n // 4]
        result.q3 = sorted_clean[(3 * n) // 4]
        result.iqr = result.q3 - result.q1
        result.lower_bound = result.q1 - 1.5 * result.iqr
        result.upper_bound = result.q3 + 1.5 * result.iqr

    # Step 4: Confidence
    result.confidence = calculate_confidence(
        source_count=result.source_count,
        valid_count=len(clean_prices),
        outlier_count=result.outlier_count,
        std_dev=result.std_dev,
        median=result.median_price,
    )

    logger.info(
        "price_analysis_complete",
        sources=result.source_count,
        valid=len(clean_prices),
        outliers=result.outlier_count,
        median=result.median_price,
        confidence=result.confidence,
    )

    return result
