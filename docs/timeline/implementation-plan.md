# Timeline Resolution Model: Implementation Plan

- Spec: `docs/timeline/spec.md` (v0.7), with its reference suite in `docs/timeline/ref/`.
- Date: 2026-09-29
- Direction: timelines **replace** pages. Existing shows are converted on open (Phase 9). Until then, everything sits behind a dev flag.
- Working protocol and status board: [README.md](README.md). Per-phase work: [phases/](phases/).

This file holds the context every phase shares: repo facts, the conflicts
between the spec and the app, dependencies, and risks. Phase files cite
conflicts by ID (`C-n`). Change this file only to record a decision, and log
that change in the phase that made it.

## 1. Repo facts the plan depends on (verified 2026-09-29)

| Area           | Fact                                                                                                                                                                                                         | Source                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Schema         | Drizzle; no STRICT tables; latest migration `0016_unique_ultimo`; migrations run only when `user_version === 7`                                                                                              | `apps/desktop/electron/database/migrations/schema.ts`, `DrizzleMigrationService.ts`            |
| Name clashes   | `marchers` exists, with no home coordinates. `shapes` exists as page-bound SVG shapes (`shapes`, `shape_pages`, `shape_page_marchers`)                                                                       | `schema.ts:133`, `:268-312`                                                                    |
| Guard triggers | Defined in the `triggers.ts` map and recreated by `createAllTriggers` after migrations and repair                                                                                                            | `migrations/triggers.ts`                                                                       |
| Undo record    | Per-row inverse SQL keyed by `rowid`. `_it` and `_ut` are AFTER triggers; **`_dt` is BEFORE DELETE**. The delete inverse is `INSERT (cols…)` **without rowid**                                               | `apps/desktop/src/db-functions/history.ts:460-564`                                             |
| Undo replay    | `ORDER BY sequence DESC`, inside one transaction, with **`PRAGMA foreign_keys = OFF`**. BEFORE triggers still fire. No commit-time check and no change-log handling                                          | `history.ts:653-789`                                                                           |
| Write path     | `transactionWithHistory` (promise-locked, asserts the undo group advanced); `{action}InTransaction` helpers; TanStack Query invalidation through a table→key map                                             | `history.ts:55-170`, `apps/desktop/src/hooks/queries/utils.ts:39`                              |
| DB access      | Renderer → Drizzle sqlite-proxy → one IPC call per statement → `node:sqlite` in the main process (SQLite 3.51, JSON1 available)                                                                              | `apps/desktop/src/global/database/db.ts`, `database.services.ts`                               |
| Tests          | `describeDbTests` runs on `node:sqlite` (`src/test/base.tsx:414`). `test:history` fixtures snapshot tracked tables. `packages/core` uses Vitest, with `fast-check` available                                 | `apps/desktop/package.json`, `packages/core/package.json`                                      |
| Playback       | One keyframe per page end, in **milliseconds**, with linear or pathway interpolation (`Keyframes.ts:32`). Per-frame `setMarcherPositionsAtTime` (`useAnimation.ts:161`). Static render reads `marcher_pages` | `apps/desktop/src/utilities/Keyframes.ts`, `hooks/useAnimation.ts`, `components/canvas/`       |
| Time           | `beats.position` orders beats; the `timing_objects` view gives a cumulative `timestamp`. **There is no time→beat function**                                                                                  | `schema.ts:76`, `:403`                                                                         |
| Export         | Video samples `getCoordinatesAtTime` (`videoFrameRenderer.ts:261`). Coordinate sheets read `marcher_pages` directly                                                                                          | `apps/desktop/src/components/exporting/`                                                       |
| Flags          | No feature-flag system. Per-file `workspace_settings` (zod) and per-user `UiSettingsStore` exist                                                                                                             | `apps/desktop/src/settings/workspaceSettings.ts`, `apps/desktop/src/stores/UiSettingsStore.ts` |
| Geometry       | `packages/core/src/path-utility` exists, but its arcs go through svg-path-commander, which isn't closed-form. Port `ref/geom.mjs` exactly instead of reusing it                                              | `packages/core/src/path-utility/`                                                              |

## 2. Conflicts between the spec and the app

Each conflict has a decision. C-1, C-2 and C-8 go back to the spec's authors in
Phase 0. Record outcomes in the ADR (`docs/adr/0001-timeline-motion-model.md`).

- **C-1: U-4's cascade order breaks under the app's undo.** The spec's U-4
  assumes AFTER DELETE history triggers, which log children before their
  parent. The app's `_dt` is BEFORE DELETE, so a cascaded delete logs the
  parent first. Undo then re-inserts assignments before their transition
  exists, and `asn_bounds_ins` rejects the undo. **Decision:** use the spec's
  named fallback. The foreign keys timeline→transition and
  transition→assignment/slot_destination become `ON DELETE RESTRICT`, and
  db-functions delete children explicitly first. Leave the global `_dt`
  unchanged. Marcher→assignment keeps CASCADE, because no assignment trigger
  reads `marchers`, so the reverse order is still safe. A history test pins
  this.
- **C-2: `slot_destinations` row ids are unstable.** The table has a composite
  primary key, and the app's delete inverse doesn't restore the rowid, so older
  `DELETE … WHERE rowid=` inverses can miss. **Decision:** add
  `id INTEGER PRIMARY KEY` plus `UNIQUE(transition_id, slot_index)`. The change
  log still keys by transition id.
- **C-3: Drizzle can't declare STRICT tables.** **Decision:** put
  `CHECK(typeof(col) = 'integer')` (or `IN ('integer','real')`) on every column
  I-N1 covers, declared in `schema.ts` so they survive generated rebuilds. Known
  difference: integer affinity coerces the text `'5'` to 5, where STRICT would
  reject it. Adapt QA-DB-27.
- **C-4: Table names.** New tables are `timelines`, `timeline_shapes`,
  `timeline_transitions`, `timeline_assignments`,
  `timeline_slot_destinations` and `timeline_change_log`. Column names follow
  the spec, so `ref/` maps one-to-one.
- **C-5: Marcher home.** Add `home_x` and `home_y` (REAL, NOT NULL DEFAULT 0,
  CHECK ≤ 1e6) to `marchers`, seeded from page 0. Accept this only if
  drizzle-kit emits `ADD COLUMN` and not a table rebuild; otherwise fall back to
  a 1:1 `timeline_marcher_homes` table. Afterwards, recreate the `marchers`
  history triggers, because they snapshot the column list.
- **C-6: Undo lacks the §6 write wrapper.** `executeHistoryAction` must also
  check `commit_violations` and drain the change log inside its transaction.
- **C-7: Beats instead of wall-clock time.** Today's playback interpolates over
  milliseconds; the resolver interpolates over beats. Pages with uneven tempo
  animate differently between pages, but still match at every page boundary.
  This change in behavior is accepted and documented.
- **C-8: Page features the spec can't express.** These block the flip
  (Phase 9), not earlier phases:
  - pathways and midsets (only `direct`, `arc` and `follow_the_leader` exist,
    and there's no sub-beat authoring, Q-6);
  - old SVG shapes with curves (the spec's `freehand` is a polyline).

  The converter keeps their page-end coordinates exactly, as individual
  destinations. The curved motion in between needs a spec decision: a new path
  style, or accepting the loss.

## 3. Phases

| Phase                                  | Title                                       | Depends on |
| -------------------------------------- | ------------------------------------------- | ---------- |
| [0](phases/00-decisions.md)            | Decisions, ADR, spec in repo                | —          |
| [1](phases/01-core-geometry-oracle.md) | Geometry, oracle, validators (core)         | 0          |
| [2](phases/02-core-resolver.md)        | Cached incremental resolver (core)          | 1          |
| [3](phases/03-storage.md)              | Storage schema and triggers (desktop)       | 0          |
| [4](phases/04-write-path-undo.md)      | Write wrapper, db-functions, undo, e2e fuzz | 2, 3       |
| [5](phases/05-rendering.md)            | Resolver host, time mapping, rendering      | 4          |
| [6](phases/06-converter.md)            | Page→timeline converter                     | 5          |
| [7](phases/07-page-parity.md)          | Parity with page workflows                  | 6          |
| [8](phases/08-authoring-ui.md)         | Timeline authoring MVP                      | 7          |
| [9](phases/09-flip.md)                 | Flip: convert on open                       | 8, C-8     |
| [10](phases/10-cleanup.md)             | Cleanup of page-era tables                  | 9          |

```text
0 ─┬─> 1 ─> 2 ─┐
   └─> 3 ──────┴─> 4 ─> 5 ─> 6 ─> 7 ─> 8 ─> 9 ─> 10
```

Phases 1–2 and Phase 3 can run in parallel. Inside a phase, work packages
marked "parallel" can have separate owners.

## 4. Traceability (spec → phase)

| Spec                            | Phase                    |
| ------------------------------- | ------------------------ |
| §5, §6 DDL and invariants       | 3, 4                     |
| §6.1 undo and redo              | 4                        |
| R-E1 anchored range edits       | 4 (ripple variants in 7) |
| §7 time model                   | 5                        |
| §8 R-1 to R-13, §8.9 to §8.11   | 1                        |
| §9 caching and invalidation     | 2                        |
| §10.1 API                       | 1, 2                     |
| §10.2 change log and batches    | 3, 4                     |
| §11 export                      | 7                        |
| QA-DB                           | 3, 4                     |
| QA-UNDO, QA-INV-09              | 4                        |
| QA-FL, QA-GV, QA-DG, QA-P       | 1                        |
| QA-INV-01 to -08, QA-REG, QA-CX | 2                        |
| QA-SC, QA-PF                    | 5, 8                     |

## 5. Risks

- **Undo is the sharpest edge** (C-1, C-2, C-6). Mitigation: Phase 4 runs the
  end-to-end fuzzer against the app's real undo.
- **Converting is irreversible.** Mitigation: a backup before converting, a
  file-format version bump, and tests that positions match exactly at page
  boundaries.
- **Page parity (Phase 7) is the long pole.** Mitigation: its first work
  package inventories every reader and writer of `marcher_pages`.
- **One IPC call per statement.** A cold build is a few table reads, but ripple
  procedures on large shows need measuring.
- **Change-log leaks** from writes that bypass the wrapper. Mitigation: drain
  on open, plus a debug assertion that the log is empty after every drain.
- **Spec churn.** The ported golden vectors and properties are the contract, so
  a spec change shows up as a failing test.

## 6. Open questions

Q-1 to Q-14 stay as the spec describes. Q-1 and Q-2 get page-scoped answers in
Phase 7. Q-3, Q-4, Q-8, Q-13 and Q-14 come due in Phase 8. This plan adds C-1,
C-2, C-3 and C-8 for the spec's authors.
