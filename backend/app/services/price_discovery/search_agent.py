"""
Search Agent — additional web search-based price discovery for diversity.

Uses Firecrawl search to find price data from sources the other agents may miss
(e.g., PharmEasy, Netmeds, Amazon Pharmacy, local pharmacy sites).
"""

import re
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

logger = get_logger("search_agent")

SEARCH_PRICE_PROMPT = """Extract medicine price information from the following web search results.

Medicine: {medicine_name}
Type: {price_type}

Rules:
- Extract real prices only (never fabricate)
- Include product name, price in INR, pack size, pharmacy store/website name (e.g. Netmeds, PharmEasy, Tata 1mg, Apollo Pharmacy, Jan Aushadhi), and direct purchase/product source URL
- CRITICAL: Provide direct product URLs or store product search links (e.g. 'https://www.1mg.com/drugs/...', 'https://www.apollopharmacy.in/search-medicines/...', 'https://janaushadhi.gov.in/product/...'). Do not provide root domain URLs.
- Output ONLY valid JSON

Output format:
{{
  "prices": [
    {{"name": "Product Name", "price": 100.0, "pack_size": 10, "source": "Netmeds", "source_url": "https://www.netmeds.com/catalogsearch/result/product-name/all", "raw_text": "₹100 for 10 tablets on Netmeds"}}
  ]
}}

Content:
{content}
"""


class SearchPriceAgent(PriceAgent):
    """Web search-based price discovery for additional data points."""

    def __init__(
        self,
        firecrawl: Optional[FirecrawlScraper] = None,
        llm: Optional[LLMRouter] = None,
    ):
        self._firecrawl = firecrawl or FirecrawlScraper()
        self._llm = llm or LLMRouter()

    @property
    def name(self) -> str:
        return "search_agent"

    async def search_branded_prices(
        self,
        medicine_name: str,
        composition: NormalizedComposition,
    ) -> List[PriceCandidateCreate]:
        """Search additional sources for branded prices."""
        return await self._search_prices(medicine_name, "branded")

    async def search_generic_prices(
        self,
        composition: NormalizedComposition,
        original_name: str,
    ) -> List[PriceCandidateCreate]:
        """Search for generic prices from additional sources."""
        composition_str = " + ".join([
            f"{ing.original_name} {ing.original_strength}{ing.original_unit}"
            for ing in composition.ingredients
        ])
        return await self._search_prices(
            f"{composition_str} generic",
            "generic",
            composition_str=composition_str,
        )

    async def _search_prices(
        self,
        query: str,
        price_type: str,
        composition_str: Optional[str] = None,
    ) -> List[PriceCandidateCreate]:
        """Search the web for prices using Firecrawl."""
        candidates = []

        if not settings.FIRECRAWL_API_KEY:
            logger.info("search_agent_skipped", reason="no_firecrawl_key")
            return []

        try:
            # Search across pharmacy sites
            search_queries = [
                f"{query} price MRP India buy online",
                f"{query} PharmEasy Netmeds price",
            ]

            for sq in search_queries:
                results = await self._firecrawl.search(sq, limit=3, scrape_content=True)

                if not results:
                    continue

                combined_content = "\n\n---\n\n".join([
                    f"Source: {r.url}\nTitle: {r.title}\n{r.markdown[:600]}"
                    for r in results[:2]
                ])

                prompt = SEARCH_PRICE_PROMPT.format(
                    medicine_name=query,
                    price_type=price_type,
                    content=combined_content[:2500],
                )

                llm_response = await self._llm.generate(
                    task="extract_prices",
                    prompt=prompt,
                    system_prompt="You are a pharmaceutical price extractor. Output ONLY valid JSON.",
                )

                prices = self._parse_response(llm_response.text)

                for p in prices:
                    price = p.get("price", 0)
                    pack_size = p.get("pack_size", 10)
                    if 3 <= price <= 10000 and pack_size > 0:
                        store_name = p.get("source", "").strip() or "web_search"
                        cand_name = p.get("name", query)
                        # Prefer the real Firecrawl search result URL over LLM-extracted source_url
                        raw_url = (results[0].url if results else "") or p.get("source_url", "")
                        direct_url = build_direct_product_url(
                            source_name=store_name,
                            candidate_name=cand_name,
                            composition_str=composition_str,
                            existing_url=raw_url,
                        )

                        candidates.append(PriceCandidateCreate(
                            type=price_type,
                            candidate_name=cand_name,
                            composition=composition_str,
                            price=price,
                            currency="INR",
                            pack_quantity=pack_size,
                            unit_price=round(price / pack_size, 2),
                            source=store_name,
                            source_url=direct_url,
                            confidence=0.65,
                            raw_evidence=p.get("raw_text", f"₹{price} on {store_name}"),
                        ))

        except Exception as e:
            logger.error("search_agent_error", query=query, error=str(e))

        logger.info("search_agent_complete", query=query, count=len(candidates))
        return candidates

    def _parse_response(self, text: str) -> List[dict]:
        """Parse JSON price data from LLM response."""
        try:
            if "```" in text:
                match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
                if match:
                    text = match.group(1)
            data = json.loads(text)
            return data.get("prices", [])
        except (json.JSONDecodeError, AttributeError):
            return []

    async def close(self) -> None:
        pass
