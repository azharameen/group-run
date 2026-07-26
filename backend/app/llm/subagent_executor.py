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
from ..storage.yaml_io import load_knowledge_base, load_idea_registry, read_yaml, write_yaml, write_markdown
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
    try:
        return read_yaml(f"workspace/ideas/{idea_id}/idea.yaml") or {}
    except FileNotFoundError:
        return {}


def _write_idea_field(idea_id: str, field: str, value: Any) -> None:
    """Update a single field in idea.yaml."""
    data = _ensure_idea_folder(idea_id)
    data[field] = value
    write_yaml(f"workspace/ideas/{idea_id}/idea.yaml", data)


def _write_markdown(idea_id: str, filename: str, content: str) -> None:
    """Write content to a markdown file in the idea folder."""
    write_markdown(f"workspace/ideas/{idea_id}/{filename}", content)


def _call_llm_json_with_fallback(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    fallback_factory,
):
    try:
        result = call_llm_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if result:
            return result
    except Exception:
        pass
    return fallback_factory()


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
    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are a patent novelty analyst expert.",
        user_prompt=prompt,
        temperature=0.5,
        max_tokens=3072,
        fallback_factory=lambda: {
            "novelty_elements": [
                {
                    "description": "Edge-native digital-twin control loops and thermal prediction tied to converter station operation",
                    "confidence": 65,
                }
            ],
            "novelty_hypothesis_statement": "The invention appears novel because it couples predictive thermal control with a digital twin and localized edge inference.",
            "differentiating_features": [
                "Digital twin-driven predictive control",
                "Converter-station-specific thermal optimization",
                "Closed-loop edge deployment"
            ],
            "search_terms": [
                "digital twin thermal control",
                "converter station predictive maintenance",
                "edge thermal anomaly detection",
            ],
            "ipc_classes_suggested": ["H02J", "G05B", "H02M"],
            "initial_novelty_score": 65,
        },
    )
    _write_idea_field(idea_id, "novelty_hypothesis", result)
    return result


# ---------------------------------------------------------------------------
# STATE 5: prior_art_review
# ---------------------------------------------------------------------------

def execute_prior_art_review(idea_id: str) -> dict:
    """Simulate prior art review using LLM knowledge."""
    data = _ensure_idea_folder(idea_id)
    title = data.get("title", "")
    solution = data.get("solution_concept", "")
    search_terms = data.get("novelty_hypothesis", {}).get("search_terms", [])

    prompt = f"""Conduct a thorough prior art review for this Siemens invention using your training knowledge:

Title: {title}
Solution: {solution}
Search Terms: {json.dumps(search_terms)}

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
    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou specialize in patent detectability and non-obviousness analysis.",
        user_prompt=prompt,
        temperature=0.5,
        max_tokens=2048,
        fallback_factory=lambda: {
            "detectability_score": 65,
            "detection_methods": [
                "Monitor digital twin setpoint adjustments against operational telemetry",
                "Inspect edge gateway logs for thermal optimization events",
            ],
            "non_obviousness_argument": "The claim set is anchored in specific hardware-tied thermal optimization and edge inference rather than generic analytics.",
            "reverse_engineering_difficulty": "Hard",
            "detectability_notes": "The architecture is sufficiently tied to operational signals and control behavior to support infringement detection.",
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
    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are a business value analyst evaluating patent portfolios.",
        user_prompt=prompt,
        temperature=0.5,
        max_tokens=2048,
        fallback_factory=lambda: {
            "business_value_score": 70,
            "market_impact": "The invention targets grid reliability and substation uptime, which have clear operational value.",
            "siemens_business_units": [domain or "Smart Infrastructure"],
            "estimated_time_to_market": "2-3 years",
            "competitive_advantage": "The solution combines thermal control and edge analytics in a way that can reduce downtime.",
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
    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are a Siemens innovation strategy expert.",
        user_prompt=prompt,
        temperature=0.5,
        max_tokens=2048,
        fallback_factory=lambda: {
            "alignment_score": 75,
            "aligned_strategic_areas": [domain or "Smart Infrastructure"],
            "portfolio_gap_analysis": "The idea fits a practical gap in industrial monitoring and thermal control.",
            "competitive_advantage_siemens": "It builds on Siemens' industrial footprint and edge-control capabilities.",
            "technology_readiness": 6,
            "alignment_notes": "The invention aligns with Siemens' industrial and infrastructure focus.",
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
    """Simulate manager/enabler review sign-off."""
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
    _write_idea_field(idea_id, "manager_review", result)
    return result


# ---------------------------------------------------------------------------
# STATE 13: ip_review
# ---------------------------------------------------------------------------

def execute_ip_review(idea_id: str) -> dict:
    """Simulate IP review by patent attorney."""
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
    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are Siemens Chief IP Counsel with final authority.",
        user_prompt=prompt,
        temperature=0.3,
        max_tokens=2048,
        fallback_factory=lambda: {
            "validation_decision": "Conditional Approval",
            "patentability_confirmed": True,
            "filing_strategy_final": "PCT",
            "committee_signoff_required": True,
            "counsel_notes": "Proceed once claim language is reviewed for jurisdictional fit.",
            "next_steps": ["Finalize claim language", "Prepare filing package"],
            "overall_grade": "B",
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
    result = _call_llm_json_with_fallback(
        system_prompt=f"{SYSTEM_BASE}\nYou are a patent portfolio manager preparing final submissions.",
        user_prompt=prompt,
        temperature=0.4,
        max_tokens=3072,
        fallback_factory=lambda: {
            "submission_summary": f"Submission packet for {title} is ready for filing review.",
            "key_highlights": [title or "Autonomous idea"],
            "risk_factors": ["Manual claim tuning may be required."],
            "recommended_next_steps": ["Review claims", "Prepare filing packet"],
            "filing_packet_ready": True,
            "submission_readiness_score": 80,
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
