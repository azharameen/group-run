import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck } from "lucide-react";
import {
  decideWorkItemProductDefinition,
  triggerWorkItemProductDefinition,
  type ProductDefinitionStatus,
} from "@/api/workItems";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export interface ProductDefinitionPanelProps {
  productDefinition?: ProductDefinitionStatus | null;
  workItemId?: string;
  onUpdated?: () => void;
}

export function ProductDefinitionPanel({
  productDefinition,
  workItemId,
  onUpdated,
}: ProductDefinitionPanelProps) {
  const [current, setCurrent] = useState(productDefinition);
  const [busy, setBusy] = useState(false);
  const [reasoning, setReasoning] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => setCurrent(productDefinition), [productDefinition]);

  const runGeneration = async () => {
    if (!workItemId) return;
    setBusy(true);
    setRequestError(null);
    try {
      const response = await triggerWorkItemProductDefinition(workItemId);
      setCurrent(response.product_definition);
      onUpdated?.();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to generate product definition");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    const version = current?.summary?.artifact_version;
    if (!workItemId || !version || !reasoning.trim()) return;
    setBusy(true);
    setRequestError(null);
    try {
      const response = await decideWorkItemProductDefinition(workItemId, {
        // Kept for compatibility with the current wire contract; the server
        // derives and records the authorized Chief of Staff identity.
        actor_id: "chief_of_staff",
        decision,
        artifact_version: version,
        reasoning: reasoning.trim(),
      });
      setCurrent(response.product_definition);
      setReasoning("");
      onUpdated?.();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to record the decision");
    } finally {
      setBusy(false);
    }
  };

  const state = current?.state ?? "unknown";
  const summary = current?.summary;
  const terminalFailure = ["failed", "incomplete", "cancelled"].includes(state);
  return (
    <Card data-testid="product-definition-panel">
      <CardHeader className="p-4 pb-2">
        <CardTitle className={`flex items-center justify-between text-sm ${terminalFailure ? "text-destructive" : ""}`}>
          <span className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-primary" /> Product Definition</span>
          <Badge variant={terminalFailure ? "destructive" : "outline"}>{state}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-1 text-xs">
        {current?.error && <p className="text-destructive" role="alert">{current.error}</p>}
        {!summary && !current?.error && (
          <p className="text-muted-foreground">
            No product definition is available. A completed novelty assessment is required.
          </p>
        )}
        {summary && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Revision v{summary.artifact_version ?? "—"}</Badge>
              <Badge variant="outline">Approval: {current?.approval_state ?? "unreviewed"}</Badge>
              <Badge variant="outline">Confidence: {summary.confidence}/10</Badge>
            </div>
            <Section title="Requirements">
              {summary.requirements.map((item) => (
                <li key={item.requirement_id}><strong>{item.title}</strong> — {item.description} ({item.priority})</li>
              ))}
            </Section>
            <Section title="User stories">
              {summary.user_stories.map((item) => (
                <li key={item.story_id}>As a <strong>{item.persona}</strong>, I need {item.need}, so that {item.benefit}.</li>
              ))}
            </Section>
            <Section title="Roadmap and estimates">
              {summary.roadmap.map((phase) => (
                <li key={phase.phase}>
                  <strong>{phase.phase}</strong>: {phase.objective} · {phase.agent_hours} agent-hours ·
                  compute {phase.projected_compute_cost} · basis: {phase.estimate_basis.method} ·
                  trust: {phase.estimate_trust} · assumptions: {phase.estimate_basis.assumptions.join("; ")}
                </li>
              ))}
            </Section>
            <Section title="Success metrics">
              {summary.success_metrics.map((metric) => (
                <li key={metric.name}><strong>{metric.name}</strong>: {metric.target} ({metric.measurement})</li>
              ))}
            </Section>
            <p><strong>Reasoning:</strong> {summary.reasoning}</p>
            <p><strong>Alternatives:</strong> {summary.alternatives.join("; ")}</p>
            <p><strong>Provenance:</strong> <span className="font-mono">{summary.provenance}</span></p>
            <p><strong>Agent:</strong> {summary.agent_id} · <strong>Generated:</strong> {new Date(summary.generated_at).toLocaleString()}</p>
            <ReferenceList references={summary.evidence_refs} />
          </>
        )}
        {current?.approval_decision && (
          <div className="rounded border p-2">
            <strong>{current.approval_decision.decision === "approve" ? "Handoff approved" : "Definition rejected"}</strong>
            {" "}by {current.approval_decision.actor_id}: {current.approval_decision.reasoning}
          </div>
        )}
        {workItemId && state !== "running" && state !== "initializing" && current?.approval_state !== "approved" && (
          <Button size="sm" variant="outline" onClick={runGeneration} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            {summary ? "Generate new revision" : "Generate product definition"}
          </Button>
        )}
        {summary && current?.approval_state !== "approved" && (
          <div className="space-y-2 rounded border p-3">
            <p className="font-medium">Chief of Staff handoff decision</p>
            <Textarea
              aria-label="Decision reasoning"
              value={reasoning}
              onChange={(event) => setReasoning(event.target.value)}
              placeholder="Record the approval or rejection reasoning"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => decide("approve")} disabled={busy || !reasoning.trim()}>
                <CheckCircle2 className="mr-1 h-3 w-3" /> Approve handoff
              </Button>
              <Button size="sm" variant="destructive" onClick={() => decide("reject")} disabled={busy || !reasoning.trim()}>
                <AlertTriangle className="mr-1 h-3 w-3" /> Reject
              </Button>
            </div>
          </div>
        )}
        {requestError && <p className="text-destructive" role="alert">{requestError}</p>}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><strong>{title}</strong><ul className="list-disc space-y-1 pl-4">{children}</ul></div>;
}

function ReferenceList({ references }: { references: string[] }) {
  return <div><strong>Evidence references</strong><ul className="list-disc pl-4">{references.map((ref) => <li key={ref}>{ref}</li>)}</ul></div>;
}

export default ProductDefinitionPanel;
