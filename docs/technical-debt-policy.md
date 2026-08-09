# Technical Debt & Deferred Work Policy

## 1. Definition of Deferred Work
Deferred work is any task, test gap, or code improvement identified during implementation or code review that is explicitly postponed to a later story or epic.

## 2. Tracking Mechanism
All deferred work MUST be recorded in `_bmad-output/implementation-artifacts/deferred-work.md`. Each entry must include:
- Source story/spec
- Summary of the gap
- Evidence (e.g., file/line reference)
- Severity (Low, Medium, High)
- Proposed resolution (optional)

## 3. Cumulative Risk Thresholds
To prevent the accumulation of unmanageable technical debt, the following thresholds trigger mandatory cleanup:

| Category | Threshold | Action |
|---|---|---|
| **High Severity** | 1 item | MUST resolve in the current epic or next story |
| **Medium Severity** | 3 items | MUST create a cleanup story in the current epic |
| **Total Items** | 10 items | MUST halt new feature development for a cleanup story |

## 4. Triage Cadence
- **Sprint Start:** Review `deferred-work.md` and decide which items to incorporate into the current sprint.
- **Epic Retro:** Triage all items deferred during the epic. Assign owners and target epics.

## 5. Cleanup Stories
Cleanup stories (e.g., `Story X.0`) are dedicated to resolving deferred debt and codebase health. They should be prioritized at the start of an epic if thresholds are exceeded.
