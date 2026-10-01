---
phase: 6
title: Page→timeline converter
status: in-progress
owner: timeline-worker (timeline/p6-converter)
branch: timeline/p6-converter
pr: none
depends_on: [5]
updated: 2026-09-29
---

# Phase 6: Page→timeline converter

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

A converter that turns a page show into timeline data with positions **exactly equal** to `marcher_pages` at every page boundary, and a per-page report of anything it can't carry over (C-8). Run on demand behind the dev flag; not yet on open.

## Read first

- [implementation-plan.md](../implementation-plan.md) C-7, C-8
- `apps/desktop/src/hooks/queries/useCoordinateData.ts` (`getMarcherTimelines`: which page's coordinates are reached when), pathway and midset tables in `schema.ts`
- Spec D-16, R-13 (individual destinations)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P6.1: Confirm page semantics

- Owner: timeline-worker (timeline/p6-converter)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/17
- Parallel: no
- Depends on: —

Confirm the page semantics in code: which beat range each page's move covers, and where page 0 sits. Log the answer with file references before writing the converter.

### P6.2: Converter

- Owner: timeline-worker (timeline/p6-converter)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/17
- Parallel: no
- Depends on: P6.1

Pure converter (desktop-side, reading via Drizzle): homes from page 0; one timeline; per page N ≥ 1 one shapeless `direct` transition over page N's beats, one slot per marcher, `slot_destinations` from `marcher_pages(N)`, and one layer-0 assignment per marcher.

### P6.3: Loss report

- Owner: timeline-worker (timeline/p6-converter)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/17
- Parallel: yes
- Depends on: P6.2

Loss report per page: pathways, midsets and curved SVG shapes, which are kept only at page ends (C-8).

### P6.4: Dev command

- Owner: timeline-worker (timeline/p6-converter)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/17
- Parallel: yes
- Depends on: P6.2

Dev command that runs the converter as one `transactionWithHistory` edit, so it can be undone.

### P6.5: Converter tests

- Owner: timeline-worker (timeline/p6-converter)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/17
- Parallel: yes
- Depends on: P6.4

Tests on fixture shows (including the e2e fixtures): resolver positions equal `marcher_pages` bit for bit at every page boundary; in between they match the old keyframes when tempo is uniform and there are no pathways; undo removes everything.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [x] P6.5 passes
- [ ] The converter has been run on at least three real shows, with loss reports logged

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- None yet.
- Page and beat positions: the fixed beat at position 0 has zero length (see the Phase 5 handoff notes). Map page N's transition range from beat positions as ADR 0001 says, and remember that positions in [0, 1) never play.
- Decided 2026-09-30 (P7.14): `marcher_pages`' appearance overrides, `rotation_degrees` and `notes` are dropped (never implemented). The converter copies only x and y; its loss report should list any non-empty values it finds.
- Converter follow-ups (from the PR #17 review): (1) a marcher with no row on a page in the MIDDLE of the show currently holds; page mode glides from its previous row to its next. Match page mode by giving it a slot on that page whose destination is the page-mode position at the page's end beat (linear in time between its neighbors), reported as "interpolated"; keep "hold" only when no later row exists. Gaps only come from damaged files, since creating a marcher writes a row on every page. (2) Assignments are inserted one statement each (about 12,500 for 250 marchers × 50 pages, plus undo and change-log rows); before the open-time conversion (Phase 9) add a bulk path with chunked multi-row inserts (row triggers still run per row). (3) Add tests with uneven tempo and with a page that has no beats.
- Precision (found in P6): the change-log triggers write marcher homes and slot-destination x/y into JSON with 15 significant digits, so a running resolver store is about 4e-12 off until it rebuilds. Being fixed separately (`printf('%!.17g', …)` in the trigger images).
- Precision fix (2026-09-30): PR https://github.com/AlexDumo/OpenMarch-timeline/pull/18 renders those REAL values at full precision in the trigger images and refreshes the change-log triggers on every file open. Once it merges the live store is exact: the `1e-9` tolerance in `pageConversion.test.ts` is already removed there, so compare against the rows with `Object.is`.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-09-30 · timeline-worker (timeline/p6-converter) · P6.1

- **Done:** P6.1 page semantics confirmed in code, reusing P5.5's mapping (`pageEndBeat` in `apps/desktop/src/timeline/timelineCanvas.ts`):
  - Beats: `fromDatabasePages` (`apps/desktop/src/global/classes/Page.ts`) sorts `beats` by `position` and gives each its 0-based index in that order. ADR 0001 §2 makes that index the timeline beat ("beat `n` is the start of the `n`th row of `beats` ordered by `position`").
  - Page 0 (`FIRST_PAGE_ID`, `src/db-functions/page.ts`) holds only beat 0, which has zero length; its `marcher_pages` rows are the start positions, at show time 0. The converter seeds `marchers.home_x/home_y` from them (C-5).
  - Page N ≥ 1 covers the sorted beats from its start beat up to the next page's start beat (the last page: `utility.last_page_counts` beats, clamped to the beat count). Its `marcher_pages` row is the position when those beats are done: `getMarcherTimelines` (`src/hooks/queries/useCoordinateData.ts`) puts the keyframe at `(page.timestamp + page.duration) * 1000`, and `getCoordinatesAtTime` (`src/utilities/Keyframes.ts`) interpolates linearly in milliseconds from the previous page's keyframe (or along the pathway of the destination row, `path_data_id`).
  - So page N's move is the beat range `[beats[0].index, pageEndBeat(page))` = `[start beat of N, last.index + 1)`, and its end beat is the next page's start beat (the show end for the last page; page 0 → 1). This equals `beatAtTime(beats, page.timestamp + page.duration)`, which P5.5's tests check.
  - Midsets are already ignored by page-mode playback (the midset code in `getMarcherTimelines` is commented out); pathways are not.
- **Checks:** reading only.
- **Next:** P6.2 converter in `apps/desktop/src/timeline/convert/`.
- **Blockers:** none.
- **Resume from:** check out `timeline/p6-converter` on the fork; write the pure planner `src/timeline/convert/planPageConversion.ts`, then the reader/writer.

### 2026-09-30 · timeline-worker (timeline/p6-converter) · P6.2, P6.3, P6.4

- **Done:** checkpoint 5a5313f2 on `timeline/p6-converter`. `apps/desktop/src/timeline/convert/planPageConversion.ts` (pure planner and loss report), `writePageConversion.ts` (reads the page model inside the edit, refuses E-ARGS when timeline rows exist unless `replace`, writes through the db-functions in one `transactionWithHistory`), `convertPages` on the dev console API (`fixtures/timelineFixtures.ts`), `getMarcherTimelines` exported for the tests. Pure tests in `src/timeline/__test__/planPageConversion.test.ts`.
- **Checks:** `tsc --noEmit` (pass); `test:focused src/timeline/__test__/planPageConversion.test.ts` (10 passed).
- **Next:** real-DB tests (P6.5) on the `marchersAndPages` fixture.
- **Blockers:** none.
- **Resume from:** check out `timeline/p6-converter` (5a5313f2); write `apps/desktop/src/timeline/__test__/pageConversion.test.ts` (boundary positions bit for bit, keyframe match between pages, undo, refusal and replace, loss report, only page 0), then run it with `test:focused` and `test:history`.

### 2026-09-30 · timeline-worker (timeline/p6-converter) · P6.2, P6.3, P6.4, P6.5

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/17 (commit 16a68ab8, squashed and rebased on `timeline-try-2`).
  - `apps/desktop/src/timeline/convert/planPageConversion.ts`: the pure planner and the loss report.
  - `apps/desktop/src/timeline/convert/writePageConversion.ts`: reads the page model inside the edit, then writes through the db-functions in one `transactionWithHistory` edit (`convertPagesToTimeline`).
  - `window.openmarchTimeline.convertPages({ replace? })`: in development builds only, while the flag is on (P6.4).
  - Tests in `src/timeline/__test__/planPageConversion.test.ts` and `pageConversion.test.ts` (P6.5).
- **Converter decisions:**
  - Homes come from page 0. A marcher with no page-0 row takes its first later row, and one with no rows keeps its home; both are reported.
  - One timeline, "Converted from pages", over `[0, end of last page)`, at least `[0, 1)`. A show with only page 0 still gets it, so a second run is refused.
  - Each page N ≥ 1 becomes one shapeless `direct` transition over `[first beat, pageEndBeat)`. Its slots are the marchers with a row on N, in ascending id, with destinations copied exactly from `marcher_pages`, and each gets one layer-0 assignment.
  - A marcher missing a row on page N holds there (no assignment); page mode would glide instead. Reported in `missingMarchers`.
  - A page with no beats or no rows gets no transition. Reported in `skipped`.
  - Existing timelines or timeline shapes make the converter refuse with E-ARGS. `{ replace: true }` deletes them in the same edit.
  - Only x and y are copied. Per the lead's note, `rotation_degrees`, `notes` and the appearance overrides are dropped, and `droppedFields` counts the rows that had them on each page.
  - The loss report lists pathways and curved shapes (kept only at page ends) and midsets (dropped) per page.
- **Finding:** the change-log JSON images round REAL columns to 15 significant digits, so a running store's mirror is off by about 4e-12 until a cold build. Recorded in `findings.md`; not fixed here because it touches the Phase 3/4 change-log contract.
- **Checks:**
  - `pnpm install`: pass.
  - `turbo run build --filter=@openmarch/desktop^...`: pass.
  - `tsc --noEmit`: pass.
  - `test:focused` on the two converter files: 18 passed.
  - `test:history` on `pageConversion`, `planPageConversion`, `timelineFixtureLoad` and `timelineDevApi`: 4 files, 43 passed.
  - `pnpm --dir apps/desktop run test`, run before the dropped-fields follow-up: 101 files passed, 7 skipped; 1,564 tests passed.
  - Mutation check: an end beat shifted by +1 fails 11 tests.
  - eslint, prettier and cspell on the changed files: pass.
  - Not run (policy): the full `test:history` suite, e2e and `build:electron`.
- **Exit gate:**
  - "P6.5 passes" is not ticked: it becomes true on the base only when the PR merges.
  - "Run on three real shows" is still open: no real show files are available to this worker, and the e2e mock database is blank.
- **Next:** review and merge by the lead; run `convertPages()` on three real shows and log their reports.
- **Blockers:** none.

### 2026-09-30 · lead session · P6.1 to P6.5 (reviewed and merged)

- **Done:** fork PR #17 reviewed by a sub-agent (APPROVE WITH NITS, no correctness bugs: page N ≥ 1 becomes a shapeless direct transition over its beats with destinations copied exactly; page ends are exact and between pages it matches page mode under uniform tempo; one undoable edit through the real db-functions; no intermediate state the triggers reject; the loss report is accurate per page, including the dropped page extras). Merged. P6.1 to P6.5 set to done; "P6.5 passes" ticked. Follow-ups are in the handoff notes.
- **Checks:** at the PR head: tsc (pass); `test:history` on pageConversion, planPageConversion, timelineFixtureLoad and timelineDevApi (4 files, 43 passed); the worker's regular desktop suite (101 files, 1,564 passed, before its last small commit).
- **Next:** the precision fix; then Phase 7.
- **Blockers:** the exit-gate item "run on at least three real shows" needs real `.dots` files, which the workers don't have (a person, or files added to the repo for testing).
