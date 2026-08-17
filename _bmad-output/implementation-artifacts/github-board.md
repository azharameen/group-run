# GitHub Board Reference — "Group Run" (project #4)

> Identity + field IDs + AD-18/AD-19 sync procedure for the Group Run board.
> Loaded as a persistent fact by the BMAD planning/dev/retro skills via team
> overrides in `_bmad/custom/`. Update this file whenever items are added or
> options are renamed (it is part of the AD-18 sync loop).

## Identity

- Repo: `azharameen/group-run` · owner `azharameen`
- Project: "Group Run" #4 · node ID `PVT_kwHOAJ-q4c4Bgfea`
- `gh` CLI quirks: `gh project *` uses `--format json`; `item-list` defaults to 30 items → pass `--limit 100`; there is no `gh milestone` command (use `gh api`).

## Fields & options (read 2026-08-17)

| Field | Field ID | Type / options |
|---|---|---|
| Status | `PVTSSF_lAHOAJ-q4c4Bgfeazhfe4Ck` | single-select: Backlog `f75ad846` · In Progress `47fc9ee4` · In Review `fb6c50f7` · On Hold `ccb0a41e` · Done `98236657` |
| Issue Type | `PVTSSF_lAHOAJ-q4c4Bgfeazhfgrrc` | single-select: Epic `e76f70fa` · Story `73799926` · Task `defcd137` · Bug `c070c336` |
| Sprint | `PVTIF_lAHOAJ-q4c4BgfeazhfguqI` | iteration: Sprint 1 `e876806a` · Sprint 2 `5712f32c` (use the raw iterationId — the `PVTFIV_…` value id is rejected by the API) |

New sprint iterations cannot be created via the available API → the owner creates "Sprint N" in the board UI at planning time (one click), then the agent reads the new iterationId from the seeded item's fieldValues.

## Item id map (prefix `PVTI_lAHOAJ-q4c4Bgfeaz`)

| issue | suffix | issue | suffix |
|---|---|---|---|
| #8 Jules e2e data isolation | `g2uO0k` | #21 Epic 0 (closed) | `g2utOo` |
| #9 (open) | `g2uO10` | #22 Epic 1 (closed) | `g2utQc` |
| #10 | `g2uO2s` | #23 Epic 2 (closed) | `g2utUc` |
| #11 | `g2uO3c` | #24 Epic 3 (closed) | `g2utX4` |
| #12 | `g2uO4g` | #25 Epic 4 (closed) | `g2utZo` |
| #26 Epic 5 (closed) | `g2utbo` | #27 Epic 6 (closed) | `g2utdc` |
| #28 Epic 7 (closed) | `g2utfc` | #29 Epic 8 | `g2utiQ` |
| #30 Epic 9 | `g2utkU` | #31 Epic 10 | `g2utlc` |
| #32 Epic 11 | `g2utm8` | #33 Epic 12 | `g2utos` |
| #35 story 8.1 | `g2u2AA` | #36 story 8.2 | `g2u2BY` |
| #37 story 8.3 | `g2u2Ck` | #38 story 8.4 | `g2u2Eo` |
| #39 story 9.1 | `g2u2GM` | #40 story 9.2 | `g2u2I8` |
| #41 story 9.3 | `g2u2KA` | #42 story 10.1 | `g2u2MA` |
| #43 story 10.2 | `g2u2M8` | #44 story 10.3 | `g2u2Nk` |
| #45 story 10.4 | `g2u2Ow` | #46 story 11.1 | `g2u2Qk` |
| #47 story 11.2 | `g2u2Sg` | #48 story 11.3 | `g2u2UU` |
| #49 story 12.1 | `g2u2Vc` | #50 story 12.2 | `g2u2W0` |
| #51 story 12.3 | `g2u2YU` | | |

## Status machine (AD-19)

- **Story / Task / Bug:** Backlog (created) → In Progress (dev start) → In Review (PR opened) → Done (merged to develop). Deferred → On Hold + deferred-work ledger entry.
- **Epic:** Backlog (planned) → In Progress (first story started) → Done (all children Done **and** the sprint retrospective is complete).

## Sync procedure (AD-18 delta-apply)

1. Read state with the state query below.
2. Compute the delta vs the intended state.
3. Edit only the delta, one field per call:
   `gh project item-edit --id <itemId> --project-id PVT_kwHOAJ-q4c4Bgfea --field-id <fieldId> --single-select-option-id <optionId>` (or `--iteration-id <iterationId>` for Sprint).
4. Re-query and verify — assert the checked count. Log any failure in the deferred-work ledger.
- Throttling ≈ 10 s per item-edit; batches are idempotent, stopping mid-flight is safe.
- **Content source of truth:** epics.md and story files. GitHub issue bodies are generated mirrors — never maintain separate body files.
- Epic body = goal + story list (priority, deps, issue links) + meta + source + hierarchy line. Story body = story text + acceptance criteria + meta + source + hierarchy line (template used for #35–#51 on 2026-08-17).

## State query (trimmed GraphQL proxy)

```
{ node(id: "PVT_kwHOAJ-q4c4Bgfea") { ... on ProjectV2 { items(first: 100) { nodes {
  id
  content { ... on Issue { number } }
  fieldValues(first: 15) { nodes {
    ... on ProjectV2ItemFieldSingleSelectValue { name optionId }
    ... on ProjectV2ItemFieldIterationValue { iterationId title }
  } } } } } }
```

Option ids are unique across fields, so the local optionId→name map is safe for verification.
