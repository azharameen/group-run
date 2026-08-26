import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { triggerWorkItemValidation } from "@/api/workItems";
import type { ValidationStatus } from "@/api/ideas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface NoveltyAssessmentPanelProps {
  validation?: ValidationStatus | null;
  workItemId?: string;
}

export function NoveltyAssessmentPanel({ validation, workItemId }: NoveltyAssessmentPanelProps) {
  const [current, setCurrent] = useState(validation);
  const [running, setRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  useEffect(() => setCurrent(validation), [validation]);
  const summary = current?.summary;

  const runValidation = async () => {
    if (!workItemId) return;
    setRunning(true);
    setRequestError(null);
    try {
      const response = await triggerWorkItemValidation(workItemId);
      setCurrent(response.validation);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to start validation");
    } finally {
      setRunning(false);
    }
  };

  const state = current?.state || "unknown";
  const unsuccessful = ["failed", "incomplete", "cancelled"].includes(state);
  return (
    <Card data-testid="novelty-assessment-panel">
      <CardHeader className="p-4 pb-2">
        <CardTitle className={`flex items-center justify-between text-sm ${unsuccessful ? "text-destructive" : ""}`}>
          <span className="flex items-center gap-2">
            {unsuccessful ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            Novelty &amp; Patentability
          </span>
          <Badge variant={unsuccessful ? "destructive" : "outline"}>{state}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-3 text-xs">
        {summary ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Novelty" value={`${summary.novelty_score}/10`} />
              <Metric label="Patentability" value={`${summary.patentability_score}/10`} />
              <Metric label="Outcome" value={summary.patentability_outcome} />
              <Metric label="FTO risk" value={summary.fto_risk} />
            </div>
            <p><strong>Confidence:</strong> {summary.confidence}/10</p>
            <p><strong>FTO analysis:</strong> {summary.fto_analysis}</p>
            <p><strong>Rationale:</strong> {summary.rationale}</p>
            <p><strong>Agent:</strong> {summary.agent_id} · <strong>Assessed:</strong> {new Date(summary.assessed_at).toLocaleString()}</p>
            <p className="font-mono text-muted-foreground"><strong>Provenance:</strong> {summary.provenance}</p>
            <ReferenceList title="Prior-art references" references={summary.prior_art_refs} />
            <ReferenceList title="Source references" references={summary.source_refs} />
          </>
        ) : (
          <p className="text-muted-foreground">
            {current?.error || "No novelty assessment is available. Completed prior-art research is required."}
          </p>
        )}
        {requestError && <p className="text-destructive" role="alert">{requestError}</p>}
        {workItemId && state !== "running" && state !== "initializing" && (
          <Button size="sm" variant="outline" onClick={runValidation} disabled={running}>
            {running && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            {summary ? "Run again" : "Run validation"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border p-2"><div className="text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}

function ReferenceList({ title, references }: { title: string; references?: string[] }) {
  if (!references?.length) return null;
  return <div><strong>{title}</strong><ul className="list-disc pl-4">{references.map((ref) => <li key={ref}>{ref}</li>)}</ul></div>;
}

export default NoveltyAssessmentPanel;
