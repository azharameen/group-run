import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NoveltyAssessmentPanel from "./NoveltyAssessmentPanel";
import { triggerWorkItemValidation } from "@/api/workItems";
import type { ValidationStatus } from "@/api/ideas";

vi.mock("@/api/workItems", () => ({ triggerWorkItemValidation: vi.fn() }));

const completed: ValidationStatus = {
  state: "completed",
  idea_id: "IDEA-11",
  work_item_id: "work-11",
  summary: {
    novelty_score: 8,
    patentability_score: 7,
    patentability_outcome: "likely",
    fto_risk: "moderate",
    fto_analysis: "Review claim charts.",
    confidence: 6,
    rationale: "Combined features are not disclosed.",
    prior_art_refs: ["patent:1"],
    source_refs: ["https://example.test/1"],
    provenance: "mock://validator",
    agent_id: "idea-team-validator",
    assessed_at: "2026-08-26T00:00:00Z",
    artifact_name: "novelty-assessment",
    artifact_version: 1,
  },
};

describe("NoveltyAssessmentPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders assessment scores, risk, references, and provenance", () => {
    render(<NoveltyAssessmentPanel validation={completed} />);
    expect(screen.getByTestId("novelty-assessment-panel")).toHaveTextContent("8/10");
    expect(screen.getByText("Review claim charts.")).toBeInTheDocument();
    expect(screen.getByText("patent:1")).toBeInTheDocument();
    expect(screen.getByText("mock://validator")).toBeInTheDocument();
  });

  test("shows explicit failure and can retry through mapped work item", async () => {
    vi.mocked(triggerWorkItemValidation).mockResolvedValue({ work_item_id: "work-11", idea_id: "IDEA-11", validation: completed, lifecycle_status: "ideation" });
    render(<NoveltyAssessmentPanel validation={{ state: "failed", idea_id: "IDEA-11", error: "Research is incomplete" }} workItemId="work-11" />);
    expect(screen.getByText("Research is incomplete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run validation" }));
    await waitFor(() => expect(triggerWorkItemValidation).toHaveBeenCalledWith("work-11"));
    expect(await screen.findByText("Review claim charts.")).toBeInTheDocument();
  });
});
