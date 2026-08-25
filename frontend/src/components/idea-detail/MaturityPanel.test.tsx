import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MaturityPanel from "./MaturityPanel";
import { fetchIdeaMaturity, recordIdeaMaturity, type IdeaMaturity, type MaturityRecord } from "@/api/ideas";

vi.mock("@/api/ideas", () => ({
  fetchIdeaMaturity: vi.fn(),
  recordIdeaMaturity: vi.fn(),
}));

const record = (stage: string) => ({
  stage,
  criteria: [`met ${stage} criteria`],
  evidence_refs: ["artifact:research:v1"],
  recorded_by: "user",
  recorded_at: `2026-08-25T12:00:00+00:00`,
});

const baseMaturity = (): IdeaMaturity => ({
  idea_id: "idea-1",
  stage: "raw",
  current: null,
  history: [] as MaturityRecord[],
  next_stage: "refined",
  stage_criteria: {
    refined: ["Problem statement names the problem and who is affected"],
    validated: ["Claims are backed by research artifacts or KB references"],
    "ready-for-planning": ["Feasibility and business impact assessed"],
  },
});

const maturity = (overrides: Partial<ReturnType<typeof baseMaturity>> = {}) => ({
  ...baseMaturity(),
  ...overrides,
});

const openTransitionDialog = async () => {
  fireEvent.click(await screen.findByTestId("record-transition-button"));
  await screen.findByTestId("criteria-textarea");
};

describe("MaturityPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  test("shows current stage and next-stage criteria", async () => {
    vi.mocked(fetchIdeaMaturity).mockResolvedValue(maturity());
    render(<MaturityPanel ideaId="idea-1" />);
    expect(await screen.findByTestId("current-stage-badge")).toHaveTextContent("raw");
    expect(screen.getByTestId("stage-refined")).toBeInTheDocument();
    expect(screen.getByTestId("stage-ready-for-planning")).toBeInTheDocument();
    expect(screen.getByText("Problem statement names the problem and who is affected")).toBeInTheDocument();
  });

  test("shows full history for a terminal idea", async () => {
    const history = ["refined", "validated", "ready-for-planning"].map(record);
    vi.mocked(fetchIdeaMaturity).mockResolvedValue(
      maturity({ stage: "ready-for-planning", next_stage: null, current: history[2], history }),
    );
    render(<MaturityPanel ideaId="idea-1" />);
    expect(await screen.findByTestId("current-stage-badge")).toHaveTextContent("ready-for-planning");
    expect(screen.getAllByTestId("history-entry")).toHaveLength(3);
    expect(screen.getAllByText("Recorded by user")).toHaveLength(3);
    expect(screen.getAllByText("Evidence: artifact:research:v1")).toHaveLength(3);
    expect(screen.queryByTestId("record-transition-button")).not.toBeInTheDocument();
  });

  test("submitting the dialog calls recordIdeaMaturity with parsed arrays and refreshes", async () => {
    vi.mocked(fetchIdeaMaturity)
      .mockResolvedValueOnce(maturity())
      .mockResolvedValueOnce(
        maturity({ stage: "refined", next_stage: "validated", current: record("refined"), history: [record("refined")] }),
      );
    vi.mocked(recordIdeaMaturity).mockResolvedValue({ idea_id: "idea-1", stage: "refined", record: record("refined") });
    render(<MaturityPanel ideaId="idea-1" />);
    await openTransitionDialog();
    fireEvent.change(screen.getByTestId("criteria-textarea"), {
      target: { value: "first criterion\n\nsecond criterion" },
    });
    fireEvent.change(screen.getByTestId("evidence-textarea"), {
      target: { value: "artifact:research:v1\nknowledge-base/paper.md" },
    });
    fireEvent.click(screen.getByTestId("submit-transition-button"));
    await waitFor(() =>
      expect(vi.mocked(recordIdeaMaturity)).toHaveBeenCalledWith("idea-1", {
        stage: "refined",
        criteria: ["first criterion", "second criterion"],
        evidence_refs: ["artifact:research:v1", "knowledge-base/paper.md"],
        recorded_by: "user",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("current-stage-badge")).toHaveTextContent("refined"),
    );
  });

  test("blocks submission with empty criteria or evidence", async () => {
    vi.mocked(fetchIdeaMaturity).mockResolvedValue(maturity());
    vi.mocked(recordIdeaMaturity).mockResolvedValue({ idea_id: "idea-1", stage: "refined", record: record("refined") });
    render(<MaturityPanel ideaId="idea-1" />);
    await openTransitionDialog();
    fireEvent.change(screen.getByTestId("criteria-textarea"), { target: { value: "  " } });
    fireEvent.change(screen.getByTestId("evidence-textarea"), { target: { value: "artifact:research:v1" } });
    fireEvent.click(screen.getByTestId("submit-transition-button"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/required/);
    expect(vi.mocked(recordIdeaMaturity)).not.toHaveBeenCalled();
  });

  test("surfaces API errors from recordIdeaMaturity", async () => {
    vi.mocked(fetchIdeaMaturity).mockResolvedValue(maturity());
    vi.mocked(recordIdeaMaturity).mockRejectedValue(new Error("Conflict: cannot transition from 'raw' to 'validated'"));
    render(<MaturityPanel ideaId="idea-1" />);
    await openTransitionDialog();
    fireEvent.change(screen.getByTestId("criteria-textarea"), { target: { value: "criterion" } });
    fireEvent.change(screen.getByTestId("evidence-textarea"), { target: { value: "artifact:research:v1" } });
    fireEvent.click(screen.getByTestId("submit-transition-button"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot transition/);
  });

  test("propagates fetch errors", async () => {
    vi.mocked(fetchIdeaMaturity).mockRejectedValue(new Error("network down"));
    render(<MaturityPanel ideaId="idea-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
  });
});
