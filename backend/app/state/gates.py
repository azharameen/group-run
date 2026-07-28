"""Gate evidence checks for workflow transitions."""

from ..storage.yaml_io import load_idea_yaml


def check_evidence(idea_id: str, item_id: str) -> bool:
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        return False

    has_title = len(str(idea_data.get("title", "")).strip()) >= 8
    has_signal = len(str(idea_data.get("signal_text", "")).strip()) >= 20
    has_problem = len(str(idea_data.get("problem_statement", "")).strip()) >= 40
    has_solution = len(str(idea_data.get("solution_concept", "")).strip()) >= 40

    source_evidence = idea_data.get("source_evidence", [])
    if isinstance(source_evidence, str):
        source_evidence = [source_evidence]
    elif not isinstance(source_evidence, list):
        source_evidence = []
    evidence_items = [str(item).strip() for item in source_evidence if str(item).strip()]

    novelty_hypothesis = idea_data.get("novelty_hypothesis", {})
    if not isinstance(novelty_hypothesis, dict):
        novelty_hypothesis = {}

    detectability_review = idea_data.get("detectability_review", {})
    if not isinstance(detectability_review, dict):
        detectability_review = {}

    business_value = idea_data.get("business_value", {})
    if not isinstance(business_value, dict):
        business_value = {}

    if item_id == "signal_coherent":
        return has_signal
    if item_id == "min_sources":
        return len(evidence_items) >= 2
    if item_id == "problem_identifiable":
        return has_problem
    if item_id in ("technical_context", "solution_direction"):
        return has_problem and has_solution
    if item_id == "siemens_domain":
        return bool(idea_data.get("siemens_domain", ""))
    if item_id == "search_terms":
        search_terms = novelty_hypothesis.get("search_terms", [])
        return isinstance(search_terms, list) and len([term for term in search_terms if str(term).strip()]) >= 4
    if item_id == "prior_art_examined":
        return bool(novelty_hypothesis.get("novelty_hypothesis_statement")) and len(evidence_items) >= 2
    if item_id in ("novelty_gap_analysis", "differentiating_features"):
        differentiating_features = novelty_hypothesis.get("differentiating_features", [])
        return bool(novelty_hypothesis.get("novelty_hypothesis_statement")) and isinstance(differentiating_features, list) and len([feature for feature in differentiating_features if str(feature).strip()]) >= 2
    if item_id == "observability_evaluated":
        return bool(detectability_review.get("detectability_score") is not None)
    if item_id == "detection_method":
        methods = detectability_review.get("detection_methods", [])
        return isinstance(methods, list) and len([method for method in methods if str(method).strip()]) >= 2
    if item_id == "non_obviousness_drafted":
        return has_title and has_solution
    if item_id == "business_value_minimum":
        scores = load_idea_yaml(idea_id, "scores.yaml")
        if scores and scores.get("history"):
            return scores["history"][-1].get("composite", 0) >= 40
        return False
    if item_id == "siemens_unit_identified":
        units = business_value.get("siemens_business_units", [])
        return isinstance(units, list) and len([unit for unit in units if str(unit).strip()]) >= 1
    if item_id == "market_impact":
        return bool(business_value.get("market_impact"))

    return False
