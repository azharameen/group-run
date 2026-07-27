"""Subagent executor — LLM-powered content generation for each workflow state.

Each state in the 18-state workflow has a dedicated function that:
1. Reads the idea's current data
2. Calls the LLM with a domain-specific prompt
3. Returns structured content to persist

This is the core of the autonomous AI pipeline.
"""

import json
import os
from typing import Any, Optional

from ..config import KNOWLEDGE_BASE_DIR, INSTRUCTIONS_DIR
from ..storage.yaml_io import (
    load_knowledge_base,
    load_idea_registry,
    read_yaml,
    write_yaml,
    write_markdown,
    idea_folder_path,
)
from ..models.idea import WorkflowState
from .client import call_llm_json

# ---------------------------------------------------------------------------
# Prompt templates for each state
# ---------------------------------------------------------------------------

SYSTEM_BASE = (
    "You are a senior patent analyst at Siemens, a global technology company. "
    "You evaluate invention ideas with rigorous, structured reasoning. "
    "Your responses are detailed, technically precise, and formatted for patent workflow automation."
)


def _normalize_key(value: str) -> str:
    return "".join(ch.lower() for ch in value if ch.isalnum() or ch.isspace()).strip()


def _truncate(text: str, limit: int = 700) -> str:
    text = text.strip()
    return text if len(text) <= limit else f"{text[:limit].rstrip()}..."


def _stringify_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, (dict, list)):
        return json.dumps(content, indent=2, default=str)
    return str(content)


def _read_text_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _load_autonomous_context() -> dict[str, Any]:
    docs = load_knowledge_base()
    registry = load_idea_registry()
    recent_ideas = registry.get("ideas", [])[-10:]

    tech_domains_path = os.path.join(KNOWLEDGE_BASE_DIR, "siemens", "tech_domains.yaml")
    tech_domains = read_yaml(tech_domains_path) if os.path.exists(tech_domains_path) else {}

    instructions = []
    for name in ("global-agent-instructions.md", "siemens-validator-instructions.md"):
        path = os.path.join(INSTRUCTIONS_DIR, name)
        if os.path.exists(path):
            instructions.append({
                "path": name,
                "content": _truncate(_read_text_file(path), 1200),
            })

    return {
        "documents": docs,
        "recent_ideas": recent_ideas,
        "tech_domains": tech_domains,
        "instructions": instructions,
    }


def _render_context_summary(context: dict[str, Any], max_documents: int = 12) -> str:
    docs = context.get("documents", [])[:max_documents]
    recent_ideas = context.get("recent_ideas", [])
    tech_domains = context.get("tech_domains", {})
    instructions = context.get("instructions", [])

    parts = ["## Siemens Tech Domains", _truncate(_stringify_content(tech_domains), 1400)]

    if instructions:
        parts.append("## Operating Instructions")
        for item in instructions:
            parts.append(f"- {item['path']}: {item['content']}")

    parts.append("## Knowledge Base Documents")
    if docs:
        for doc in docs:
            parts.append(
                f"- [{doc.get('source')}] {doc.get('path')}: {_truncate(_stringify_content(doc.get('content', '')), 1000)}"
            )
    else:
        parts.append("- No raw or processed documents found yet.")

    if recent_ideas:
        parts.append("## Recent Ideas To Avoid Duplicating")
        for idea in recent_ideas:
            parts.append(
                f"- {idea.get('idea_id', '')}: {idea.get('title', '')} | {idea.get('state', '')} | {idea.get('phase', '')}"
            )

    return "\n".join(parts)


def _ensure_idea_folder(idea_id: str) -> dict:
    """Load idea.yaml, returning empty dict if not found."""
    path = os.path.join(idea_folder_path(idea_id), "idea.yaml")
    try:
        return read_yaml(path) or {}
    except FileNotFoundError:
        return {}


def _write_idea_field(idea_id: str, field: str, value: Any) -> None:
    """Update a single field in idea.yaml."""
    data = _ensure_idea_folder(idea_id)
    data[field] = value
    write_yaml(os.path.join(idea_folder_path(idea_id), "idea.yaml"), data)


def _write_markdown(idea_id: str, filename: str, content: str) -> None:
    """Write content to a markdown file in the idea folder."""
    write_markdown(os.path.join(idea_folder_path(idea_id), filename), content)


def _call_llm_json_with_fallback(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    fallback_factory,
    max_retries: int = 2,
):
    """Call LLM with retry logic, then fall back to factory data.
    
    Retries up to max_retries times before giving up.
    All fallback data is marked with _fallback: true so UI can warn users.
    """
    last_error = None
    for attempt in range(1 + max_retries):
        try:
            result = call_llm_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if result:
                return result
            # Empty result — retry
            last_error = "Empty result from LLM"
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                continue

    # All retries exhausted — use fallback
    fallback = fallback_factory()
    fallback["_fallback"] = True
    fallback["_fallback_reason"] = str(last_error)
    return fallback


# ---------------------------------------------------------------------------
# STATE 1: raw_signal_collected → generate novel ideas from user input
# ---------------------------------------------------------------------------

def execute_raw_signal(user_signal: str) -> list[dict]:
    """Generate patent ideas from a user's raw text signal.

    Returns a list of idea dicts.
    """
    prompt = f"""Based on the following user-provided signal, generate 3 distinct,
novel patent idea concepts suitable for Siemens.

For each idea, provide:
1. title (concise, descriptive)
2. problem_statement (2-3 sentences describing the technical problem)
3. solution_concept (4-6 sentences describing the novel solution)
4. siemens_domain (best-fit domain from: Digital Industries, Smart Infrastructure, Mobility, Healthcare, Energy, Industrial Automation, Building Technologies, Rail Automation, Grid Technologies)
5. tags (3-5 relevant technology keywords)
6. source_evidence (2-3 sentences on why this is relevant now)

User signal: {user_signal}

Respond with a JSON array of exactly 3 idea objects with these exact fields.
"""
    result = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are an expert at identifying patentable inventions from raw signals.",
        user_prompt=prompt,
        temperature=0.85,
        max_tokens=4096,
    )
    return result if isinstance(result, list) else []


def execute_seed_ideas_from_input(input_text: str) -> list[dict]:
    """Alias for execute_raw_signal — called from seed endpoint."""
    return execute_raw_signal(input_text)


def execute_autonomous_idea_generation(max_ideas: int = 3) -> list[dict]:
    """Generate new ideas autonomously from the knowledge corpus."""
    context = _load_autonomous_context()
    summary = _render_context_summary(context)
    existing_titles = {
        _normalize_key(str(idea.get("title", "")))
        for idea in context.get("recent_ideas", [])
        if idea.get("title")
    }

    prompt = f"""Generate {max_ideas} new Siemens patent ideas autonomously.

You must not use any user-provided signal. Use only the corpus below and your own reasoning.
Do not duplicate the titles in the existing ideas list.
Every idea must be grounded in the corpus and include short source evidence references.

Return a JSON array of idea objects with exactly these fields:
1. "signal_text" — a synthesized raw signal for the autonomous idea
2. "title" — concise and specific
3. "problem_statement" — 2-3 sentences
4. "solution_concept" — 4-6 sentences
5. "siemens_domain" — best-fit Siemens domain
6. "tags" — 3-5 technology keywords
7. "source_evidence" — 2-4 short evidence bullets tied to the corpus

Existing ideas:
{json.dumps([idea.get("title", "") for idea in context.get("recent_ideas", []) if idea.get("title")], indent=2)}

Corpus:
{summary}
"""
    try:
        result = call_llm_json(
            system_prompt=f"{SYSTEM_BASE}\nYou are an autonomous invention discovery agent.",
            user_prompt=prompt,
            temperature=0.85,
            max_tokens=4096,
        )
    except Exception:
        result = call_llm_json(
            system_prompt=f"{SYSTEM_BASE}\nYou are an autonomous invention discovery agent.",
            user_prompt=prompt + "\n\nReturn only a JSON array. Do not wrap the answer in markdown.",
            temperature=0.6,
            max_tokens=4096,
        )

    candidates = result if isinstance(result, list) else result.get("ideas", []) if isinstance(result, dict) else []
    cleaned: list[dict] = []
    seen = set(existing_titles)

    for item in candidates:
        if not isinstance(item, dict):
            continue

        title = str(item.get("title", "")).strip()
        if not title:
            continue

        key = _normalize_key(title)
        if key in seen:
            continue

        signal_text = str(item.get("signal_text", "")).strip() or str(item.get("problem_statement", "")).strip() or title
        source_evidence = item.get("source_evidence", [])
        if isinstance(source_evidence, str):
            source_evidence = [source_evidence]
        elif not isinstance(source_evidence, list):
            source_evidence = []

        cleaned.append({
            "signal_text": signal_text,
            "title": title,
            "problem_statement": str(item.get("problem_statement", "")).strip(),
            "solution_concept": str(item.get("solution_concept", "")).strip(),
            "siemens_domain": str(item.get("siemens_domain", "")).strip(),
            "tags": item.get("tags", []) if isinstance(item.get("tags", []), list) else [],
            "source_evidence": [str(x).strip() for x in source_evidence if str(x).strip()],
        })
        seen.add(key)

        if len(cleaned) >= max_ideas:
            break

    if cleaned:
        return cleaned

    # Retry once with a stricter instruction set before giving up.
    retry_prompt = f"""Generate at least 1 Siemens patent idea autonomously from the corpus below.

Use a single, well-grounded idea if needed. Do not duplicate existing titles.

Corpus:
{summary}
"""
    retry = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are an autonomous invention discovery agent.",
        user_prompt=retry_prompt + "\n\nReturn only JSON.",
        temperature=0.5,
        max_tokens=2048,
    )
    retry_candidates = retry if isinstance(retry, list) else retry.get("ideas", []) if isinstance(retry, dict) else []
    for item in retry_candidates:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title or _normalize_key(title) in seen:
            continue
        signal_text = str(item.get("signal_text", "")).strip() or str(item.get("problem_statement", "")).strip() or title
        source_evidence = item.get("source_evidence", [])
        if isinstance(source_evidence, str):
            source_evidence = [source_evidence]
        elif not isinstance(source_evidence, list):
            source_evidence = []
        cleaned.append({
            "signal_text": signal_text,
            "title": title,
            "problem_statement": str(item.get("problem_statement", "")).strip(),
            "solution_concept": str(item.get("solution_concept", "")).strip(),
            "siemens_domain": str(item.get("siemens_domain", "")).strip(),
            "tags": item.get("tags", []) if isinstance(item.get("tags", []), list) else [],
            "source_evidence": [str(x).strip() for x in source_evidence if str(x).strip()],
        })
        break

    return cleaned


# ---------------------------------------------------------------------------
# STATE 2: idea_discovery
# ---------------------------------------------------------------------------

def execute_idea_discovery(idea_id: str) -> dict:
    """Expand the raw idea with discovery context."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "Untitled")
    problem = data.get("problem_statement", "")
    solution = data.get("solution_concept", "")

    prompt = f"""Expand this Siemens patent idea with a thorough discovery analysis:

Title: {title}
Problem: {problem}
Solution: {solution}

Provide a JSON object with:
1. "technical_domain" — specific technical field
2. "problem_background" — 3-4 sentences on why this problem exists
3. "innovation_aspects" — array of 3-5 specific novel aspects
4. "key_technical_components" — array of 3-5 technical building blocks
5. "potential_applications" — array of 3-5 Siemens-relevant applications
"""
    result = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are an expert at discovery-phase patent analysis.",
        user_prompt=prompt,
        temperature=0.7,
        max_tokens=3072,
    )
    _write_idea_field(idea_id, "discovery_data", result)
    return result


# ---------------------------------------------------------------------------
# STATE 3: idea_clarification
# ---------------------------------------------------------------------------

def execute_idea_clarification(idea_id: str) -> dict:
    """Clarify and structure the idea with formal problem framing."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    problem = data.get("problem_statement", "")
    discovery = data.get("discovery_data", {})

    prompt = f"""Structure this Siemens patent idea with formal problem clarification:

Title: {title}
Problem: {problem}
Discovery: {json.dumps(discovery, indent=2)}

Provide a JSON object with:
1. "formal_problem_statement" — precise, one-paragraph technical problem
2. "solution_architecture" — high-level architecture (4-6 sentences)
3. "key_claims_concept" — array of 3-5 conceptual claim directions
4. "technical_prerequisites" — array of technologies/standards needed
5. "advantage_over_existing" — 2-3 sentences on advantages
"""
    result = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are a patent drafting expert clarifying invention concepts.",
        user_prompt=prompt,
        temperature=0.6,
        max_tokens=3072,
    )
    _write_idea_field(idea_id, "clarification_data", result)
    return result


# ---------------------------------------------------------------------------
# STATE 4: novelty_hypothesis
# ---------------------------------------------------------------------------

def execute_novelty_hypothesis(idea_id: str) -> dict:
    """Generate novelty hypothesis by analyzing the idea against known prior art."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    solution = data.get("solution_concept", "")
    clarification = data.get("clarification_data", {})

    prompt = f"""Analyze this Siemens invention for novelty:

Title: {title}
Solution: {solution}
Clarification: {json.dumps(clarification, indent=2)}

Provide a JSON object with:
1. "novelty_elements" — array of what makes this novel (3-5 items, each with description and confidence score 0-100)
2. "novelty_hypothesis_statement" — concise hypothesis (2-3 sentences)
3. "differentiating_features" — array of features that differ from existing solutions
4. "search_terms" — array of 8-12 search terms for prior art search
5. "ipc_classes_suggested" — array of 3-5 suggested IPC/CPC classes
6. "initial_novelty_score" — integer 0-100 with brief justification
"""
    # Build dynamic fallback from actual idea data
    _title = data.get("title", "")
    _solution = data.get("solution_concept", "")
    _domain = data.get("siemens_domain", "")
    _clarification = data.get("clarification_data", {})
    _innovation_aspects = _clarification.get("innovation_aspects", []) if isinstance(_clarification, dict) else []
    _key_components = _clarification.get("key_technical_components", []) if isinstance(_clarification, dict) else []
    # Extract keywords from solution for search terms
    _solution_words = _solution.replace(".", " ").replace(",", " ").replace(";", " ").split() if _solution else []
    _search_kw = [w for w in _solution_words if len(w) > 4][:8]
    _fallback_search = [f"{_domain} {kw}" if _domain else kw for kw in _search_kw] if _search_kw else [_title]

    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are a patent novelty analyst expert.",
        user_prompt=prompt,
        temperature=0.5,
        max_tokens=3072,
        fallback_factory=lambda: {
            "novelty_elements": [
                {
                    "description": aspect if isinstance(aspect, str) else str(aspect),
                    "confidence": 50,
                }
                for aspect in (_innovation_aspects or [_solution[:200] if _solution else _title])[:3]
            ],
            "novelty_hypothesis_statement": f"The invention ({_title}) addresses a gap in {_domain or 'the relevant domain'} through {_solution[:150] if _solution else 'the proposed solution'}.",
            "differentiating_features": [
                str(c) for c in (_key_components or [_solution[:150]] if _solution else [])[:3]
            ],
            "search_terms": _fallback_search[:8],
            "ipc_classes_suggested": ["G06F", "H04L", "G05B"] if not _domain else ["G05B"],
            "initial_novelty_score": 50,
        },
    )
    _write_idea_field(idea_id, "novelty_hypothesis", result)
    return result


# ---------------------------------------------------------------------------
# STATE 5: prior_art_review
# ---------------------------------------------------------------------------

def execute_prior_art_review(idea_id: str) -> dict:
    """Simulate prior art review using LLM knowledge (NOT a real patent database).
    
    TODO: Replace with Google Patents API, USPTO API, or Espacenet API integration.
    """
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    solution = data.get("solution_concept", "")
    search_terms = data.get("novelty_hypothesis", {}).get("search_terms", [])

    prompt = f"""Conduct a thorough prior art review for this Siemens invention using your training knowledge:

Title: {title}
Solution: {solution}
Search Terms: {json.dumps(search_terms)}

IMPORTANT: You are simulating a prior art search using your training knowledge.
Mark all references as simulated since you do not have access to a live patent database.

Provide a JSON object with:
1. "references_found" — array of up to 8 simulated prior art references (each with: title, source, year, relevance_brief, similarity_score 0-100)
2. "gap_analysis" — 3-4 sentences on the novelty gap
3. "closest_prior_art" — description of the closest known reference and how this differs
4. "novelty_assessment" — "High", "Medium", or "Low" with justification
5. "coverage_score" — integer 0-100 (how well the search covered the space)
"""
    result = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are a prior art search expert at a patent firm.",
        user_prompt=prompt,
        temperature=0.4,
        max_tokens=4096,
    )
    result["_simulated"] = True
    result["_simulated_reason"] = "Prior art references generated from LLM training knowledge, not a live patent database."
    _write_idea_field(idea_id, "prior_art_review", result)
    return result


# ---------------------------------------------------------------------------
# STATE 6: detectability_review
# ---------------------------------------------------------------------------

def execute_detectability_review(idea_id: str) -> dict:
    """Evaluate if infringement can be detected."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    solution = data.get("solution_concept", "")

    prompt = f"""Evaluate detectability of infringement for this Siemens invention:

Title: {title}
Solution: {solution}

Provide a JSON object with:
1. "detectability_score" — integer 0-100
2. "detection_methods" — array of 3-5 methods to detect infringement
3. "non_obviousness_argument" — 3-4 sentence argument under KSR v. Teleflex
4. "reverse_engineering_difficulty" — "Easy", "Moderate", "Hard", or "Very Hard"
5. "detectability_notes" — 2-3 sentences summary
"""
    # Build dynamic fallback from actual idea data
    _sol = data.get("solution_concept", "")
    _has_monitoring = any(kw in _sol.lower() for kw in ["monitor", "detect", "sensor", "telemetry", "log", "measure"])
    _has_hardware = any(kw in _sol.lower() for kw in ["hardware", "device", "sensor", "physical", "embedded", "edge"])
    _has_software = any(kw in _sol.lower() for kw in ["software", "algorithm", "model", "api", "cloud", "service"])

    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou specialize in patent detectability and non-obviousness analysis.",
        user_prompt=prompt,
        temperature=0.5,
        max_tokens=2048,
        fallback_factory=lambda: {
            "detectability_score": 70 if _has_monitoring else (55 if _has_hardware else 40),
            "detection_methods": [
                "Monitor operational outputs and compare against baseline behavior",
                "Inspect system logs for characteristic patterns described in the solution",
                "Analyze network traffic or API calls for unique signatures",
            ] if _has_software else [
                "Inspect physical devices for unique hardware configurations",
                "Monitor sensor outputs for characteristic patterns",
                "Analyze system behavior logs for unique operational signatures",
            ],
            "non_obviousness_argument": f"The claim set involves {_sol[:120] if _sol else 'specific technical elements'} that go beyond generic solutions in the domain.",
            "reverse_engineering_difficulty": "Hard" if _has_hardware else ("Moderate" if _has_software else "Moderate"),
            "detectability_notes": f"The solution ({data.get('title', '')}) {'includes monitoring/detection mechanisms that aid infringement detection.' if _has_monitoring else 'requires careful analysis to detect infringement.'}",
        },
    )
    _write_idea_field(idea_id, "detectability_review", result)
    return result


# ---------------------------------------------------------------------------
# STATE 7: business_value_review
# ---------------------------------------------------------------------------

def execute_business_value_review(idea_id: str) -> dict:
    """Assess business value for Siemens."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    solution = data.get("solution_concept", "")
    domain = data.get("siemens_domain", "")

    prompt = f"""Assess the business value of this Siemens invention:

Title: {title}
Solution: {solution}
Domain: {domain}

Provide a JSON object with:
1. "business_value_score" — integer 0-100
2. "market_impact" — 2-3 sentences on market potential
3. "siemens_business_units" — array of likely Siemens business units
4. "estimated_time_to_market" — string (e.g., "1-2 years", "3-5 years")
5. "competitive_advantage" — 2-3 sentences
6. "licensing_potential" — "Low", "Medium", or "High" with reasoning
"""
    # Build dynamic fallback from actual idea data
    _bv_solution = data.get("solution_concept", "")
    _bv_problem = data.get("problem_statement", "")
    _bv_domain = domain or "Smart Infrastructure"
    # Estimate complexity from solution length
    _bv_sol_words = len(_bv_solution.split()) if _bv_solution else 0
    _bv_ttm = "1-2 years" if _bv_sol_words < 50 else ("2-3 years" if _bv_sol_words < 150 else "3-5 years")

    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are a business value analyst evaluating patent portfolios.",
        user_prompt=prompt,
        temperature=0.5,
        max_tokens=2048,
        fallback_factory=lambda: {
            "business_value_score": 55,
            "market_impact": f"The invention addresses {_bv_problem[:120] if _bv_problem else 'a technical problem'} within the {_bv_domain} domain.",
            "siemens_business_units": [_bv_domain],
            "estimated_time_to_market": _bv_ttm,
            "competitive_advantage": f"The solution {_bv_solution[:150] if _bv_solution else 'proposes a novel approach'} that could differentiate Siemens in this space.",
            "licensing_potential": "Medium",
        },
    )
    _write_idea_field(idea_id, "business_value", result)
    return result


# ---------------------------------------------------------------------------
# STATE 8: siemens_innovation_alignment
# ---------------------------------------------------------------------------

def execute_siemens_alignment(idea_id: str) -> dict:
    """Validate alignment with Siemens strategic domains."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    solution = data.get("solution_concept", "")
    domain = data.get("siemens_domain", "")

    prompt = f"""Validate this invention against Siemens strategic technology alignment:

Title: {title}
Solution: {solution}
Domain: {domain}

Provide a JSON object with:
1. "alignment_score" — integer 0-100
2. "aligned_strategic_areas" — array of strategic areas that match
3. "portfolio_gap_analysis" — 2-3 sentences on how this fills a gap
4. "competitive_advantage_siemens" — 2-3 sentences
5. "technology_readiness" — estimated TRL level 1-9
6. "alignment_notes" — 2-3 sentences overall assessment
"""
    # Build dynamic fallback from actual idea data
    _sa_domain = domain or "Smart Infrastructure"
    _sa_solution = data.get("solution_concept", "")
    _sa_problem = data.get("problem_statement", "")
    # Load tech domains for better alignment
    _tech_domains_path = os.path.join(KNOWLEDGE_BASE_DIR, "siemens", "tech_domains.yaml")
    _tech_domains = read_yaml(_tech_domains_path) if os.path.exists(_tech_domains_path) else {}
    _aligned_areas = [_sa_domain]
    if isinstance(_tech_domains, dict):
        for td_key, td_val in _tech_domains.items():
            if _sa_domain.lower() in td_key.lower() or td_key.lower() in _sa_domain.lower():
                if isinstance(td_val, dict):
                    _aligned_areas.extend(td_val.get("strategic_areas", []) or td_val.get("areas", []))
                elif isinstance(td_val, list):
                    _aligned_areas.extend(td_val)
    _aligned_areas = list(dict.fromkeys(_aligned_areas))[:5]  # dedupe, limit

    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are a Siemens innovation strategy expert.",
        user_prompt=prompt,
        temperature=0.5,
        max_tokens=2048,
        fallback_factory=lambda: {
            "alignment_score": 55,
            "aligned_strategic_areas": _aligned_areas,
            "portfolio_gap_analysis": f"The idea addresses {_sa_problem[:120] if _sa_problem else 'a technical need'} in the {_sa_domain} domain.",
            "competitive_advantage_siemens": f"It leverages Siemens' capabilities in {_sa_domain.lower()} through {_sa_solution[:120] if _sa_solution else 'the proposed approach'}.",
            "technology_readiness": 5,
            "alignment_notes": f"The invention ({data.get('title', '')}) targets the {_sa_domain} domain.",
        },
    )
    _write_idea_field(idea_id, "siemens_alignment", result)
    return result


# ---------------------------------------------------------------------------
# STATE 9: scoring — runs after all research/analysis before drafting
# ---------------------------------------------------------------------------

def execute_llm_scoring(idea_id: str) -> dict:
    """Score the idea across all 7 criteria using the LLM, not heuristics."""
    data = _ensure_idea_folder(idea_id)
    # Collect all available data
    sections = {
        k: data.get(k)
        for k in [
            "title", "problem_statement", "solution_concept",
            "siemens_domain", "tags", "discovery_data",
            "clarification_data", "novelty_hypothesis",
            "prior_art_review", "detectability_review",
            "business_value", "siemens_alignment",
        ]
    }

    prompt = f"""Score this Siemens patent idea across 7 weighted criteria.

Idea data:
{json.dumps(sections, indent=2, default=str)}

Scoring criteria and weights:
1. Novelty (25%) — How novel is the idea vs. existing prior art?
2. Siemens Strategic Alignment (15%) — How well does it align with Siemens strategy?
3. Technical Feasibility (15%) — Is the solution technically achievable?
4. Detectability (10%) — Can infringement be detected?
5. Business Value (15%) — What is the business/market value?
6. Originality (10%) — Is it non-obvious?
7. Completeness (10%) — How complete is the documentation?

For each criterion, provide:
- "score" (integer 0-100)
- "reasoning" (2-3 sentence justification)
- "confidence" (integer 0-100)

Then provide:
- "composite_score" (weighted sum)
- "strength_rating" ("Very Strong", "Strong", "Moderate", "Weak", or "Reject")
- "summary" (3-4 sentence overall assessment)

Respond with JSON only.
"""
    result = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are a rigorous patent scoring analyst.",
        user_prompt=prompt,
        temperature=0.3,
        max_tokens=4096,
    )
    return result


# ---------------------------------------------------------------------------
# STATE 10: ideascopy_draft
# ---------------------------------------------------------------------------

def execute_ideascope_draft(idea_id: str) -> dict:
    """Generate the IdeaScope draft document."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    problem = data.get("problem_statement", "")
    solution = data.get("solution_concept", "")

    prompt = f"""Generate a complete IdeaScope draft for this Siemens invention:

Title: {title}
Technical Problem: {problem}
Solution: {solution}
Available data: {json.dumps(data, indent=2, default=str)}

The IdeaScope document should include:
1. Title and inventor information
2. Technical field
3. Background / problem description
4. Summary of invention (4-6 sentences)
5. Detailed description (8-12 sentences)
6. At least 3 claims
7. At least 1-2 drawings/figures described in text
8. Abstract (3-4 sentences)

Provide as a JSON object with:
- "title" — formal invention title
- "technical_field" — description
- "background" — 4-6 sentences
- "summary" — 4-6 sentences
- "detailed_description" — 8-12 sentences with sections
- "claims" — array of 3-5 claim texts
- "abstract" — 3-4 sentences
- "figures_description" — array of figure descriptions
"""
    result = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are a senior patent drafter preparing Invention Disclosure / IdeaScope drafts.",
        user_prompt=prompt,
        temperature=0.6,
        max_tokens=6144,
    )
    # Also write the human-readable draft
    draft_md = f"""# IdeaScope Draft: {result.get('title', title)}

## Technical Field
{result.get('technical_field', '')}

## Background
{result.get('background', '')}

## Summary of Invention
{result.get('summary', '')}

## Detailed Description
{result.get('detailed_description', '')}

## Claims
"""
    for i, claim in enumerate(result.get("claims", []), 1):
        draft_md += f"\n{i}. {claim}"

    draft_md += f"\n\n## Abstract\n{result.get('abstract', '')}"
    _write_markdown(idea_id, "ideascope-draft.md", draft_md)
    _write_idea_field(idea_id, "ideascope_draft", result)
    return result


# ---------------------------------------------------------------------------
# STATE 11: siemens_internal_filing_check
# ---------------------------------------------------------------------------

def execute_siemens_filing_check(idea_id: str) -> dict:
    """Run Siemens internal filing compliance check."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")

    prompt = f"""Run Siemens internal patent filing compliance check for:

Title: {title}

Verify the following checklist items and respond as JSON:

1. "all_fields_complete" — boolean + reasoning
2. "claims_format_valid" — boolean + reasoning
3. "prior_art_attached" — boolean + reasoning  
4. "no_confidential_info_leaked" — boolean + reasoning
5. "co_inventors_identified" — boolean + reasoning
6. "business_benefit_quantified" — boolean + reasoning
7. "detectability_assessment_complete" — boolean + reasoning

Provide:
- "checklist_results" — array of {{item: str, passed: bool, notes: str}}
- "overall_pass" — boolean
- "fail_items" — array of strings describing failures
- "compliance_score" — integer 0-100
- "recommendations" — array of improvement suggestions
"""
    result = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are a Siemens IP compliance officer.",
        user_prompt=prompt,
        temperature=0.3,
        max_tokens=3072,
    )
    _write_idea_field(idea_id, "filing_check", result)
    return result


# ---------------------------------------------------------------------------
# STATE 12: manager_or_enabler_review — simulated
# ---------------------------------------------------------------------------

def execute_manager_review(idea_id: str) -> dict:
    """Simulate manager/enabler review sign-off (NOT a real human manager).
    
    TODO: Replace with human-in-the-loop: pause workflow, notify actual manager via email/Teams,
    collect decision through web form or API endpoint.
    """
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    score = data.get("composite_score", 0)

    prompt = f"""Simulate a manager/enabler review for this Siemens patent idea:

Title: {title}
Composite Score: {score}

Provide as JSON:
1. "review_decision" — "Approved", "Conditional", or "Sent Back"
2. "comments" — 2-3 sentences of manager feedback
3. "improvement_suggestions" — array of suggestions (if not approved)
4. "resource_commitment" — boolean (would resources be committed?)
5. "review_notes" — 2-3 sentences summary
"""
    result = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are a Siemens R&D manager reviewing a patent idea.",
        user_prompt=prompt,
        temperature=0.5,
        max_tokens=2048,
    )
    result["_simulated"] = True
    result["_simulated_reason"] = "Manager review simulated by LLM. Replace with actual human manager approval."
    _write_idea_field(idea_id, "manager_review", result)
    return result


# ---------------------------------------------------------------------------
# STATE 13: ip_review
# ---------------------------------------------------------------------------

def execute_ip_review(idea_id: str) -> dict:
    """Simulate IP review by patent attorney (NOT a real attorney).
    
    TODO: Replace with human-in-the-loop: actual IP attorney review required before filing.
    LLM can provide pre-screening, but not final legal opinion.
    """
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    ideascope = data.get("ideascope_draft", {})

    prompt = f"""Perform an IP attorney review for this Siemens patent idea:

Title: {title}
Claims: {json.dumps(ideascope.get('claims', []), indent=2) if ideascope else 'Not drafted yet'}

Provide as JSON:
1. "patentability_opinion" — "Favorable", "Conditional", or "Unfavorable"
2. "claim_analysis" — analysis of claims strength (3-4 sentences)
3. "prior_art_concerns" — array of concerns (if any)
4. "jurisdiction_recommendation" — suggested filing jurisdictions
5. "filing_strategy" — "Provisional", "Non-Provisional", "PCT", or combo
6. "international_considerations" — notes on international filing
7. "reviewer_notes" — 3-4 sentences summary
"""
    result = call_llm_json(
        system_prompt=f"{SYSTEM_BASE}\nYou are a senior patent attorney at a major law firm.",
        user_prompt=prompt,
        temperature=0.4,
        max_tokens=3072,
    )
    result["_simulated"] = True
    result["_simulated_reason"] = "IP attorney review simulated by LLM. Replace with actual qualified attorney review."
    _write_idea_field(idea_id, "ip_review", result)
    return result


# ---------------------------------------------------------------------------
# STATE 14: siemens_ip_counsel_validation
# ---------------------------------------------------------------------------

def execute_ip_counsel_validation(idea_id: str) -> dict:
    """Simulate Siemens IP Counsel final validation."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")

    prompt = f"""Perform final Siemens IP Counsel validation for:

Title: {title}

Provide as JSON:
1. "validation_decision" — "Approved for Filing", "Conditional Approval", or "Rejected"
2. "patentability_confirmed" — boolean with reasoning
3. "filing_strategy_final" — recommended strategy
4. "committee_signoff_required" — boolean
5. "counsel_notes" — 3-4 sentences
6. "next_steps" — array of clear next steps for filing
7. "overall_grade" — "A" (fast-track), "B" (standard), "C" (needs work)
"""
    # Build dynamic fallback from actual idea data
    _ip_score = data.get("composite_score", 0)
    _ip_ideascope = data.get("ideascope_draft", {})
    _ip_claims = _ip_ideascope.get("claims", []) if isinstance(_ip_ideascope, dict) else []
    _ip_has_claims = len(_ip_claims) >= 3
    # Decision based on score and claim completeness
    if _ip_score >= 70 and _ip_has_claims:
        _ip_decision = "Approved for Filing"
        _ip_grade = "A"
    elif _ip_score >= 50:
        _ip_decision = "Conditional Approval"
        _ip_grade = "B"
    else:
        _ip_decision = "Needs Review"
        _ip_grade = "C"

    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are Siemens Chief IP Counsel with final authority.",
        user_prompt=prompt,
        temperature=0.3,
        max_tokens=2048,
        fallback_factory=lambda: {
            "validation_decision": _ip_decision,
            "patentability_confirmed": _ip_score >= 50,
            "filing_strategy_final": "PCT" if _ip_score >= 60 else "Provisional",
            "committee_signoff_required": _ip_score < 70,
            "counsel_notes": f"Idea ({title}) has composite score {_ip_score} and {len(_ip_claims)} claims. {'Ready for filing.' if _ip_decision == 'Approved for Filing' else 'Needs further review before filing.'}",
            "next_steps": ["Finalize claim language", "Prepare filing package"] if _ip_has_claims else ["Draft minimum 3 claims", "Review prior art", "Prepare filing package"],
            "overall_grade": _ip_grade,
        },
    )
    _write_idea_field(idea_id, "ip_counsel_validation", result)
    return result


# ---------------------------------------------------------------------------
# STATE 15: ready_for_submission — final summary packet
# ---------------------------------------------------------------------------

def execute_ready_for_submission(idea_id: str) -> dict:
    """Generate the final submission-ready summary packet."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    score = data.get("composite_score", 0)

    prompt = f"""Generate the final submission-ready summary for this Siemens patent idea:

Title: {title}
Composite Score: {score}
All data: {json.dumps(data, indent=2, default=str)}

Provide as JSON:
1. "submission_summary" — 5-7 sentence comprehensive summary
2. "key_highlights" — array of 5 key selling points
3. "risk_factors" — array of any risks
4. "recommended_next_steps" — array of filing next steps
5. "filing_packet_ready" — boolean
6. "submission_readiness_score" — integer 0-100
"""
    # Build dynamic fallback — check actual completeness
    _sub_ideascope = data.get("ideascope_draft", {})
    _sub_claims = _sub_ideascope.get("claims", []) if isinstance(_sub_ideascope, dict) else []
    _sub_scores = data.get("composite_score", 0)
    _sub_novelty = data.get("novelty_hypothesis", {})
    _sub_prior_art = data.get("prior_art_review", {})
    _sub_detect = data.get("detectability_review", {})
    _sub_bv = data.get("business_value", {})
    _sub_alignment = data.get("siemens_alignment", {})
    # Check which sections are complete
    _sections_done = sum(1 for s in [_sub_novelty, _sub_prior_art, _sub_detect, _sub_bv, _sub_alignment, _sub_ideascope] if s)
    _readiness = min(100, int((_sections_done / 6) * 100))
    _is_ready = _sections_done >= 5 and len(_sub_claims) >= 3 and _sub_scores >= 40
    # Build highlights from actual data
    _highlights = []
    if title:
        _highlights.append(f"Invention: {title}")
    if _sub_novelty:
        _highlights.append(f"Novelty hypothesis completed")
    if _sub_prior_art:
        _highlights.append(f"Prior art review completed")
    if _sub_scores:
        _highlights.append(f"Composite score: {_sub_scores}")
    if data.get("siemens_domain"):
        _highlights.append(f"Domain: {data['siemens_domain']}")
    # Build risk factors from missing sections
    _risks = []
    if not _sub_prior_art:
        _risks.append("Prior art review not yet completed")
    if len(_sub_claims) < 3:
        _risks.append(f"Insufficient claims ({len(_sub_claims)}/3)")
    if _sub_scores < 50:
        _risks.append(f"Low composite score ({_sub_scores})")
    if not _sub_detect:
        _risks.append("Detectability review pending")
    if not _risks:
        _risks.append("Manual claim tuning may be required")

    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are a patent portfolio manager preparing final submissions.",
        user_prompt=prompt,
        temperature=0.4,
        max_tokens=3072,
        fallback_factory=lambda: {
            "submission_summary": f"Submission packet for {title}. {_sections_done}/6 analysis sections complete. {'Ready for filing review.' if _is_ready else 'Additional analysis needed before filing.'}",
            "key_highlights": _highlights or [title or "Autonomous idea"],
            "risk_factors": _risks,
            "recommended_next_steps": ["Review claims", "Prepare filing packet"] if _is_ready else ["Complete pending analyses", "Draft claims", "Review claims", "Prepare filing packet"],
            "filing_packet_ready": _is_ready,
            "submission_readiness_score": _readiness,
        },
    )
    _write_idea_field(idea_id, "submission_packet", result)

    # Write the final summary markdown
    summary_md = f"""# Patent Filing Summary: {title}

## Submission Overview
{result.get('submission_summary', '')}

## Key Highlights
"""
    for h in result.get("key_highlights", []):
        summary_md += f"\n- {h}"

    summary_md += "\n\n## Risk Factors\n"
    for r in result.get("risk_factors", []):
        summary_md += f"\n- {r}"

    summary_md += "\n\n## Next Steps\n"
    for s in result.get("recommended_next_steps", []):
        summary_md += f"\n1. {s}"

    summary_md += f"\n\n**Submission Readiness Score:** {result.get('submission_readiness_score', 0)}/100"
    _write_markdown(idea_id, "submission-summary.md", summary_md)
    return result


# ---------------------------------------------------------------------------
# STATE 16-18: submitted, feedback_received, accepted_or_closed — simpler
# ---------------------------------------------------------------------------

def execute_submitted(idea_id: str) -> dict:
    """Finalize submission state."""
    data = _ensure_idea_folder(idea_id)
    return {
        "status": "submitted",
        "idea_id": idea_id,
        "submitted_at": "auto_pipeline",
        "notes": "Idea has been processed through the full pipeline and is ready for filing.",
    }


def execute_feedback_received(idea_id: str) -> dict:
    """Log feedback received (simulated)."""
    return {
        "status": "feedback_received",
        "idea_id": idea_id,
        "feedback": "Positive — idea has strong novelty and Siemens alignment.",
    }


def execute_accepted_or_closed(idea_id: str) -> dict:
    """Final terminal state."""
    return {
        "status": "accepted",
        "idea_id": idea_id,
        "conclusion": "Idea accepted for patent filing pipeline.",
    }


# ---------------------------------------------------------------------------
# Dispatcher — map state name to executor function
# ---------------------------------------------------------------------------

STATE_EXECUTORS: dict[str, callable] = {
    "raw_signal_collected": None,  # Handled separately (seeds from text)
    "idea_discovery": execute_idea_discovery,
    "idea_clarification": execute_idea_clarification,
    "novelty_hypothesis": execute_novelty_hypothesis,
    "prior_art_review": execute_prior_art_review,
    "detectability_review": execute_detectability_review,
    "business_value_review": execute_business_value_review,
    "siemens_innovation_alignment": execute_siemens_alignment,
    "ideascope_draft": execute_ideascope_draft,
    "siemens_internal_filing_check": execute_siemens_filing_check,
    "manager_or_enabler_review": execute_manager_review,
    "ip_review": execute_ip_review,
    "siemens_ip_counsel_validation": execute_ip_counsel_validation,
    "ready_for_submission": execute_ready_for_submission,
    "submitted": execute_submitted,
    "feedback_received": execute_feedback_received,
    "accepted_or_closed": execute_accepted_or_closed,
}


def run_subagent(state_name: str, idea_id: str, **kwargs) -> dict:
    """Dispatch to the appropriate executor for the given workflow state.

    Args:
        state_name: The workflow state name (from WorkflowState enum values).
        idea_id: The idea identifier.
        **kwargs: Additional arguments (e.g., user_signal for seed state).

    Returns:
        The content generated by the subagent.
    """
    executor = STATE_EXECUTORS.get(state_name)
    if executor is None:
        if state_name == "raw_signal_collected":
            raise ValueError(
                "Use execute_seed_ideas_from_input() or execute_raw_signal() "
                "for raw_signal_collected state."
            )
        # No-op for unsupported states
        return {"status": "skipped", "reason": f"No executor for {state_name}"}

    return executor(idea_id)
