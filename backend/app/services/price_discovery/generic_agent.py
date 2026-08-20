"""
Generic Price Agent — discovers prices for generic equivalent medicines.

Uses 4 models running 5 shots each (20 shots total) with temperature 0.2 to 0.8:
1. Groq Llama-3.3-70B
2. Groq Llama-3.1-8B
3. Gemini 2.5 Flash (with Google Search grounding)
4. LM Studio Qwen (Local)
Plus Firecrawl web search.

CRITICAL: Generic MUST contain ALL ingredients matching the exact composition.
"""

import re
import asyncio
import json
from typing import List, Optional

from app.services.price_discovery.base_agent import PriceAgent
from app.services.composition_normalizer import NormalizedComposition
from app.services.scraper.firecrawl_scraper import FirecrawlScraper
from app.services.llm_router import LLMRouter
from app.schemas.price import PriceCandidateCreate
from app.config import settings
from app.utils.logging import get_logger
from app.utils.url_builder import build_direct_product_url

logger = get_logger("generic_agent")

GENERIC_PRICE_PROMPT = """You are a pharmaceutical price analyst specializing in Indian generic medicines.

Given the composition below, find GENERIC alternatives (NOT the branded medicine) and their prices.

IMPORTANT RULES:
- Find generic/unbranded equivalents with the EXACT SAME composition
- For combination medicines, the generic MUST contain ALL ingredients at the same strengths
- Include medicine name, price in INR, pack size, specific store/source (e.g. Jan Aushadhi, Medkart, Zeelab, Truemeds, 1mg Generic, Apollo Generic), and the specific direct product/store URL (e.g., https://janaushadhi.gov.in/product/... or https://www.1mg.com/drugs/...)
- Only include real products available in India
- Output ONLY valid JSON

Composition: {composition}
Original branded medicine: {original_name}

Output format:
{{
  "generics": [
    {{
      "name": "Generic Medicine Name",
      "composition": "Full composition string",
      "price": 85.0,
      "pack_size": 10,
      "source": "Jan Aushadhi",
      "source_url": "https://janaushadhi.gov.in/product/generic-medicine-name",
      "raw_text": "₹85 for strip of 10 at Jan Aushadhi"
    }}
  ]
}}

Web content:
{content}
"""

GENERIC_MULTI_SHOT_PROMPT = """Search for generic medicine alternatives in India with this EXACT composition:
{composition}

The original branded medicine is: {original_name}

Find 2-3 unbranded/generic equivalent medicines (e.g. from Jan Aushadhi, Zeelab, Cipla Generic, Alkem Generic, Mankind, Medkart) with:
- Medicine name
- Price in INR
- Pack size (number of tablets)
- Store/Provider source name (e.g. "Jan Aushadhi Kendra", "Zeelab Pharmacy", "Medkart", "Truemeds")
- Direct product/search URL on the store (e.g., "https://janaushadhi.gov.in/product/...", "https://zeelabpharmacy.com/product/...")

Output ONLY JSON:
{{"generics": [{{"name": "Generic Equivalent", "composition": "{composition}", "price": 45.0, "pack_size": 10, "source": "Jan Aushadhi Kendra", "source_url": "https://janaushadhi.gov.in/product/generic-equivalent"}}]}}
"""


class GenericPriceAgent(PriceAgent):
    """Discovers generic equivalent medicine prices using 4 models x 5 shots + Firecrawl."""

    def __init__(
        self,
        firecrawl: Optional[FirecrawlScraper] = None,
        llm: Optional[LLMRouter] = None,
    ):
        self._firecrawl = firecrawl or FirecrawlScraper()
        self._llm = llm or LLMRouter()

    @property
    def name(self) -> str:
        return "generic_agent"

    async def search_branded_prices(
        self,
        medicine_name: str,
        composition: NormalizedComposition,
    ) -> List[PriceCandidateCreate]:
        return []

    async def search_generic_prices(
        self,
        composition: NormalizedComposition,
        original_name: str,
        on_call_start: Optional[Any] = None,
        on_call_complete: Optional[Any] = None,
    ) -> List[PriceCandidateCreate]:
        """Search for generic equivalents via 4 models * 5 shots each + Firecrawl."""
        candidates = []
        composition_str = self._format_composition(composition)

        logger.info(
            "generic_search_start",
            original=original_name,
            composition=composition_str,
        )

        # Strategy 1: Firecrawl web search for generics
        try:
            firecrawl_prices = await self._search_via_firecrawl(
                composition_str, original_name
            )
            candidates.extend(firecrawl_prices)
            logger.info("generic_firecrawl", original=original_name, count=len(firecrawl_prices))
        except Exception as e:
            logger.error("generic_firecrawl_error", error=str(e))

        # Strategy 2: Multi-shot parallel execution across all 4 models (5 shots each)
        try:
            multi_shot_generics = await self._search_via_multi_shot_llm(
                composition_str,
                original_name,
                on_call_start=on_call_start,
                on_call_complete=on_call_complete,
            )
            candidates.extend(multi_shot_generics)
            logger.info("generic_multi_shot_llm", original=original_name, count=len(multi_shot_generics))
        except Exception as e:
            logger.error("generic_multi_shot_error", error=str(e))

        logger.info(
            "generic_prices_found",
            original=original_name,
            total=len(candidates),
        )
        return candidates

    def _format_composition(self, composition: NormalizedComposition) -> str:
        """Format composition for search queries."""
        parts = []
        for ing in composition.ingredients:
            parts.append(f"{ing.original_name} {ing.original_strength}{ing.original_unit}")
        return " + ".join(parts)

    async def _search_via_multi_shot_llm(
        self,
        composition_str: str,
        original_name: str,
        on_call_start: Optional[Any] = None,
        on_call_complete: Optional[Any] = None,
    ) -> List[PriceCandidateCreate]:
        """Fire 4 models (Groq Llama 70B & 8B, LM Studio Qwen 8B & Qwen 3 VL 4B) in parallel."""
        prompt = GENERIC_MULTI_SHOT_PROMPT.format(
            composition=composition_str,
            original_name=original_name,
        )
        system_prompt = "You are an Indian generic medicine price specialist. Provide real generic prices in JSON."

        responses = await self._llm.execute_multi_shot(
            prompt_generator=prompt,
            system_prompt=system_prompt,
            on_call_start=on_call_start,
            on_call_complete=on_call_complete,
        )

        candidates = []
        for resp in responses:
            generics = self._parse_generic_response(resp.text)
            for g in generics:
                price = g.get("price", 0)
                pack_size = g.get("pack_size", 10)
                if 2 <= price <= 5000 and pack_size > 0:
                    store_source = g.get("source", "").strip()
                    provider_label = f"{resp.provider}:{resp.model}"
                    source_label = f"{store_source} ({provider_label})" if store_source and store_source.lower() not in provider_label.lower() else provider_label

                    # Ignore LLM-provided source_url — LLMs hallucinate fake product URLs.
                    # Let build_direct_product_url construct a working search URL instead.
                    cand_name = g.get("name", f"Generic ({composition_str})")
                    direct_url = build_direct_product_url(
                        source_name=store_source or source_label,
                        candidate_name=cand_name,
                        composition_str=composition_str,
                        existing_url="",
                    )

                    candidates.append(PriceCandidateCreate(
                        type="generic",
                        candidate_name=cand_name,
                        composition=g.get("composition", composition_str),
                        price=price,
                        currency="INR",
                        pack_quantity=pack_size,
                        unit_price=round(price / pack_size, 2),
                        source=source_label,
                        source_url=direct_url,
                        confidence=0.8 if resp.provider == "gemini" else 0.75,
                        raw_evidence=g.get("raw_text", f"₹{price} for {pack_size} units via {source_label}"),
                    ))

        return candidates

    async def _search_via_firecrawl(
        self, composition_str: str, original_name: str
    ) -> List[PriceCandidateCreate]:
        """Search for generic alternatives using Firecrawl."""
        candidates = []

        search_results = await self._firecrawl.search(
            f"{composition_str} generic tablet price India Jan Aushadhi",
            limit=5,
            scrape_content=True,
        )

        if not search_results:
            return []

        combined_content = "\n\n---\n\n".join([
            f"Source: {r.url}\nTitle: {r.title}\n{r.markdown[:800]}"
            for r in search_results[:3]
        ])

        prompt = GENERIC_PRICE_PROMPT.format(
            composition=composition_str,
            original_name=original_name,
            content=combined_content[:3000],
        )

        llm_response = await self._llm.generate(
            task="extract_prices",
            prompt=prompt,
            system_prompt="You are a pharmaceutical price analyst. Output ONLY valid JSON.",
        )

        generics = self._parse_generic_response(llm_response.text)

        for g in generics:
            price = g.get("price", 0)
            pack_size = g.get("pack_size", 10)
            if 2 <= price <= 5000 and pack_size > 0:
                cand_name = g.get("name", f"Generic ({composition_str})")
                store_source = g.get("source", "Jan Aushadhi")
                # Prefer the real Firecrawl search result URL over LLM-extracted source_url
                # (LLMs may hallucinate URLs even when extracting from real content)
                raw_url = (search_results[0].url if search_results else "") or g.get("source_url", "")
                direct_url = build_direct_product_url(
                    source_name=store_source,
                    candidate_name=cand_name,
                    composition_str=composition_str,
                    existing_url=raw_url,
                )

                candidates.append(PriceCandidateCreate(
                    type="generic",
                    candidate_name=cand_name,
                    composition=g.get("composition", composition_str),
                    price=price,
                    currency="INR",
                    pack_quantity=pack_size,
                    unit_price=round(price / pack_size, 2),
                    source=f"{store_source} (firecrawl)",
                    source_url=direct_url,
                    confidence=0.8,
                    raw_evidence=g.get("raw_text", f"₹{price} for {pack_size} units"),
                ))

        return candidates

    def _parse_generic_response(self, response_text: str) -> List[dict]:
        """Parse JSON generic data from LLM response."""
        try:
            text = response_text
            if "```" in text:
                match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
                if match:
                    text = match.group(1)

            data = json.loads(text)
            return data.get("generics", [])
        except (json.JSONDecodeError, AttributeError):
            return []

    async def close(self) -> None:
        pass
