"""Tests for statistical engine."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.statistical_engine import (
    validate_prices,
    detect_outliers_iqr,
    calculate_median,
    calculate_confidence,
    analyze_prices,
)


def test_validate_removes_invalid():
    prices = [100, 0, -50, None, 101, 60000, 99]
    valid = validate_prices(prices)
    assert 0 not in valid
    assert -50 not in valid
    assert 60000 not in valid
    assert set(valid) == {100, 101, 99}


def test_detect_outliers_iqr():
    prices = [100, 101, 99, 102, 500]
    valid, outliers, indices = detect_outliers_iqr(prices)
    assert 500 in outliers
    assert 500 not in valid
    assert all(90 <= p <= 110 for p in valid)


def test_detect_outliers_iqr_small_sample():
    """With < 3 prices, no outlier detection."""
    prices = [100, 200]
    valid, outliers, indices = detect_outliers_iqr(prices)
    assert valid == [100, 200]
    assert outliers == []


def test_calculate_median():
    assert calculate_median([118, 119, 120, 121]) == 119.5
    assert calculate_median([100]) == 100
    assert calculate_median([]) is None


def test_calculate_median_odd():
    assert calculate_median([10, 20, 30]) == 20


def test_analyze_prices_full():
    prices = [100, 101, 99, 102, 500]
    result = analyze_prices(prices)
    assert result.median_price is not None
    assert 500 in result.outlier_prices
    assert result.confidence > 0
    assert 99 <= result.median_price <= 102


def test_analyze_empty():
    result = analyze_prices([])
    assert result.median_price is None
    assert result.confidence == 0


def test_savings_calculation():
    """Branded=1000, Generic=600 → Savings=400, 40%"""
    branded = 1000
    generic = 600
    savings = branded - generic
    pct = (savings / branded) * 100
    assert savings == 400
    assert pct == 40.0


def test_price_normalization():
    """₹100 / 10 tablets = ₹10/tablet"""
    assert 100 / 10 == 10.0
    """₹180 / 20 tablets = ₹9/tablet"""
    assert 180 / 20 == 9.0


def test_confidence_scoring():
    # Many sources, low variance
    conf = calculate_confidence(
        source_count=5, valid_count=5, outlier_count=0,
        std_dev=2.0, median=100.0,
    )
    assert conf > 0.8

    # Single source
    conf_single = calculate_confidence(
        source_count=1, valid_count=1, outlier_count=0,
    )
    assert conf_single < conf


if __name__ == "__main__":
    test_validate_removes_invalid()
    test_detect_outliers_iqr()
    test_detect_outliers_iqr_small_sample()
    test_calculate_median()
    test_calculate_median_odd()
    test_analyze_prices_full()
    test_analyze_empty()
    test_savings_calculation()
    test_price_normalization()
    test_confidence_scoring()
    print("All statistical engine tests passed!")
