# Epic C5 Context: Trust & Observability

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Commander decisions must be auditable, measurable, and improvable: every decision is recorded in a compact, machine-parseable log, surfaced in a real-time trust dashboard, and fed into a learning loop so the system’s accuracy and auto-resolution behavior improve over time.

## Stories

- Story EP-C5.1: JSONL Logging & Trust Dashboard
- Story EP-C5.2: Learning Loop Implementation
- Story EP-C5.3: CI Pipeline Redesign

## Requirements & Constraints

- Decision logging: every Commander decision is appended as a valid JSONL record. Required fields: timestamp, action type (dispatch/resolve/review/merge), item ID, decision (jules/copilot/defer/merge), reasoning text, confidence score, outcome (filled after completion), duration (ms), and relevant session IDs. Log format must remain valid JSONL for streaming/ingest.

- Dashboard metrics: aggregate logs and CI signals to present dispatch accuracy rate, auto-resolution rate, PR review pass rate, pipeline success rate, human override count, silent failure count, and a 7-day trend. Metrics must update in near real-time and expose recent learning/log entries and human override details.

- Visual indicators: use progress bars and color-coding with explicit thresholds (green >80%, yellow 60–80%, red <60%) for high-level health signals.

- Learning loop: detect outcome ≠ expected cases, flag mismatches for aggregation and analysis, and support automated refinement of classification rules and confidence thresholds. All rule updates must be observable in the dashboard (recent rule updates, accuracy trend, top mismatch categories) and be reviewable before any high-risk automatic policy changes.

- CI & quality gates: backend linting and testing, frontend linting and testing, and E2E coverage must be enforced. Tooling and minimums specified by the plan: Ruff for backend linting, ESLint for frontend linting, 80% coverage gates for unit tests (pytest/vitest), Playwright E2E runs on develop PRs, and artifacts uploaded for diagnostics. Failures must block merges where specified.

- Operability constraints: logging and metrics collection must scale without blocking decision latency; the learning analysis may run asynchronously. Data retention, access controls, and privacy requirements are out of scope here and must follow org standards.

## Technical Decisions

- Use JSONL as the canonical append-only decision log format to simplify streaming ingestion, line-oriented parsing, and backfill. Keep each record small and schema-stable.

- Centralize ingest: write logs to a single, append-optimized store or object (file or blob) per run to enable replay and dashboard consumption; expose a small ingestion API for live events.

- Metric aggregation will be computed from logs + CI events rather than duplicating decision-state in multiple systems. Export metrics to the dashboard ingestion pipeline (prometheus-compatible or equivalent) for real-time updates and thresholding.

- Visual thresholds and color-coding are explicit and encoded in the dashboard layer (green >80%, yellow 60–80%, red <60%) so UI and alerting use the same rules.

- Learning loop is decoupled from the decision path: online decisions write logs synchronously; mismatch detection and rule re-training run asynchronously on aggregated data. Rule changes must be versioned and surfaced in the dashboard.

- Enforce CI tooling and gates as part of the repository pipeline: Ruff (backend), ESLint (frontend), pytest/vitest coverage checks at 80%, Playwright E2E on develop PRs; pipeline artifacts (coverage, test results) are required inputs for pipeline success metrics.

## Cross-Story Dependencies

- EP-C5.1 (logging + dashboard) is the foundational dependency: EP-C5.2’s learning loop consumes the JSONL stream and EP-C5.3’s pipeline status and artifacts are required inputs for pipeline-success and PR-pass metrics.

- CI pipeline (EP-C5.3) must provide stable artifacts and signals (coverage, test results, E2E outcomes) before the dashboard can report accurate pipeline success and PR review pass rates.

- Rule updates from the learning loop must include metadata linking back to originating log entries (IDs, timestamps, sessions) to enable audit and rollback.

- Real-time metric requirements imply a reliable ingestion path and monitoring for silent failures; logging must include enough context to diagnose missing or malformed events.
