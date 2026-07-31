"""Trusted research adapters for prior art and filing-related lookup."""

from __future__ import annotations

import html
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
    url = (
        "https://patents.google.com/xhr/query?url="
        + urllib.parse.quote(f"q={query}")
        + "&exp=&tags="
    )
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8", errors="ignore"))
    except Exception:
        return []

    results: list[ResearchSource] = []
    clusters = payload.get("results", {}).get("cluster", [])
    for cluster in clusters:
        for item in cluster.get("result", []):
            patent = item.get("patent") or {}
            publication_number = str(patent.get("publication_number") or item.get("id") or "").strip()
            title = re.sub(r"<[^>]+>", " ", str(patent.get("title") or ""))
            snippet = re.sub(r"<[^>]+>", " ", str(patent.get("snippet") or ""))
            title = re.sub(r"\s+", " ", html.unescape(title)).strip()
            snippet = re.sub(r"\s+", " ", html.unescape(snippet)).strip()
            results.append(
                ResearchSource(
                    source_type="public-patent-api",
                    trust="public-api",
                    title=title or "Patent result",
                    url=f"https://patents.google.com/patent/{publication_number}/en" if publication_number else url,
                    snippet=snippet,
                    provenance=f"patents.google.com:{publication_number or item.get('id', 'result')}",
                )
            )
            if len(results) >= limit:
                return results[:limit]
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


def search_processed_knowledge_base(query: str, limit: int = 5) -> list[ResearchSource]:
    """Search processed knowledge-base documents for relevant signals."""
    processed_dir = Path(KNOWLEDGE_BASE_DIR) / "processed"
    if not processed_dir.exists():
        return []

    results: list[ResearchSource] = []
    for entry in sorted(processed_dir.iterdir()):
        if entry.is_dir():
            for nested in entry.iterdir():
                if nested.suffix in {".md", ".txt", ".yaml", ".json"}:
                    try:
                        text = nested.read_text(encoding="utf-8", errors="ignore")
                    except Exception:
                        continue
                    score = _score_text(query, text)
                    if score <= 0:
                        continue
                    snippet = text[:200].strip().replace("\n", " ")
                    results.append(
                        ResearchSource(
                            source_type="processed-kb",
                            trust="trusted-local",
                            title=nested.name,
                            url="",
                            snippet=snippet,
                            provenance=f"kb:processed:{nested.relative_to(KNOWLEDGE_BASE_DIR).as_posix()}",
                        )
                    )
        elif entry.suffix in {".md", ".txt", ".yaml", ".json"}:
            try:
                text = entry.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            score = _score_text(query, text)
            if score > 0:
                snippet = text[:200].strip().replace("\n", " ")
                results.append(
                    ResearchSource(
                        source_type="processed-kb",
                        trust="trusted-local",
                        title=entry.name,
                        url="",
                        snippet=snippet,
                        provenance=f"kb:processed:{entry.relative_to(KNOWLEDGE_BASE_DIR).as_posix()}",
                    )
                )

        if len(results) >= limit:
            break

    return results[:limit]


def search_prior_art(query: str, limit: int = 5) -> list[ResearchSource]:
    local = search_local_prior_art(query, limit=limit)
    public = search_public_patents(query, limit=limit)
    kb = search_processed_knowledge_base(query, limit=limit)
    return (public + kb + local)[:limit]
