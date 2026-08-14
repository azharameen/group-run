# Epic C6 Context: Polish & Optimization

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make Commander production-ready by adding quota management, robust edge-case handling, retry and escalation behaviors, and complete operational documentation so teams can run, observe, and recover automated dispatch reliably.

## Stories

- Story EP-C6.1: Jules Quota Management
- Story EP-C6.2: Edge Case Handling & Documentation

## Requirements & Constraints

- Jules quota: enforce and track a 100 sessions/day quota per Jules integration. Dispatcher must surface current usage, remaining sessions, and reset time (midnight UTC) in the dashboard.
- Dispatch behavior is threshold-driven: standard dispatch when usage <50%; priority dispatch when usage >=80% (critical items first, then Jules-ready, defer non-critical); when quota exhausted, route Jules-eligible items to Copilot exclusively and surface a quota warning and user notification.
- Merge and CI constraints: handle cross-branch conflicts on develop by serializing merges (one at a time), pulling after each merge, and notifying waiting sessions; use Copilot-assisted conflict resolution as an automated remediation path where applicable.
- Error handling: terminal Jules session failures must be logged with human-readable reasoning, exposed on the board, and allow re-dispatch of a "fix" session. Users must be notified of quota/execution errors.
- Escalation control: enforce a 2-minute timeout for Copilot escalation/feedback loops; on timeout defer feedback and log the escalation for review while continuing Jules sessions as appropriate.
- Pipeline resiliency: implement retry logic for transient CI/pipeline failures, track retry counts, and escalate persistent failures for manual review.
- Documentation deliverables: final architecture doc, user guide for Command Center + Commander, BMad customization reference, CI pipeline docs, and a troubleshooting guide. Documentation must be accurate and runnable (how to reproduce common failures and recovery steps).

## Technical Decisions

- Centralized quota store: maintain a single source of truth for Jules usage (with atomic updates at dispatch) so dashboard values and dispatch logic stay consistent.
- Thresholds and policies: implement explicit thresholds at 50% (no special ordering) and 80% (priority ordering). Thresholds are config values surfaced to ops—do not hard-code in multiple places.
- Dispatcher fallback: when Jules quota exhausted, automatically route to Copilot without human intervention; surface warnings and notification hooks so operators can intervene.
- Time semantics: interpret reset time as midnight UTC for quota reset calculations and display.
- Escalation timeout: enforce a hard 2-minute timeout on Copilot feedback loops; record the timeout event and continue with deferred feedback to avoid livelock.
- Retry strategy: distinguish transient vs persistent CI failures; implement exponential backoff with a capped retry count and a clear escalated state when the cap is reached (retry count tracked on the session/pipeline object).
- Observability: require structured logging (reason, error code, session id) and dashboard mappings for quota warnings, terminal errors, escalation events, and retry state so developers/operators can triage quickly.
- Minimal automation for conflict resolution: allow Copilot-suggested resolutions to be applied automatically when unambiguous; otherwise mark for human review and notify waiting sessions.

## Cross-Story Dependencies

- EP-C6.1 (Quota) <-> EP-C6.2 (Edge cases & Docs): Dispatcher behavior (threshold logic, fallback to Copilot, and dashboard warnings) must be implemented before documentation can be finalized; documentation depends on completed quota and error surface points.
- Copilot integration: both stories depend on stable Copilot fallbacks and escalation handling (2-minute timeout, logging). Ensure Copilot error/timeout signals are exposed to the dispatcher.
- CI/pipeline retry behavior must be in place before merge-serialization behavior is validated end-to-end, since pipeline flakiness affects merge and dispatch outcomes.
- Observability: logging and dashboard fields (quota usage, reset time, retry counts, escalation logs, session error reason) are shared infra required by both stories; implement once and reuse.
