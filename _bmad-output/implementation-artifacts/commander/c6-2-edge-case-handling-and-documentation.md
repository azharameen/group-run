---
spec_file: c6-2-edge-case-handling-and-documentation.md
status: in-progress
baseline_revision: e25703d
---

# Story C6.2: Edge Case Handling & Documentation

Status: in-progress

## Story

As a **Companion project maintainer**,
I want **edge cases handled and documentation complete**,
so that **Commander is production-ready**.

## Acceptance Criteria

1. Given cross-branch conflicts on develop, when multiple sessions push to develop, then Commander serializes merges one at a time
2. Given a Jules session fails, when session reaches terminal error state, then Commander logs error with reasoning and allows fix session dispatch
3. Given Copilot escalation loops, when Copilot can't resolve feedback within 2 minutes, then feedback is deferred and logged

## Tasks / Subtasks

- [ ] Implement merge serialization queue (AC: 1)
  - [ ] Add `mergeQueue` to state for tracking pending merges
  - [ ] Process merges sequentially, pull after each
  - [ ] Notify waiting sessions when merge completes
- [ ] Add session failure handling (AC: 2)
  - [ ] Detect terminal FAILED state with error reason
  - [ ] Log error to JSONL with session context
  - [ ] Expose `dispatchFixSession()` for re-dispatch
- [ ] Verify escalation timeout and deferral (AC: 3)
  - [ ] Confirm 2-minute timeout in createFeedbackCard
  - [ ] Ensure deferred feedback appended to deferred-work.md
  - [ ] Log escalation events

## Dev Notes

### Merge Serialization Queue

```javascript
const mergeQueue = {
  pending: [],
  processing: false,
  async enqueue(branch, prNumber) {
    this.pending.push({ branch, prNumber, timestamp: Date.now() });
    this.processNext();
  },
  async processNext() {
    if (this.processing || this.pending.length === 0) return;
    this.processing = true;
    const item = this.pending.shift();
    try {
      // Pull latest develop
      await gitPull('develop');
      // Merge branch
      await gitMerge(item.branch);
      // Push to develop
      await gitPush('develop');
    } finally {
      this.processing = false;
      this.processNext(); // Process next in queue
    }
  }
};
```

### Fix Session Dispatch

```javascript
async function dispatchFixSession(failedSession, errorReason) {
  const fixStory = {
    id: `fix-${failedSession.storyId}`,
    error: errorReason,
    originalSession: failedSession.id
  };
  return createSession({
    prompt: `Fix session for ${failedSession.storyId}. Error: ${errorReason}`,
    source: fixStory
  });
}
```

### References

- [Source: _bmad-output/planning-artifacts/commander-epics.md#Epic-EP-C6]
- [Source: .github/extensions/command-center/commander.mjs]

## File List

- `.github/extensions/command-center/commander.mjs` — merge queue, fix session dispatch
- `.github/extensions/command-center/extension.mjs` — failure state UI
