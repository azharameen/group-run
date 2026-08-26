import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ProductDefinitionPanel from "./ProductDefinitionPanel";
import {
  decideWorkItemProductDefinition,
  triggerWorkItemProductDefinition,
  type ProductDefinitionStatus,
} from "@/api/workItems";

vi.mock("@/api/workItems", () => ({
  decideWorkItemProductDefinition: vi.fn(),
  triggerWorkItemProductDefinition: vi.fn(),
}));

const completed: ProductDefinitionStatus = {
  state: "completed",
  idea_id: "IDEA-11",
  work_item_id: "work-11",
  approval_state: "unreviewed",
  summary: {
    requirements: [{
      requirement_id: "REQ-1", title: "Capture a run", description: "Save a result", priority: "must",
      evidence_refs: ["assessment:v1"],
    }],
    user_stories: [{
      story_id: "US-1", persona: "organizer", need: "record the result", benefit: "review it",
      acceptance_criteria: ["Given a result, when saved, then it is reviewable."],
      evidence_refs: ["assessment:v1"],
    }],
    roadmap: [{
      phase: "MVP", objective: "Deliver capture", deliverables: ["Form"], agent_hours: 12,
      projected_compute_cost: 4.5, estimate_basis: {
        method: "task decomposition", assumptions: ["Existing API"], evidence_refs: ["assessment:v1"],
      }, estimate_trust: "generated",
    }],
    success_metrics: [{
      name: "Captures", target: "95%", measurement: "Telemetry", evidence_refs: ["assessment:v1"],
    }],
    confidence: 8, reasoning: "Validated", alternatives: ["Manual"], evidence_refs: ["assessment:v1"],
    provenance: "mock://product", agent_id: "product-team", generated_at: "2026-08-26T00:00:00Z",
    trust: "generated", artifact_name: "product-definition", artifact_version: 1,
  },
};

describe("ProductDefinitionPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders definition sections and generated estimate trust", () => {
    render(<ProductDefinitionPanel productDefinition={completed} />);
    expect(screen.getByTestId("product-definition-panel")).toHaveTextContent("Capture a run");
    expect(screen.getByText(/12 agent-hours/)).toBeInTheDocument();
    expect(screen.getByText(/trust: generated/)).toBeInTheDocument();
    expect(screen.getByText("Approval: unreviewed")).toBeInTheDocument();
  });

  test("requires reasoning and sends an explicit Chief of Staff approval", async () => {
    vi.mocked(decideWorkItemProductDefinition).mockResolvedValue({
      work_item_id: "work-11", idea_id: "IDEA-11", product_definition: {
        ...completed, approval_state: "approved",
      }, lifecycle_status: "development",
    });
    render(<ProductDefinitionPanel productDefinition={completed} workItemId="work-11" />);
    const approve = screen.getByRole("button", { name: /approve handoff/i });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Decision reasoning"), { target: { value: "Ready." } });
    fireEvent.click(approve);
    await waitFor(() => expect(decideWorkItemProductDefinition).toHaveBeenCalledWith(
      "work-11",
      expect.objectContaining({
        actor_id: "chief_of_staff", decision: "approve", artifact_version: 1, reasoning: "Ready.",
      }),
    ));
    expect(await screen.findByText("Approval: approved")).toBeInTheDocument();
  });

  test("shows explicit generation failure", () => {
    render(<ProductDefinitionPanel
      productDefinition={{ state: "failed", idea_id: "IDEA-11", approval_state: "unreviewed", error: "Assessment missing" }}
      workItemId="work-11"
    />);
    expect(screen.getByRole("alert")).toHaveTextContent("Assessment missing");
    expect(triggerWorkItemProductDefinition).not.toHaveBeenCalled();
  });
});
