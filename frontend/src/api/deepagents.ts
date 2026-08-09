// ── Deprecated: re-export from centralized API client ──────────────────────
// These functions are deprecated; the underlying implementations have moved
// to @/api/client (which re-exports from @/api/threads).
//
// Old endpoints (/api/workflow/interrupts, /api/workflow/{id}/approve, etc.)
// no longer exist. The new endpoints are:
//   GET  /api/interrupts/pending
//   PATCH /api/interrupts/{id}/approve
//   PATCH /api/interrupts/{id}/reject

export {
  fetchPendingInterrupts,
  approveInterrupt,
  rejectInterrupt,
} from '@/api/client';
