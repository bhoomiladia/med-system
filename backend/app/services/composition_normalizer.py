"""
Composition Normalizer — normalizes and canonicalizes medicine compositions.

Handles:
- Case normalization
- Salt name removal
- Unit conversion (mcg→mg, g→mg)
- Alphabetical ordering for canonical comparison
- Combination medicine matching
"""

import re
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, field

from app.schemas.composition import IngredientSchema
from app.utils.logging import get_logger

logger = get_logger("composition_normalizer")

# Common salt suffixes to strip for matching
SALT_SUFFIXES = [
    "hydrochloride", "hcl", "sodium", "potassium", "calcium",
    "maleate", "besylate", "fumarate", "tartrate", "succinate",
    "acetate", "phosphate", "sulfate", "citrate", "nitrate",
    "mesylate", "medoxomil", "dihydrate", "monohydrate",
    "bromide", "chloride", "lactate",
]

# Unit conversion to mg
UNIT_TO_MG = {
    "mg": 1.0,
    "mcg": 0.001,
    "g": 1000.0,
    "ml": 1.0,   # for liquids, treat 1ml as base unit
    "iu": 1.0,   # international units, keep as-is
    "unit": 1.0,
    "%": 1.0,
}


@dataclass
class NormalizedIngredient:
    """A normalized ingredient for canonical comparison."""
    name: str  # lowercased, salt-stripped
    strength_mg: float  # converted to mg
    original_name: str  # preserved for display
    original_strength: float
    original_unit: str


@dataclass
class NormalizedComposition:
    """A normalized, canonicalized composition."""
    ingredients: List[NormalizedIngredient] = field(default_factory=list)
    canonical_key: str = ""  # for comparison/hashing

    @property
    def is_combination(self) -> bool:
        return len(self.ingredients) > 1

    def to_dict(self) -> dict:
        return {
            "ingredients": [
                {
                    "name": ing.name,
                    "strength_mg": ing.strength_mg,
                    "original_name": ing.original_name,
                    "original_strength": ing.original_strength,
                    "original_unit": ing.original_unit,
                }
                for ing in self.ingredients
            ],
            "canonical_key": self.canonical_key,
            "is_combination": self.is_combination,
        }


def normalize_composition(ingredients: List[IngredientSchema]) -> NormalizedComposition:
    """
    Normalize a list of ingredients into a canonical composition.

    Steps:
    1. Normalize each ingredient name (lowercase, strip salts)
    2. Convert strengths to mg
    3. Sort alphabetically by normalized name
    4. Generate canonical key for comparison
    """
    normalized = []

    for ing in ingredients:
        norm_name = normalize_ingredient_name(ing.name)
        strength_mg = convert_to_mg(ing.strength, ing.unit)

        normalized.append(NormalizedIngredient(
            name=norm_name,
            strength_mg=strength_mg,
            original_name=ing.name,
            original_strength=ing.strength,
            original_unit=ing.unit,
        ))

    # Sort by normalized name for canonical ordering
    normalized.sort(key=lambda x: x.name)

    # Generate canonical key
    canonical_key = "+".join(
        f"{ing.name}:{ing.strength_mg}" for ing in normalized
    )

    return NormalizedComposition(
        ingredients=normalized,
        canonical_key=canonical_key,
    )


def normalize_ingredient_name(name: str) -> str:
    """
    Normalize an ingredient name by lowercasing and stripping salt suffixes.

    Examples:
    - "Rabeprazole Sodium" → "rabeprazole"
    - "Amlodipine Besylate" → "amlodipine"
    - "Olmesartan Medoxomil" → "olmesartan"
    """
    name = name.lower().strip()

    # Remove salt suffixes
    for suffix in SALT_SUFFIXES:
        pattern = re.compile(r"\s+" + re.escape(suffix) + r"\b", re.IGNORECASE)
        name = pattern.sub("", name)

    # Remove extra whitespace
    name = re.sub(r"\s+", " ", name).strip()

    return name


def convert_to_mg(strength: float, unit: str) -> float:
    """Convert a strength to milligrams."""
    unit = unit.lower().strip()
    factor = UNIT_TO_MG.get(unit, 1.0)
    return strength * factor


def compositions_match(a: NormalizedComposition, b: NormalizedComposition) -> bool:
    """
    Check if two compositions are equivalent.

    Both must have the same ingredients at the same strengths.
    Order does not matter (already sorted).
    """
    if len(a.ingredients) != len(b.ingredients):
        return False

    for ing_a, ing_b in zip(a.ingredients, b.ingredients):
        if ing_a.name != ing_b.name:
            return False
        # Allow 5% tolerance for floating point
        if abs(ing_a.strength_mg - ing_b.strength_mg) > 0.05 * max(ing_a.strength_mg, ing_b.strength_mg, 0.01):
            return False

    return True


def parse_composition_string(text: str) -> List[IngredientSchema]:
    """
    Parse a raw composition string like 'Rabeprazole 20mg + Domperidone 30mg'
    into a list of IngredientSchema.
    """
    ingredients = []

    # Split by common delimiters
    parts = re.split(r"\s*(?:\+|&|,|\band\b)\s*", text)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Match "Name StrengthUnit"
        match = re.match(
            r"([A-Za-z][A-Za-z\s\-]+?)\s*(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|%|units?)\b",
            part, re.IGNORECASE,
        )

        if match:
            ingredients.append(IngredientSchema(
                name=match.group(1).strip(),
                strength=float(match.group(2)),
                unit=match.group(3).lower(),
            ))

    return ingredients
