"""
Medicine Parser — extracts structured medicine data from OCR text.

Two-stage process:
1. Text Refinement (NEW): Uses fast LLM (Groq) to clean OCR noise and extract
   ONLY medicine names, dosage, and frequency — filtering out doctor names,
   clinic headers, patient info, dates, diagnosis text, etc.
2. Structured Parsing: Regex-based pattern recognition on the cleaned text
   to produce ParsedMedicine objects.
"""

import re
import json
from typing import List, Optional, Tuple

from app.schemas.medicine import ParsedMedicine
from app.utils.logging import get_logger

logger = get_logger("medicine_parser")

# Common Indian medicine name patterns
MEDICINE_LINE_PATTERNS = [
    # "1. Tab Olmesar 40 - 1 tablet once daily"
    re.compile(
        r"(?:\d+[\.)\]]\s*)?(?:Tab\.?|Cap\.?|Syp\.?|Inj\.?|Syr\.?)?\s*"
        r"([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*)*(?:\s+\d+(?:\.\d+)?)?)"
        r"\s*[-–—]?\s*(.*)",
        re.IGNORECASE,
    ),
    # Simpler pattern: "Olmesar 40 1 tablet daily"
    re.compile(
        r"([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*)*(?:\s+\d+(?:\.\d+)?)?)"
        r"\s+(\d+\s*(?:tablet|tab|capsule|cap|ml|mg).*)",
        re.IGNORECASE,
    ),
]

DOSAGE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu)\b", re.IGNORECASE)

FREQUENCY_PATTERNS = {
    "once daily": re.compile(
        r"(?:once\s+daily|once\s+a\s+day|1\s*(?:x|×)\s*daily|OD|o\.d\.)",
        re.IGNORECASE,
    ),
    "twice daily": re.compile(
        r"(?:twice\s+daily|twice\s+a\s+day|2\s*(?:x|×)\s*daily|BD|b\.d\.)",
        re.IGNORECASE,
    ),
    "thrice daily": re.compile(
        r"(?:thrice\s+daily|three\s+times?\s+(?:a\s+)?day|3\s*(?:x|×)\s*daily|TDS|t\.d\.s\.)",
        re.IGNORECASE,
    ),
    "at night": re.compile(
        r"(?:at\s+night|at\s+bedtime|HS|h\.s\.)",
        re.IGNORECASE,
    ),
    "before food": re.compile(
        r"(?:before\s+(?:food|meals?|breakfast|lunch|dinner)|AC|a\.c\.|empty\s+stomach)",
        re.IGNORECASE,
    ),
    "after food": re.compile(
        r"(?:after\s+(?:food|meals?|eating)|PC|p\.c\.)",
        re.IGNORECASE,
    ),
}

FREQUENCY_TO_DAILY = {
    "once daily": 1,
    "twice daily": 2,
    "thrice daily": 3,
    "at night": 1,
    "before food": 1,
    "after food": 1,
}

KNOWN_MEDICINE_KEYWORDS = {
    "olmesar", "ecosprin", "rablet", "montair", "glycomet", "metformin",
    "amlodipine", "atorvastatin", "aspirin", "pantoprazole", "telmisartan",
    "clopidogrel", "rosuvastatin", "losartan", "cilacar", "telma",
    "pan", "stamlo", "crestor", "lipitor", "nexium", "prilosec",
}

TEXT_REFINE_PROMPT = """You are a prescription text analyzer. Given messy OCR text from a medical prescription, extract ONLY the prescribed medicines.

RULES:
- Extract ONLY medicine/drug names with their dosage and frequency
- IGNORE: doctor name, clinic name, patient name, dates, addresses, phone numbers, diagnosis, advice, follow-up notes
- For each medicine, extract: name (brand name as written), dosage (e.g., 40mg), frequency (e.g., once daily, 1-0-1)
- Output a clean list, one medicine per line in this format: "MedicineName Dosage - Frequency"
- If dosage or frequency is unclear, still include the medicine name

OCR Text:
{ocr_text}

Output the cleaned medicine list ONLY, nothing else:"""

LLM_PARSE_PROMPT = """Extract all prescribed medicines from this text. Output JSON ONLY.

Text:
{text}

JSON format:
{{"medicines": [{{"name": "MedicineName", "dosage": "40mg", "frequency": "once daily", "daily_quantity": 1}}]}}"""


async def refine_ocr_text(raw_ocr_text: str) -> str:
    """
    Stage: Text Refinement — uses fast LLM (Groq) to clean OCR noise.

    Takes messy OCR text full of doctor names, clinic headers, dates, patient info,
    and returns ONLY the medicine lines, cleaned and normalized.
    """
    if not raw_ocr_text or len(raw_ocr_text.strip()) < 10:
        return raw_ocr_text

    logger.info("text_refinement_start", text_length=len(raw_ocr_text))

    try:
        from app.services.llm_router import LLMRouter
        llm = LLMRouter()

        prompt = TEXT_REFINE_PROMPT.format(ocr_text=raw_ocr_text[:2000])

        response = await llm.generate(
            task="parse_prescription",  # Routes to Groq for speed
            prompt=prompt,
            system_prompt="You are a medical prescription text cleaner. Output ONLY medicine names and dosages, nothing else.",
        )

        refined = response.text.strip()

        if not refined or len(refined) < 5:
            logger.warning("text_refinement_empty_result", fallback="using_raw_text")
            return raw_ocr_text

        logger.info(
            "text_refinement_complete",
            original_length=len(raw_ocr_text),
            refined_length=len(refined),
            provider=response.provider,
        )

        return refined

    except Exception as e:
        logger.error("text_refinement_error", error=str(e))
        return raw_ocr_text  # Graceful fallback to raw text


async def llm_parse_medicines(text: str) -> List[ParsedMedicine]:
    """
    Fallback: Use LLM to parse medicines when regex fails on messy text.
    """
    logger.info("llm_parse_start", text_length=len(text))

    try:
        from app.services.llm_router import LLMRouter
        llm = LLMRouter()

        prompt = LLM_PARSE_PROMPT.format(text=text[:2000])

        response = await llm.generate(
            task="parse_prescription",
            prompt=prompt,
            system_prompt="You are a medical prescription parser. Output ONLY valid JSON.",
        )

        resp_text = response.text
        if "```" in resp_text:
            match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', resp_text, re.DOTALL)
            if match:
                resp_text = match.group(1)

        data = json.loads(resp_text)
        medicines = []
        for m in data.get("medicines", []):
            medicines.append(ParsedMedicine(
                name=m["name"],
                dosage=m.get("dosage"),
                frequency=m.get("frequency"),
                daily_quantity=m.get("daily_quantity", 1),
            ))

        logger.info("llm_parse_complete", count=len(medicines), provider=response.provider)
        return medicines

    except Exception as e:
        logger.error("llm_parse_error", error=str(e))
        return []


def parse_medicines(ocr_text: str) -> List[ParsedMedicine]:
    """
    Parse refined text and extract structured medicine records.

    Strategy:
    1. Split text into lines
    2. For each line, attempt regex extraction
    3. Validate extracted names against known patterns
    4. Extract dosage and frequency information
    """
    logger.info("parsing_medicines", text_length=len(ocr_text))

    medicines: List[ParsedMedicine] = []
    lines = ocr_text.strip().split("\n")

    for line in lines:
        line = line.strip()
        if not line or len(line) < 3:
            continue

        parsed = _parse_line(line)
        if parsed:
            medicines.append(parsed)

    # Deduplicate by name
    seen_names = set()
    unique_medicines = []
    for med in medicines:
        normalized = med.name.lower().strip()
        if normalized not in seen_names:
            seen_names.add(normalized)
            unique_medicines.append(med)

    logger.info("medicines_parsed", count=len(unique_medicines))
    return unique_medicines


def _parse_line(line: str) -> Optional[ParsedMedicine]:
    """Attempt to parse a single line as a medicine entry."""

    # Skip header/footer lines
    skip_patterns = [
        r"^(?:dr\.?|patient|date|rx|follow|clinic|hospital|address|phone|mob)",
        r"^(?:sig|diagnosis|advice|note|next)",
    ]
    for pattern in skip_patterns:
        if re.match(pattern, line, re.IGNORECASE):
            return None

    # Try each extraction pattern
    for pattern in MEDICINE_LINE_PATTERNS:
        match = pattern.search(line)
        if match:
            name = match.group(1).strip()
            rest = match.group(2).strip() if match.lastindex and match.lastindex >= 2 else ""

            # Validate: name should look like a medicine name
            if not _is_valid_medicine_name(name):
                continue

            # Clean the name
            name = _clean_medicine_name(name)

            # Extract dosage from the name or rest of line
            dosage = _extract_dosage(name + " " + rest)

            # Extract frequency
            frequency, daily_qty = _extract_frequency(rest or line)

            return ParsedMedicine(
                name=name,
                dosage=dosage,
                frequency=frequency,
                daily_quantity=daily_qty,
            )

    return None


def _is_valid_medicine_name(name: str) -> bool:
    """Check if extracted text looks like a medicine name."""
    if len(name) < 2 or len(name) > 50:
        return False

    # Must start with a letter
    if not name[0].isalpha():
        return False

    # Should not be common non-medicine words
    skip_words = {
        "tab", "tablet", "cap", "capsule", "syp", "syrup", "inj", "injection",
        "the", "and", "for", "with", "daily", "take", "after", "before",
        "food", "meal", "month", "week", "days", "follow",
    }
    if name.lower() in skip_words:
        return False

    # Check if it contains at least one word that could be a medicine name
    words = name.lower().split()
    first_word = words[0] if words else ""

    # Known medicine names are strong signal
    if first_word in KNOWN_MEDICINE_KEYWORDS:
        return True

    # Medicine names typically start with uppercase and have specific patterns
    if name[0].isupper() and len(words) <= 4:
        return True

    return False


def _clean_medicine_name(name: str) -> str:
    """Clean extracted medicine name."""
    prefixes = ["Tab ", "Tab. ", "Cap ", "Cap. ", "Syp ", "Syp. ", "Inj ", "Inj. "]
    for prefix in prefixes:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break

    return name.strip()


def _extract_dosage(text: str) -> Optional[str]:
    """Extract dosage information from text."""
    match = DOSAGE_PATTERN.search(text)
    if match:
        return f"{match.group(1)} {match.group(2).lower()}"
    return None


def _extract_frequency(text: str) -> Tuple[Optional[str], Optional[int]]:
    """Extract frequency and calculate daily quantity."""
    for freq_name, pattern in FREQUENCY_PATTERNS.items():
        if pattern.search(text):
            daily_qty = FREQUENCY_TO_DAILY.get(freq_name, 1)
            return freq_name, daily_qty

    return None, None
