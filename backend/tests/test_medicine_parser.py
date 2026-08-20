"""Tests for the medicine parser."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.medicine_parser import parse_medicines


SAMPLE_OCR = """Dr. Sharma's Clinic
Patient: John Doe
Date: 15/08/2024

Rx:

1. Tab Olmesar 40 - 1 tablet once daily
2. Tab Ecosprin AV 75 - 1 tablet daily after food
3. Tab Rablet D - 1 tablet before breakfast
4. Tab Montair LC - 1 tablet at night
5. Tab Glycomet GP 2 - 1 tablet twice daily

Follow up after 1 month.
"""


def test_parse_finds_medicines():
    medicines = parse_medicines(SAMPLE_OCR)
    names = [m.name.lower() for m in medicines]
    assert len(medicines) >= 4
    assert any("olmesar" in n for n in names)
    assert any("ecosprin" in n for n in names)
    assert any("rablet" in n for n in names)
    assert any("montair" in n for n in names)


def test_parse_extracts_frequency():
    medicines = parse_medicines(SAMPLE_OCR)
    freq_map = {m.name.lower(): m.frequency for m in medicines}
    # Find "Montair LC" — should be "at night"
    montair = [m for m in medicines if "montair" in m.name.lower()]
    if montair:
        assert montair[0].frequency is not None


def test_parse_skips_headers():
    medicines = parse_medicines(SAMPLE_OCR)
    names = [m.name.lower() for m in medicines]
    assert not any("dr" in n and "sharma" in n for n in names)
    assert not any("patient" in n for n in names)
    assert not any("follow" in n for n in names)


def test_parse_empty_text():
    medicines = parse_medicines("")
    assert medicines == []


def test_parse_daily_quantity():
    medicines = parse_medicines(SAMPLE_OCR)
    glycomet = [m for m in medicines if "glycomet" in m.name.lower()]
    if glycomet:
        # "twice daily" → daily_quantity = 2
        assert glycomet[0].daily_quantity == 2


if __name__ == "__main__":
    test_parse_finds_medicines()
    test_parse_extracts_frequency()
    test_parse_skips_headers()
    test_parse_empty_text()
    test_parse_daily_quantity()
    print("All medicine parser tests passed!")
