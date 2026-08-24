import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ArtifactsPanel from "./ArtifactsPanel";
import { fetchArtifactDiff, fetchIdeaRevisions } from "@/api/client";

vi.mock("@/api/client", () => ({
  fetchArtifactDiff: vi.fn(),
  fetchIdeaRevisions: vi.fn(),
}));

vi.mock("@/components/deepagents/ArtifactDiffPanel", () => ({
  ArtifactDiffPanel: (props: { contentA?: string; contentB?: string }) => (
    <div data-testid="artifact-diff">{props.contentA} → {props.contentB}</div>
  ),
}));

const revision = (version: number) => ({
  artifact_name: "abstract",
  version,
  timestamp: "2026-08-22T10:15:00Z",
  path: `abstract-v${version}.md`,
  file_name: `abstract-v${version}.md`,
  content: `content ${version}`,
  diff: "",
  provenance: "artifact:idea:abstract",
  agent_id: "deepagents",
  trust: version === 1 ? "generated" : "verified-tool-call",
  evidence_refs: ["knowledge-base/paper.md"],
});

describe("ArtifactsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders provenance, trust badge, and evidence references", async () => {
    vi.mocked(fetchIdeaRevisions).mockResolvedValue([revision(1)]);
    render(<ArtifactsPanel ideaId="idea-1" />);
    expect(await screen.findByText("generated")).toBeInTheDocument();
    expect(screen.getByText(/deepagents/)).toBeInTheDocument();
    expect(screen.getByTestId("evidence-ref")).toHaveTextContent("knowledge-base/paper.md");
  });

  test("shows an empty state", async () => {
    vi.mocked(fetchIdeaRevisions).mockResolvedValue([]);
    render(<ArtifactsPanel ideaId="idea-1" />);
    expect(await screen.findByText("No artifact revisions available.")).toBeInTheDocument();
  });

  test("surfaces API errors", async () => {
    vi.mocked(fetchIdeaRevisions).mockRejectedValue(new Error("network failed"));
    render(<ArtifactsPanel ideaId="idea-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("network failed");
  });

  test("opens a comparison dialog", async () => {
    vi.mocked(fetchIdeaRevisions).mockResolvedValue([revision(1), revision(2)]);
    vi.mocked(fetchArtifactDiff).mockResolvedValue({
      available: true,
      previous: revision(1),
      latest: revision(2),
      content_a: "content 1",
      content_b: "content 2",
    });
    render(<ArtifactsPanel ideaId="idea-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Compare" }));
    await waitFor(() => expect(screen.getByTestId("artifact-diff")).toBeInTheDocument());
    expect(screen.getByText("content 1 → content 2")).toBeInTheDocument();
  });
});
