# Timeline Resolution Model: Implementation Plan

- Spec: `docs/timeline/spec.md` (v0.7), with its reference suite in `docs/timeline/ref/`.
- Date: 2026-09-29
- Direction: timelines **replace** pages. Existing shows are converted on open (Phase 9). Until then, everything sits behind a dev flag.
- Working protocol and status board: [README.md](README.md). Per-phase work: [phases/](phases/).

This file holds the context every phase shares: repo facts, the conflicts
between the spec and the app, dependencies, and risks. Phase files cite
conflicts by ID (`C-n`). Change this file only to record a decision, and log
that change in the phase that made it.

## Current focus: Validation phase

The project is now validating a smaller MVP under
[validation-plan.md](validation-plan.md): timeline and page creation interaction,
with shapes excluded and all pathways assumed linear. This is a validation
priority, not a change to the spec, implementation scope, or phase statuses.
Validate that workflow first; defer broader feature validation until the project
owner accepts it. Existing safety and release gates remain required.

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
  Exception, confirmed in P4.8: a deleted marcher is still logged before its
  cascaded assignments (the history trigger is BEFORE DELETE and
  marcher→assignment keeps CASCADE). Undo stays exact only because replay
  runs with foreign keys off and no assignment trigger reads `marchers`; a
  future check on assignments that reads `marchers` would break it. Batch
  consumers must not assume parent-first order.

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
- **C-5: Marcher home.** **Decided in P3.1 (reworked at the project owner's
  request): homes are columns on `marchers`.** `home_x` and `home_y` are
  `REAL NOT NULL DEFAULT 0` with named CHECKs `marchers_home_<x|y>_type_check`
  (`typeof(…) IN ('integer', 'real')`) and `marchers_home_<x|y>_check`
  (`abs(…) <= 1e6`), declared in `schema.ts`. The converter seeds them from
  page 0; existing marchers start at the origin. With those CHECKs, drizzle-kit
  emits a `marchers` table rebuild whose `INSERT … SELECT` copies
  `home_x`/`home_y` from the old table, where they don't exist yet. Migration
  `0017_powerful_edwin_jarvis.sql` hand-edits that rebuild into two
  `ALTER TABLE marchers ADD COLUMN … CONSTRAINT … CHECK(…)` statements that use
  the snapshot's constraint names, so the snapshot still matches `schema.ts`
  and a repeated `drizzle-kit generate` reports no changes. Why columns and
  not a side table: every marcher always has a home, so there is no second row
  to create or keep in sync with the marcher; undo and redo cover homes through
  the existing `marchers` history triggers; and `ADD COLUMN` leaves `marchers`
  and every row that references it untouched. The change-log triggers
  `timeline_log_marchers_ins/upd/del` log only `id` and `home` (the update
  trigger fires only `OF home_x, home_y`). Because `marchers` gained columns,
  its history triggers must be recreated in files that already have them
  (P3.5).
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
  **Decided (project owner, 2026-10-01):** pathways and midsets were never
  implemented and are dropped. SVG page shapes convert to individual
  destinations; page mode moves in straight lines between pages, so only the
  editable curve is lost. See ADR 0001. P6.6 verifies conversion equality on
  real shows.

- **C-9: Recognizing a converted file at version 7.** Releases without the
  version guard reset `user_version` to 7, so the version alone can't show
  that a file was converted. **Decided (lead, 2026-10-01, P9.3):** the
  conversion transaction, and the creation of a new file with convert on open
  on, write `timelineConvertedAt` (an ISO time) into the workspace settings
  JSON. A version-7 file with that key always gets the "saved by an older
  version" warning; one with timeline rows and neither the key nor a
  conversion backup is a dev-flag file and opens silently. An older release
  that saves the workspace settings drops unknown keys, so the backup next to
  the file remains a second signal. To be added to ADR 0001 §6 (text in the
  Phase 9 log).
- **C-10: Freezing the page-era tables (P9.5).** In timeline mode, `marcher_pages`,
  `midsets`, `pathways`, `shapes`, `shape_pages` and `shape_page_marchers` refuse
  INSERT, UPDATE and DELETE through BEFORE triggers named
  `page_era_frozen_<table>_<ins|upd|del>`. They fire only while
  `workspace_settings.json_data` has `timelineMode` set to JSON `true`. They live
  in the `triggers.ts` map, are rebuilt on every open and are checked again for
  staleness. Exception: a row whose parent (marcher, page, marcher page, shape or
  shape page) is already gone may be deleted, and inserted while foreign keys are
  off. That keeps marcher and page deletes cascading, lets repair remove orphans,
  and lets undo and redo of those deletes replay. The app refuses the same writes
  first with `E-ARGS`. An undo or redo the freeze refuses (dev-flag history, or
  timeline-mode history from before P9.5) is removed from its stack, and the user
  is told it was skipped; any other failed undo or redo is reported and leaves the
  stacks alone. Repair lifts the freeze while it copies. Consequence: a release
  without the version guard that opens a converted file can't edit its page-era
  tables. Phase 10 must remove these triggers from the map before dropping the
  tables.

- **C-11: Transitions span their timeline.** **Decided (project owner,
  2026-10-01):** a timeline is the container for start and stop. It can own
  several transitions, but every one of them starts and ends exactly when the
  timeline does; no transition starts or stops partway through a timeline.
  Assignments keep their own ranges inside the transition, so marchers still
  join late, leave early, and are stolen through layers (R-2). The transition
  keeps its `start_beat`/`end_beat` columns as a mirror of the timeline's
  range, so the resolver, `ref/` and the golden vectors are unchanged (a
  timeline has no effect on resolution, R-1). Enforcement: the write functions
  refuse a transition whose range differs from its timeline's (E-ARGS), and
  every range edit moves the timeline and all its transitions together
  (P8.10). The database check is an `E-T1` row in
  `timeline_commit_violations`, checked at commit (P9.10), now that the
  converter writes one timeline per page move. A file converted by an earlier
  development build (one show-wide timeline) fails every edit with E-T1 and
  must be converted again by hand; open doesn't repair it (project owner,
  2026-10-02). Recorded in ADR 0001.

- **C-12: Pages are cosmetic flags; the selected timeline is the editing
  context.** **Decided (project owner, 2026-10-01):** a page owns no motion.
  A page is named by its end flag, where marchers arrive: its box stands for
  the timeline from the previous flag to its own flag (its page timeline),
  and selecting a timeline replaces selecting a page. Timelines track the
  page (an edge on a flag follows it), but the page owns no motion. Home
  (page 0) selects no timeline and edits homes. UI-9 in `ui.md` has the
  interaction; P8.11 and P8.13–P8.15 build it and P8.12 removes the selected
  page. Recorded in ADR 0001.
  - **Consequences for the model.**
    - Empty timelines aren't created: a page timeline not yet stored (or a
      dragged range) is created when marchers are first added to it. But
      removing marchers never deletes a timeline, so a stored timeline can be
      empty; P8.10's rule that a timeline goes with its last transition
      doesn't apply to removal.
    - New marchers join every stored timeline, each with its own one-slot
      transition whose destination is its home (P7.3's join, one transition
      per marcher).
    - Canvas edits are refused while the playhead isn't on the selected
      timeline's end (temporary; editing anywhere comes later).
    - At most one timeline has a given range; the write functions refuse a
      second (E-ARGS). Groups over the same counts are transitions in one
      timeline (UI-8).
    - A marcher has at most one transition per timeline. Adding it gives it
      its own one-slot shapeless `direct` transition spanning the timeline
      (C-11), with its destination set to its position at the timeline's
      end. It sits one layer above the marcher's timelines that wholly
      contain it (R-2). Partial overlaps are refused (E-ARGS).
    - Adding or deleting a flag writes only page rows (and
      `last_page_counts` at the end of the show); no timeline is created or
      deleted, so motion is unchanged. On insert, the split page keeps its
      flag, id and data, and later pages renumber.
  - **No selected page in timeline mode.** Editing reads the selected
    timeline; rendering, playback and the inspector read the playhead. Data
    that belongs to a page reads the page containing (or ending at) the
    playhead. Marcher appearance stays by page but is sampled by time: a step
    function keyed by each flag's timestamp, as on the `coordinates-v2`
    branch. Page navigation, set to previous/next page and page paths work
    relative to flags and the selected timeline (UI-9 Page-relative tools).
    P8.11 and P8.12 remove the selected page; `SelectedPageContext` goes with
    page mode in Phase 10.
  - **Supersedes, in timeline mode:**
    - P7.4's page-edge rule and holding moves, for adding or deleting a
      page.
    - UI-3's marcher and shape tracks: one track per stored timeline.
    - P7.2's "move on page N edits the move ending at N's end beat": a canvas
      move edits the ending coordinate of the marcher's transition in the
      selected timeline.
    - UI-6's Create Track: drag a range on empty timeline space, then **Add
      selected marchers** from its context menu.
  - **Depends on P9.10.** Converted shows need range-aligned page timelines.
    Today the converter writes one show-wide timeline, so a converted show's
    page boxes have no timeline of their own.
  - **Still open (U-Q5):** where removal lives;
    appending pages, clip selection and editing off the end are TODO. Beat editing, moving marchers between
    timelines and undo's selection are in the `ui.md` backlog.

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
