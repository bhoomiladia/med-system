"""Utility to build direct, accurate deep-links to products on Indian pharmacy portals."""

import re
import urllib.parse
from typing import Optional


def build_direct_product_url(
    source_name: str,
    candidate_name: str,
    composition_str: Optional[str] = None,
    existing_url: Optional[str] = None,
) -> str:
    """
    Constructs a direct product link or deep catalog search link.
    Prevents returning generic root domain links like 'https://janaushadhi.gov.in/'.
    """
    if existing_url and len(existing_url.strip()) > 0:
        cleaned_url = existing_url.strip()
        # If it's already a full product URL (not just a root domain)
        if not re.match(r"^https?://[^/]+/?$", cleaned_url):
            return cleaned_url

    source_lower = (source_name or "").lower()
    search_term = (candidate_name or composition_str or "").strip()
    if not search_term:
        search_term = "medicine"

    encoded_query = urllib.parse.quote_plus(search_term)
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", search_term.lower()).strip("-")

    if "janaushadhi" in source_lower or "jan aushadhi" in source_lower:
        return f"https://janaushadhi.gov.in/product/{slug}"
    elif "1mg" in source_lower:
        return f"https://www.1mg.com/search/all?name={encoded_query}"
    elif "apollo" in source_lower:
        return f"https://www.apollopharmacy.in/search-medicines/{encoded_query}"
    elif "pharmeasy" in source_lower:
        return f"https://pharmeasy.in/search/all?name={encoded_query}"
    elif "netmeds" in source_lower:
        return f"https://www.netmeds.com/catalogsearch/result/{encoded_query}/all"
    elif "truemeds" in source_lower:
        return f"https://www.truemeds.com/search/{encoded_query}"
    elif "zeelab" in source_lower:
        return f"https://zeelabpharmacy.com/search?q={encoded_query}"
    elif "medkart" in source_lower:
        return f"https://www.medkart.in/search?q={encoded_query}"
    elif "generic" in source_lower:
        return f"https://janaushadhi.gov.in/product/{slug}"
    else:
        return f"https://www.google.com/search?q={encoded_query}+buy+online+India"
