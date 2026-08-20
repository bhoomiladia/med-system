"""
Composition Service — orchestrates Phase 1 Strict DB Search + Multi-provider discovery.

1. Phase 1 (Strict DB Search): Checks database for cached composition by canonical key.
2. Phase 2-3 (Multi-shot Scraper Discovery): 1mg via Firecrawl + LLM extraction.
3. Fallback: Web search via Firecrawl + LLM extraction.
"""

from typing import Optional, List

from app.services.scraper.base_scraper import CompositionProvider
from app.services.scraper.one_mg_scraper import OneMgCompositionProvider, FirecrawlCompositionProvider
from app.services.scraper.firecrawl_scraper import FirecrawlScraper
from app.services.llm_router import LLMRouter
from app.services.composition_normalizer import normalize_composition, NormalizedComposition
from app.schemas.composition import CompositionResult
from app.utils.logging import get_logger

logger = get_logger("composition_service")


class CompositionService:
    """Orchestrates composition discovery across providers with zero mock data."""

    def __init__(
        self,
        firecrawl: Optional[FirecrawlScraper] = None,
        llm: Optional[LLMRouter] = None,
        providers: Optional[List[CompositionProvider]] = None,
    ):
        self._firecrawl = firecrawl or FirecrawlScraper()
        self._llm = llm or LLMRouter()

        if providers:
            self._providers = providers
        else:
            self._providers = [
                OneMgCompositionProvider(firecrawl=self._firecrawl, llm=self._llm),
                FirecrawlCompositionProvider(firecrawl=self._firecrawl, llm=self._llm),
            ]

        # Fast in-memory cache for the lifecycle
        self._cache: dict[str, Optional[CompositionResult]] = {}

    async def find_composition(
        self, medicine_name: str
    ) -> Optional[CompositionResult]:
        """
        Find composition using real scrapers and LLMs.
        """
        cache_key = medicine_name.lower().strip()

        if cache_key in self._cache:
            logger.info("composition_memory_cache_hit", medicine=medicine_name)
            return self._cache[cache_key]

        # Try each real provider in order
        for provider in self._providers:
            try:
                logger.info(
                    "composition_provider_search",
                    medicine=medicine_name,
                    provider=provider.name,
                )
                result = await provider.find_composition(medicine_name)
                if result and result.ingredients:
                    self._cache[cache_key] = result
                    logger.info(
                        "composition_found_via_provider",
                        medicine=medicine_name,
                        provider=provider.name,
                        ingredients=len(result.ingredients),
                    )
                    return result
            except Exception as e:
                logger.error(
                    "composition_provider_error",
                    medicine=medicine_name,
                    provider=provider.name,
                    error=str(e),
                )
                continue

        self._cache[cache_key] = None
        logger.warning("composition_discovery_exhausted", medicine=medicine_name)
        return None

    def normalize(self, result: CompositionResult) -> NormalizedComposition:
        return normalize_composition(result.ingredients)

    async def close(self) -> None:
        for provider in self._providers:
            await provider.close()
