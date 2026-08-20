"""Tests for composition normalizer."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.schemas.composition import IngredientSchema
from app.services.composition_normalizer import (
    normalize_composition,
    normalize_ingredient_name,
    convert_to_mg,
    compositions_match,
    parse_composition_string,
)


def test_normalize_ingredient_name_basic():
    assert normalize_ingredient_name("Rabeprazole") == "rabeprazole"
    assert normalize_ingredient_name("ASPIRIN") == "aspirin"


def test_normalize_ingredient_name_strip_salts():
    assert normalize_ingredient_name("Rabeprazole Sodium") == "rabeprazole"
    assert normalize_ingredient_name("Amlodipine Besylate") == "amlodipine"
    assert normalize_ingredient_name("Olmesartan Medoxomil") == "olmesartan"
    assert normalize_ingredient_name("Metformin Hydrochloride") == "metformin"


def test_convert_to_mg():
    assert convert_to_mg(500, "mg") == 500.0
    assert convert_to_mg(250, "mcg") == 0.25
    assert convert_to_mg(1, "g") == 1000.0


def test_normalize_composition_single():
    ingredients = [IngredientSchema(name="Rabeprazole", strength=20, unit="mg")]
    result = normalize_composition(ingredients)
    assert len(result.ingredients) == 1
    assert result.ingredients[0].name == "rabeprazole"
    assert result.ingredients[0].strength_mg == 20.0
    assert not result.is_combination


def test_normalize_composition_combination():
    ingredients = [
        IngredientSchema(name="Rabeprazole", strength=20, unit="mg"),
        IngredientSchema(name="Domperidone", strength=30, unit="mg"),
    ]
    result = normalize_composition(ingredients)
    assert len(result.ingredients) == 2
    assert result.is_combination
    # Should be sorted alphabetically
    assert result.ingredients[0].name == "domperidone"
    assert result.ingredients[1].name == "rabeprazole"


def test_compositions_match_order_independent():
    """Rabeprazole 20mg + Domperidone 30mg == Domperidone 30mg + Rabeprazole 20mg"""
    comp_a = normalize_composition([
        IngredientSchema(name="Rabeprazole", strength=20, unit="mg"),
        IngredientSchema(name="Domperidone", strength=30, unit="mg"),
    ])
    comp_b = normalize_composition([
        IngredientSchema(name="Domperidone", strength=30, unit="mg"),
        IngredientSchema(name="Rabeprazole", strength=20, unit="mg"),
    ])
    assert compositions_match(comp_a, comp_b)


def test_compositions_match_salt_names():
    """Olmesartan Medoxomil 40mg == Olmesartan 40mg"""
    comp_a = normalize_composition([
        IngredientSchema(name="Olmesartan Medoxomil", strength=40, unit="mg"),
    ])
    comp_b = normalize_composition([
        IngredientSchema(name="Olmesartan", strength=40, unit="mg"),
    ])
    assert compositions_match(comp_a, comp_b)


def test_compositions_no_match_different_strength():
    comp_a = normalize_composition([
        IngredientSchema(name="Aspirin", strength=75, unit="mg"),
    ])
    comp_b = normalize_composition([
        IngredientSchema(name="Aspirin", strength=150, unit="mg"),
    ])
    assert not compositions_match(comp_a, comp_b)


def test_compositions_no_match_partial_combination():
    """Single ingredient should NOT match combination."""
    comp_single = normalize_composition([
        IngredientSchema(name="Rabeprazole", strength=20, unit="mg"),
    ])
    comp_combo = normalize_composition([
        IngredientSchema(name="Rabeprazole", strength=20, unit="mg"),
        IngredientSchema(name="Domperidone", strength=30, unit="mg"),
    ])
    assert not compositions_match(comp_single, comp_combo)


def test_parse_composition_string():
    text = "Rabeprazole 20mg + Domperidone 30mg"
    ingredients = parse_composition_string(text)
    assert len(ingredients) == 2
    assert ingredients[0].name == "Rabeprazole"
    assert ingredients[0].strength == 20
    assert ingredients[1].name == "Domperidone"
    assert ingredients[1].strength == 30


if __name__ == "__main__":
    test_normalize_ingredient_name_basic()
    test_normalize_ingredient_name_strip_salts()
    test_convert_to_mg()
    test_normalize_composition_single()
    test_normalize_composition_combination()
    test_compositions_match_order_independent()
    test_compositions_match_salt_names()
    test_compositions_no_match_different_strength()
    test_compositions_no_match_partial_combination()
    test_parse_composition_string()
    print("All composition normalizer tests passed!")
