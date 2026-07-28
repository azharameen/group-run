"""Trusted research adapters for prior art and filing-related lookup."""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..config import KNOWLEDGE_BASE_DIR


@dataclass
class ResearchSource:
    source_type: str
    trust: str
    title: str
    url: str
    snippet: str
    provenance: str


def _tokenize(text: str) -> set[str]:
    return {token for token in re.split(r"[^a-z0-9]+", text.lower()) if len(token) > 2}


def _score_text(query: str, text: str) -> float:
    q = _tokenize(query)
    t = _tokenize(text)
    if not q or not t:
        return 0.0
    return len(q & t) / max(len(q | t), 1)


def _load_local_taxonomy() -> list[dict[str, Any]]:
    path = Path(KNOWLEDGE_BASE_DIR) / "prior_art_taxonomy.json"
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        categories = data.get("categories", [])
        return categories if isinstance(categories, list) else []
    except Exception:
        return []


def search_local_prior_art(query: str, limit: int = 5) -> list[ResearchSource]:
    results: list[ResearchSource] = []
    for category in _load_local_taxonomy():
        text = " ".join(
            str(category.get(field, ""))
            for field in ("name", "code", "description", "keywords")
        )
        score = _score_text(query, text)
        if score <= 0:
            continue
        results.append(
            ResearchSource(
                source_type="local-taxonomy",
                trust="trusted-local",
                title=str(category.get("name") or category.get("code") or "Local taxonomy"),
                url="",
                snippet=str(category.get("description") or ", ".join(category.get("keywords", [])[:5]) or ""),
                provenance=f"local-taxonomy:{category.get('code', '')}",
            )
        )
    return results[:limit]


def search_public_patents(query: str, limit: int = 5, timeout: int = 8) -> list[ResearchSource]:
    url = "https://patents.google.com/?q=" + urllib.parse.quote(query)
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            html = response.read().decode("utf-8", errors="ignore")
    except Exception:
        return []

    matches = re.findall(r'<h3[^>]*class="[^"]*result-title[^"]*"[^>]*>(.*?)</h3>', html, flags=re.I | re.S)
    snippets = re.findall(r'<span[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)</span>', html, flags=re.I | re.S)
    results: list[ResearchSource] = []
    for idx, title_html in enumerate(matches[:limit]):
        title = re.sub(r"<[^>]+>", " ", title_html)
        title = re.sub(r"\s+", " ", title).strip()
        snippet = ""
        if idx < len(snippets):
            snippet = re.sub(r"<[^>]+>", " ", snippets[idx])
            snippet = re.sub(r"\s+", " ", snippet).strip()
        results.append(
            ResearchSource(
                source_type="public-patent-search",
                trust="public-web",
                title=title or "Patent result",
                url=url,
                snippet=snippet,
                provenance=f"patents.google.com:{idx+1}",
            )
        )
    return results


def search_filing_sources(query: str, limit: int = 5) -> list[ResearchSource]:
    # Filings data is intentionally conservative here: surface only local evidence-backed content.
    local = search_local_prior_art(query, limit=limit)
    return [
        ResearchSource(
            source_type="filing-readiness",
            trust=item.trust,
            title=item.title,
            url=item.url,
            snippet=item.snippet,
            provenance=f"filing:{item.provenance}",
        )
        for item in local
    ]


def search_prior_art(query: str, limit: int = 5) -> list[ResearchSource]:
    local = search_local_prior_art(query, limit=limit)
    public = search_public_patents(query, limit=limit)
    return (public + local)[:limit]
