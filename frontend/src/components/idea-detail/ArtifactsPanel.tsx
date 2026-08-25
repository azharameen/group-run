import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { fetchArtifactDiff, fetchIdeaRevisions, type ArtifactRevision } from "@/api/client";
import { ArtifactDiffPanel } from "@/components/deepagents/ArtifactDiffPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ArtifactsPanelProps {
  ideaId: string;
  research?: IdeaResearch;
}

interface IdeaResearch {
  state: string;
  error?: string;
  artifact_names?: string[];
  expected_artifacts?: string[];
  completed_artifacts?: string[];
  updated_at?: number;
}

const EXPECTED_ARTIFACTS = ["market-summary", "competitors", "prior-art", "feasibility", "target-audience"];

const trustVariant = (trust: string): "default" | "secondary" | "destructive" | "outline" => {
  if (trust === "fallback") return "destructive";
  if (trust === "generated") return "secondary";
  if (trust === "trusted") return "default";
  return "outline";
};

export function ArtifactsPanel({ ideaId, research }: ArtifactsPanelProps) {
  const [revisions, setRevisions] = useState<ArtifactRevision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(null);
  const [compareName, setCompareName] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchIdeaRevisions(ideaId)
      .then((result) => {
        if (active) setRevisions(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load artifacts");
      });
    return () => {
      active = false;
    };
  }, [ideaId, research?.state, research?.updated_at, research?.completed_artifacts?.join(",")]);

  const latestByArtifact = useMemo(() => {
    const grouped = new Map<string, ArtifactRevision[]>();
    revisions.forEach((revision) => {
      const current = grouped.get(revision.artifact_name) || [];
      current.push(revision);
      grouped.set(revision.artifact_name, current);
    });
    return Array.from(grouped.entries()).map(([name, items]) => ({
      name,
      revisions: items,
      latest: items.reduce((a, b) => (a.version > b.version ? a : b)),
    }));
  }, [revisions]);

  const openComparison = async (name: string) => {
    setCompareName(name);
    setComparison(null);
    setCompareError(null);
    try {
      setComparison(await fetchArtifactDiff(ideaId, name));
    } catch (reason: unknown) {
      setCompareError(reason instanceof Error ? reason.message : "Unable to load comparison");
    }
  };

  const expected = research?.expected_artifacts || research?.artifact_names || EXPECTED_ARTIFACTS;
  const completed = research?.completed_artifacts || [];
  const missing = expected.filter((name) => !completed.includes(name));
  const showStatus = Boolean(research && research.state !== "completed");

  if (error) return <div className="space-y-3">
    {showStatus && <ResearchStatus research={research!} expected={expected} completed={completed} missing={missing} />}
    <p className="text-sm text-destructive" role="alert">{error}</p>
  </div>;
  if (!revisions.length) {
    return <div className="space-y-3">
      {showStatus && <ResearchStatus research={research!} expected={expected} completed={completed} missing={missing} />}
      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No artifact revisions available.</CardContent></Card>
    </div>;
  }

  return (
    <>
      <div className="space-y-4">
        {latestByArtifact.map(({ name, revisions: artifactRevisions, latest }) => (
          <Card key={name}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{name}</span>
                {artifactRevisions.length >= 2 && (
                  <Button size="sm" variant="outline" onClick={() => openComparison(name)}>Compare</Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span>Version {latest.version}</span>
                <Badge variant={trustVariant(latest.trust)}>{latest.trust}</Badge>
                <span className="text-muted-foreground">Agent: {latest.agent_id || "unknown"}</span>
                <span className="text-muted-foreground">{new Date(latest.timestamp).toLocaleString()}</span>
              </div>
              <p className="font-mono text-muted-foreground">{latest.provenance}</p>
              {Array.isArray(latest.evidence_refs) && latest.evidence_refs.length > 0 && (
                <ul className="space-y-1">
                  {latest.evidence_refs.map((reference) => (
                    <li key={reference} className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span className="text-primary underline" title={reference} data-testid="evidence-ref">{reference}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={compareName !== null} onOpenChange={(open) => !open && setCompareName(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{compareName} comparison</DialogTitle></DialogHeader>
          {compareError && <p className="text-sm text-destructive" role="alert">{compareError}</p>}
          {comparison && comparison.available && comparison.previous && comparison.latest ? (
            <ArtifactDiffPanel
              versionA={`v${(comparison.previous as ArtifactRevision).version}`}
              versionB={`v${(comparison.latest as ArtifactRevision).version}`}
              contentA={String(comparison.content_a || "")}
              contentB={String(comparison.content_b || "")}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No comparison available for this artifact.</p>
          )}
        </DialogContent>
      </Dialog>
      {showStatus && <ResearchStatus research={research!} expected={expected} completed={completed} missing={missing} />}
    </>
  );
}

function ResearchStatus({
  research,
  expected,
  completed,
  missing,
}: {
  research: IdeaResearch;
  expected: string[];
  completed: string[];
  missing: string[];
}) {
  const unsuccessful = research.state === "failed" || research.state === "incomplete" || research.state === "cancelled";
  return <Card data-testid="research-status">
    <CardHeader className="p-4 pb-2"><CardTitle className={unsuccessful ? "text-sm text-destructive" : "text-sm"}>Research {research.state}</CardTitle></CardHeader>
    <CardContent className="p-4 pt-1 space-y-2 text-xs">
      <p>Artifacts completed: {completed.length} of {expected.length}</p>
      {missing.length > 0 && <p>Missing: {missing.join(", ")}</p>}
      {research.error && <p className="text-destructive">{research.error}</p>}
    </CardContent>
  </Card>;
}

export default ArtifactsPanel;
