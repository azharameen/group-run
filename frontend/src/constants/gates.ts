/**
 * Siemens patent validation gate display name mappings.
 * Keys are the gate transition identifiers from the backend gate config.
 * When the API returns gate keys, look them up here for a human-readable label.
 */
export const GATE_DISPLAY_NAMES: Record<string, string> = {
	idea_discovery_to_idea_clarification: "Signal Clarity Gate",
	idea_clarification_to_novelty_hypothesis: "Problem Framing Gate",
	novelty_hypothesis_to_prior_art_review: "Novelty Hypothesis Gate",
	prior_art_review_to_detectability_review: "Prior Art Review Gate",
	detectability_review_to_business_value_review: "Detectability Gate",
	business_value_review_to_siemens_innovation_alignment: "Business Value Gate",
	siemens_innovation_alignment: "Siemens Strategic Alignment Gate",
	ideascope_draft_to_siemens_internal_filing_check: "IdeaScope Preparation Gate",
	siemens_internal_filing_check: "Internal Filing Readiness Gate",
	manager_or_enabler_review: "Manager / Enabler Gate",
	ip_review: "IP Attorney Review Gate",
	siemens_ip_counsel_validation: "IP Counsel Validation Gate",
};
