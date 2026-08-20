"""
Firecrawl Scraper — web scraping and search with resilient fallback.

Uses Firecrawl SDK when credits are available, and automatically falls back
to direct HTTP/DuckDuckGo web extraction if Firecrawl credits are exhausted.
"""

import asyncio
import re
import urllib.parse
import time
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

import httpx
from bs4 import BeautifulSoup

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger("firecrawl_scraper")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


@dataclass
class ScrapeResult:
    url: str
    markdown: str
    title: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchResult:
    url: str
    title: Optional[str] = None
    markdown: str = ""
    snippet: Optional[str] = None


class FirecrawlScraper:
    """Web scraping and search using Firecrawl API with zero-downtime HTTP fallback and rate limiting."""

    def __init__(self):
        self._app = None
        self._http_client: Optional[httpx.AsyncClient] = None
        self._semaphore = asyncio.Semaphore(1)  # Strict 1-at-a-time to prevent rate limit spikes
        self._last_call_time = 0.0
        self._rate_limit_until = 0.0  # Circuit breaker timestamp when rate limited

    def _get_app(self):
        if self._app is None and settings.FIRECRAWL_API_KEY:
            from firecrawl import FirecrawlApp
            self._app = FirecrawlApp(api_key=settings.FIRECRAWL_API_KEY)
        return self._app

    async def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                headers=HEADERS,
                timeout=httpx.Timeout(20.0),
                follow_redirects=True,
            )
        return self._http_client

    async def scrape_url(self, url: str) -> ScrapeResult:
        """Scrape a URL via Firecrawl with direct HTTP fallback."""
        app = self._get_app()

        now = time.monotonic()
        if app and now >= self._rate_limit_until:
            async with self._semaphore:
                # Throttle requests by 1.5s
                elapsed = time.monotonic() - self._last_call_time
                if elapsed < 1.5:
                    await asyncio.sleep(1.5 - elapsed)
                self._last_call_time = time.monotonic()

                try:
                    logger.info("firecrawl_scrape_start", url=url)
                    result = await asyncio.to_thread(
                        app.scrape_url,
                        url,
                        formats=["markdown"],
                        only_main_content=True,
                    )

                    markdown = ""
                    title = ""
                    if hasattr(result, "markdown"):
                        markdown = result.markdown or ""
                        title = getattr(result.metadata, "title", "") if hasattr(result, "metadata") else ""
                    elif isinstance(result, dict):
                        markdown = result.get("markdown", "")
                        title = result.get("metadata", {}).get("title", "")

                    if markdown:
                        return ScrapeResult(url=url, markdown=markdown, title=title)
                except Exception as e:
                    err_msg = str(e)
                    if "rate limit" in err_msg.lower() or "429" in err_msg:
                        self._rate_limit_until = time.monotonic() + 30.0
                    logger.warning("firecrawl_scrape_failed_falling_back", error=err_msg, url=url)

        # Fallback: direct HTTP fetch
        client = await self._get_http_client()
        try:
            resp = await client.get(url)
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer"]):
                tag.decompose()
            text = soup.get_text(" ", strip=True)
            return ScrapeResult(url=url, markdown=text, title=soup.title.string if soup.title else "")
        except Exception as e:
            logger.error("direct_scrape_failed", error=str(e), url=url)
            return ScrapeResult(url=url, markdown="")

    async def search(
        self,
        query: str,
        limit: int = 5,
        scrape_content: bool = True,
    ) -> List[SearchResult]:
        """Search via Firecrawl with web search fallback."""
        app = self._get_app()

        now = time.monotonic()
        if app and now >= self._rate_limit_until:
            async with self._semaphore:
                # Throttle requests by 1.5s
                elapsed = time.monotonic() - self._last_call_time
                if elapsed < 1.5:
                    await asyncio.sleep(1.5 - elapsed)
                self._last_call_time = time.monotonic()

                try:
                    logger.info("firecrawl_search_start", query=query, limit=limit)
                    scrape_opts = {"formats": ["markdown"]} if scrape_content else None
                    result = await asyncio.to_thread(
                        app.search,
                        query,
                        limit=limit,
                        scrape_options=scrape_opts,
                    )

                    results = []
                    data_items = []
                    if hasattr(result, "data"):
                        data_items = result.data or []
                    elif hasattr(result, "web"):
                        data_items = result.web or []
                    elif isinstance(result, dict):
                        data_items = result.get("data", result.get("web", []))

                    for item in data_items:
                        url = getattr(item, "url", "") if hasattr(item, "url") else (item.get("url", "") if isinstance(item, dict) else "")
                        title = getattr(item, "title", "") if hasattr(item, "title") else (item.get("title", "") if isinstance(item, dict) else "")
                        markdown = getattr(item, "markdown", "") if hasattr(item, "markdown") else (item.get("markdown", "") if isinstance(item, dict) else "")
                        snippet = getattr(item, "description", "") if hasattr(item, "description") else (item.get("description", "") if isinstance(item, dict) else "")

                        if url:
                            results.append(SearchResult(url=url, title=title, markdown=markdown, snippet=snippet))

                    if results:
                        return results
                except Exception as e:
                    err_msg = str(e)
                    if "rate limit" in err_msg.lower() or "429" in err_msg:
                        # Circuit-breaker: stop hitting Firecrawl for 30s to avoid spamming rate limits
                        self._rate_limit_until = time.monotonic() + 30.0
                    logger.warning("firecrawl_search_failed_falling_back", error=err_msg, query=query)

        # Fallback: Search via DuckDuckGo HTML
        return await self._fallback_web_search(query, limit=limit)

    async def _fallback_web_search(self, query: str, limit: int = 5) -> List[SearchResult]:
        """Fallback live search via DuckDuckGo HTML."""
        client = await self._get_http_client()
        results = []
        try:
            encoded = urllib.parse.quote_plus(query)
            url = f"https://html.duckduckgo.com/html/?q={encoded}"
            resp = await client.get(url)
            soup = BeautifulSoup(resp.text, "html.parser")

            for item in soup.select(".result")[:limit]:
                title_elem = item.select_one(".result__title")
                snippet_elem = item.select_one(".result__snippet")
                url_elem = item.select_one(".result__url")

                title = title_elem.get_text(strip=True) if title_elem else ""
                snippet = snippet_elem.get_text(strip=True) if snippet_elem else ""
                raw_url = url_elem.get_text(strip=True) if url_elem else ""

                if title and snippet:
                    results.append(SearchResult(
                        url=f"https://{raw_url}" if not raw_url.startswith("http") else raw_url,
                        title=title,
                        markdown=f"# {title}\n\n{snippet}",
                        snippet=snippet,
                    ))
            logger.info("fallback_search_success", query=query, count=len(results))
        except Exception as e:
            logger.error("fallback_search_error", error=str(e), query=query)

        return results

    async def scrape_1mg_product(self, medicine_name: str) -> Optional[ScrapeResult]:
        try:
            search_results = await self.search(
                f"site:1mg.com {medicine_name} tablet",
                limit=3,
                scrape_content=True,
            )

            for result in search_results:
                if "1mg.com" in result.url:
                    return ScrapeResult(
                        url=result.url,
                        markdown=result.markdown or result.snippet or "",
                        title=result.title,
                    )

            if search_results:
                return ScrapeResult(
                    url=search_results[0].url,
                    markdown=search_results[0].markdown or search_results[0].snippet or "",
                    title=search_results[0].title,
                )

            return None
        except Exception as e:
            logger.error("1mg_scrape_error", medicine=medicine_name, error=str(e))
            return None

    async def search_medicine_prices(
        self,
        query: str,
        limit: int = 5,
    ) -> List[SearchResult]:
        return await self.search(
            f"{query} price India MRP tablet",
            limit=limit,
            scrape_content=True,
        )

    async def close(self) -> None:
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
