"""
Branded Price Agent — discovers prices for original branded medicines.

Uses 4 models running 5 shots each (20 shots total) with temperature 0.2 to 0.8:
1. Groq Llama-3.3-70B
2. Groq Llama-3.1-8B
3. Gemini 2.5 Flash (with Google Search grounding)
4. LM Studio Qwen (Local)
Plus Firecrawl web search.
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

logger = get_logger("branded_agent")

PRICE_EXTRACT_PROMPT = """You are a pharmaceutical price extractor. Given web content about a medicine, extract ALL price data points you can find.

Rules:
- Extract ONLY real prices from the content (never make up prices)
- Include the medicine/product name, price, pack size, specific pharmacy store/source (e.g. Tata 1mg, Apollo Pharmacy, PharmEasy, Netmeds, Truemeds, Jan Aushadhi), and direct purchase/product source URL
- CRITICAL: Never return root URLs like 'https://janaushadhi.gov.in' or 'https://1mg.com'. Always provide direct product URLs or full web search store links (e.g. 'https://www.1mg.com/drugs/...', 'https://www.apollopharmacy.in/search-medicines/...', 'https://janaushadhi.gov.in/product/...').
- Prices should be in INR (Indian Rupees)
- If you find MRP, selling price, or discounted price — extract ALL of them
- Output ONLY valid JSON

Medicine being searched: {medicine_name}

Output format:
{{
  "prices": [
    {{
      "name": "Product Name",
      "price": 285.0,
      "pack_size": 10,
      "source": "Tata 1mg",
      "source_url": "https://www.1mg.com/search/all?name=product-name",
      "raw_text": "₹285 for strip of 10 on Tata 1mg"
    }}
  ]
}}

Web content:
{content}
"""

BRANDED_MULTI_SHOT_PROMPT = """What is the exact MRP or selling price of {medicine_name} tablet in India?
Report actual pharmacy prices from verified Indian stores like Tata 1mg, Apollo Pharmacy, PharmEasy, Netmeds, or Truemeds.
Extract the product name, MRP in INR, pack size (tablets per pack), store/pharmacy source name, and the full direct pharmacy website URL (e.g. https://www.1mg.com/search/all?name={medicine_name} or https://www.apollopharmacy.in/search-medicines/{medicine_name}).

Output ONLY JSON format:
{{"prices": [{{"name": "{medicine_name}", "price": 120.0, "pack_size": 10, "source": "Tata 1mg", "source_url": "https://www.1mg.com/search/all?name={medicine_name}"}}]}}
"""


class BrandedPriceAgent(PriceAgent):
    """Discovers branded medicine prices using 4 models across 5 shots each + Firecrawl."""

    def __init__(
        self,
        firecrawl: Optional[FirecrawlScraper] = None,
        llm: Optional[LLMRouter] = None,
    ):
        self._firecrawl = firecrawl or FirecrawlScraper()
        self._llm = llm or LLMRouter()

    @property
    def name(self) -> str:
        return "branded_agent"

    async def search_branded_prices(
        self,
        medicine_name: str,
        composition: NormalizedComposition,
        on_call_start: Optional[Any] = None,
        on_call_complete: Optional[Any] = None,
    ) -> List[PriceCandidateCreate]:
        """Search for branded medicine prices via 4 models * 5 shots each + Firecrawl."""
        candidates = []

        # Strategy 1: Firecrawl web search
        try:
            firecrawl_prices = await self._search_via_firecrawl(medicine_name)
            candidates.extend(firecrawl_prices)
            logger.info("branded_firecrawl", medicine=medicine_name, count=len(firecrawl_prices))
        except Exception as e:
            logger.error("branded_firecrawl_error", medicine=medicine_name, error=str(e))

        # Strategy 2: Multi-shot parallel execution across all 4 models (5 shots each)
        try:
            multi_shot_prices = await self._search_via_multi_shot_llm(
                medicine_name,
                on_call_start=on_call_start,
                on_call_complete=on_call_complete,
            )
            candidates.extend(multi_shot_prices)
            logger.info("branded_multi_shot_llm", medicine=medicine_name, count=len(multi_shot_prices))
        except Exception as e:
            logger.error("branded_multi_shot_error", medicine=medicine_name, error=str(e))

        logger.info(
            "branded_prices_found",
            medicine=medicine_name,
            total=len(candidates),
        )
        return candidates

    async def search_generic_prices(
        self,
        composition: NormalizedComposition,
        original_name: str,
    ) -> List[PriceCandidateCreate]:
        return []

    async def _search_via_multi_shot_llm(
        self,
        medicine_name: str,
        on_call_start: Optional[Any] = None,
        on_call_complete: Optional[Any] = None,
    ) -> List[PriceCandidateCreate]:
        """Fire 4 models (Groq Llama 70B & 8B, LM Studio Qwen 8B & Qwen 3 VL 4B) in parallel."""
        prompt = BRANDED_MULTI_SHOT_PROMPT.format(medicine_name=medicine_name)
        system_prompt = "You are a pharmaceutical price database. Provide accurate Indian medicine MRP prices in JSON format."

        responses = await self._llm.execute_multi_shot(
            prompt_generator=prompt,
            system_prompt=system_prompt,
            on_call_start=on_call_start,
            on_call_complete=on_call_complete,
        )

        candidates = []
        for resp in responses:
            prices = self._parse_price_response(resp.text)
            for p in prices:
                price = p.get("price", 0)
                pack_size = p.get("pack_size", 10)
                if 5 <= price <= 10000 and pack_size > 0:
                    store_name = p.get("source", "").strip()
                    provider_label = f"{resp.provider}:{resp.model}"
                    source_label = f"{store_name} ({provider_label})" if store_name and store_name.lower() not in provider_label.lower() else provider_label

                    # Ignore LLM-provided source_url — LLMs hallucinate fake product URLs.
                    # Let build_direct_product_url construct a working search URL instead.
                    cand_name = p.get("name", medicine_name)
                    direct_url = build_direct_product_url(
                        source_name=store_name or source_label,
                        candidate_name=cand_name,
                        existing_url="",
                    )

                    candidates.append(PriceCandidateCreate(
                        type="branded",
                        candidate_name=cand_name,
                        composition=None,
                        price=price,
                        currency="INR",
                        pack_quantity=pack_size,
                        unit_price=round(price / pack_size, 2),
                        source=source_label,
                        source_url=direct_url,
                        confidence=0.8 if resp.provider == "gemini" else 0.75,
                        raw_evidence=p.get("raw_text", f"₹{price} for {pack_size} units via {source_label}"),
                    ))

        return candidates

    async def _search_via_firecrawl(self, medicine_name: str) -> List[PriceCandidateCreate]:
        """Search for branded prices using Firecrawl."""
        candidates = []

        search_results = await self._firecrawl.search_medicine_prices(medicine_name, limit=5)
        if not search_results:
            return []

        combined_content = "\n\n---\n\n".join([
            f"Source: {r.url}\nTitle: {r.title}\n{r.markdown[:800]}"
            for r in search_results[:3]
        ])

        prompt = PRICE_EXTRACT_PROMPT.format(
            medicine_name=medicine_name,
            content=combined_content[:3000],
        )

        llm_response = await self._llm.generate(
            task="extract_prices",
            prompt=prompt,
            system_prompt="You are a pharmaceutical price extractor. Output ONLY valid JSON.",
        )

        prices = self._parse_price_response(llm_response.text)

        for p in prices:
            price = p.get("price", 0)
            pack_size = p.get("pack_size", 10)
            if 5 <= price <= 50000 and pack_size > 0:
                cand_name = p.get("name", medicine_name)
                store_source = p.get("source", "Tata 1mg")
                # Prefer the real Firecrawl search result URL over LLM-extracted source_url
                # (LLMs may hallucinate URLs even when extracting from real content)
                raw_url = (search_results[0].url if search_results else "") or p.get("source_url", "")
                direct_url = build_direct_product_url(
                    source_name=store_source,
                    candidate_name=cand_name,
                    existing_url=raw_url,
                )

                candidates.append(PriceCandidateCreate(
                    type="branded",
                    candidate_name=cand_name,
                    composition=None,
                    price=price,
                    currency="INR",
                    pack_quantity=pack_size,
                    unit_price=round(price / pack_size, 2),
                    source=f"{store_source} (firecrawl)",
                    source_url=direct_url,
                    confidence=0.85,
                    raw_evidence=p.get("raw_text", f"₹{price} for {pack_size} units"),
                ))

        return candidates

    def _parse_price_response(self, response_text: str) -> List[dict]:
        """Parse JSON price data from LLM response."""
        try:
            text = response_text
            if "```" in text:
                match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
                if match:
                    text = match.group(1)

            data = json.loads(text)
            return data.get("prices", [])
        except (json.JSONDecodeError, AttributeError):
            prices = []
            price_matches = re.findall(r'₹\s*(\d+(?:\.\d{1,2})?)', response_text)
            for pm in price_matches[:3]:
                prices.append({"price": float(pm), "pack_size": 10, "name": "Extracted"})
            return prices

    async def close(self) -> None:
        pass
