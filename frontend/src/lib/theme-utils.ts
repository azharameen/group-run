export const PHASE_COLORS: Record<string, string> = {
  discovery: 'bg-amber-500',
  research: 'bg-blue-500',
  analysis: 'bg-emerald-500',
  drafting: 'bg-orange-500',
  review: 'bg-purple-500',
  submission: 'bg-emerald-600',
  revision: 'bg-amber-600',
  archive: 'bg-slate-500',
};

export const STRENGTH_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  "Very Strong": "default",
  Strong: "default",
  Moderate: "secondary",
  Weak: "outline",
  Reject: "destructive",
};

export const CRITERION_LABELS: Record<string, string> = {
  novelty: "Novelty",
  technical_feasibility: "Technical Feasibility",
  detectability: "Detectability",
  business_value: "Business Value",
  originality: "Originality",
  completeness: "Completeness",
};
