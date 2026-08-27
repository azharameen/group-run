import { useCallback, useEffect, useState } from "react";
import { GitBranch, Loader2, Plus } from "lucide-react";
import { fetchIdeaMaturity, recordIdeaMaturity, type IdeaMaturity } from "@/api/ideas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface MaturityPanelProps {
  ideaId: string;
}

const STAGE_ORDER = ["raw", "refined", "validated", "ready-for-planning"] as const;

/** Parse a textarea's lines into a non-blank string array (one item per line). */
function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function MaturityPanel({ ideaId }: MaturityPanelProps) {
  const [maturity, setMaturity] = useState<IdeaMaturity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [criteriaText, setCriteriaText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setError(null);
    fetchIdeaMaturity(ideaId)
      .then((result) => {
        if (active) setMaturity(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load maturity");
      });
    return () => {
      active = false;
    };
  }, [ideaId]);

  useEffect(load, [load]);

  const openDialog = () => {
    setCriteriaText("");
    setEvidenceText("");
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const criteria = parseLines(criteriaText);
    const evidenceRefs = parseLines(evidenceText);
    if (!criteria.length || !evidenceRefs.length) {
      setFormError("Criteria and evidence references are both required (one per line).");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await recordIdeaMaturity(ideaId, {
        stage: maturity?.next_stage || "",
        criteria,
        evidence_refs: evidenceRefs,
        recorded_by: "user",
      });
      setDialogOpen(false);
      load();
    } catch (reason: unknown) {
      setFormError(reason instanceof Error ? reason.message : "Failed to record transition");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return <p className="text-sm text-destructive" role="alert">{error}</p>;
  }
  if (!maturity) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const currentIndex = (STAGE_ORDER as readonly string[]).indexOf(maturity.stage);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              Maturity Stage
            </span>
            <Badge variant={maturity.next_stage ? "secondary" : "default"} data-testid="current-stage-badge">
              {maturity.stage}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <ol className="flex items-center gap-1" data-testid="stage-stepper">
            {STAGE_ORDER.map((stage, index) => (
              <li key={stage} className="flex flex-1 items-center gap-1 last:flex-none">
                <div
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    index < currentIndex
                      ? "bg-primary/10 text-primary"
                      : index === currentIndex
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`stage-${stage}`}
                >
                  <span className="text-[10px] opacity-70">{index + 1}</span>
                  {stage}
                </div>
                {index < STAGE_ORDER.length - 1 && (
                  <span className={`h-px flex-1 ${index < currentIndex ? "bg-primary/50" : "bg-muted-foreground/30"}`} />
                )}
              </li>
            ))}
          </ol>
          {maturity.next_stage ? (
            <>
              <p className="mt-4 text-xs font-medium text-muted-foreground">
                Required to reach <span className="font-semibold text-foreground">{maturity.next_stage}</span>
              </p>
              <ul className="mt-1 space-y-1">
                {(maturity.stage_criteria[maturity.next_stage] || []).map((criterion) => (
                  <li key={criterion} className="flex items-start gap-1.5 text-xs">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {criterion}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={openDialog} data-testid="record-transition-button">
                  <Plus className="h-4 w-4" />
                  Record transition
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              {currentIndex === -1
                ? "The stored stage is not recognized; transitions are disabled."
                : "This idea has reached the terminal stage — no further transitions."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Transition History</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          {(!maturity.history || maturity.history.length === 0) ? (
            <p className="text-xs text-muted-foreground">No transitions recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {(maturity.history || []).map((record, index) => (
                <li key={record.recorded_at + index} className="rounded-md border p-3 text-xs" data-testid="history-entry">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{record.stage}</Badge>
                    <span className="font-mono text-muted-foreground">
                      {new Date(record.recorded_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">Recorded by {record.recorded_by}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {record.criteria.map((criterion, i) => (
                      <li key={criterion + i} className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                        {criterion}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-muted-foreground">
                    Evidence: {record.evidence_refs.join(", ")}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Record transition{maturity.next_stage ? ` to ${maturity.next_stage}` : ""}
            </DialogTitle>
            <DialogDescription>
              Transitions are forward-only, one step at a time. Attest each required criterion and cite
              the evidence that supports this transition.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="maturity-criteria" className="mb-1 block text-xs font-medium">
                Criteria met (one per line) <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="maturity-criteria"
                className="min-h-24 text-sm"
                data-testid="criteria-textarea"
                value={criteriaText}
                onChange={(e) => setCriteriaText(e.target.value)}
                placeholder={"problem statement names affected users\nsolution concept is concrete"}
              />
            </div>
            <div>
              <label htmlFor="maturity-evidence" className="mb-1 block text-xs font-medium">
                Evidence references (one per line) <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="maturity-evidence"
                className="min-h-24 text-sm"
                data-testid="evidence-textarea"
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                placeholder={"artifact:research:v1\nknowledge-base/paper.md"}
              />
            </div>
            {formError && (
              <p className="text-xs text-destructive" role="alert">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} data-testid="submit-transition-button">
              Record transition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MaturityPanel;
